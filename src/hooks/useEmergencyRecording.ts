import { useState, useRef, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Audio } from 'expo-av';
import { CameraView, type CameraRecordingOptions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import { enqueuePendingUpload, flushOfflineMediaQueue } from '../lib/offlineMediaQueue';

/** Minimal interface for the CameraView imperative handle we actually use. */
interface CameraRef {
  recordAsync?: (options?: CameraRecordingOptions) => Promise<{ uri: string } | undefined>;
  record?: (options?: CameraRecordingOptions) => Promise<{ uri: string } | undefined>;
  stopRecording?: () => void | Promise<void>;
  takePictureAsync?: (options?: import('expo-camera').CameraPictureOptions) => Promise<{ uri: string } | undefined>;
}

export type RecordingPhase =
  | 'idle'
  | 'recording_video_audio'
  | 'recording_audio_background'
  | 'completed'
  | 'error';

export interface EmergencyRecordingState {
  isRecording: boolean;
  phase: RecordingPhase;
  durationSeconds: number;
  uploadedEvidence: string[];
  isUploading: boolean;
}

const VIDEO_MAX_DURATION_SECONDS = 60;
const AUDIO_CHUNK_INTERVAL_SECONDS = 15;
// How many seconds before the nominal boundary we trigger cycleAudioChunk.
// This gives the JS thread time to stop + restart cleanly so the actual
// captured audio in each slice is the full 15 s rather than ~14 s.
const CYCLE_AHEAD_SECONDS = 1;

function safeStopCamera(camRef: CameraRef | null) {
  if (!camRef?.stopRecording) return;
  try {
    const res = camRef.stopRecording();
    if (res && typeof (res as any).catch === 'function') {
      (res as any).catch(() => {});
    }
  } catch (e) {
    // silently ignore
  }
}

export function useEmergencyRecording() {
  const [isRecording,      setIsRecording]      = useState(false);
  const [phase,            setPhase]            = useState<RecordingPhase>('idle');
  const [durationSeconds,  setDurationSeconds]  = useState(0);
  const [uploadedEvidence, setUploadedEvidence] = useState<string[]>([]);
  const [isUploading,      setIsUploading]      = useState(false);

  const audioRecordingRef = useRef<Audio.Recording | null>(null);
  const isCyclingAudioRef = useRef(false);
  const isAudioReadyRef = useRef(false);
  const isCameraReadyRef = useRef(false);
  const isVideoRecordingRef = useRef(false);
  const elapsedSecondsRef = useRef(0);
  const cameraRef = useRef<CameraRef | null>(null);
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertIdRef         = useRef<string | null>(null);
  const evidenceListRef    = useRef<string[]>([]);
  const isActiveRef        = useRef(false);
  const isMountedRef       = useRef(true);

  // ─── Hard-stop timers and recorders ─────────────────────────────────────────
  // useCallback so the reference is stable across renders and it is safe to
  // list as a dependency in the cleanup effect and any future effects.
  const killEverything = useCallback(() => {
    isActiveRef.current = false;
    isVideoRecordingRef.current = false;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    safeStopCamera(cameraRef.current);
    if (audioRecordingRef.current) {
      try { 
        audioRecordingRef.current.stopAndUnloadAsync(); 
      } catch (e: unknown) {
        console.error('[useEmergencyRecording] Failed to stop/unload old audio:', e);
      }
      audioRecordingRef.current = null;
    }
    isCyclingAudioRef.current = false;
    isAudioReadyRef.current = false;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void flushOfflineMediaQueue();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void flushOfflineMediaQueue();
      }
    });

    return () => {
      isMountedRef.current = false;
      sub.remove();
      killEverything();
    };
  }, [killEverything]);

  // ─── Sync one Cloudinary URL into the DB row ────────────────────────────────
  const syncEvidenceToAlert = useCallback(async (alertId: string, url: string) => {
    evidenceListRef.current = [...evidenceListRef.current, url];
    if (isMountedRef.current) setUploadedEvidence([...evidenceListRef.current]);

    try {
      const { error } = await supabase
        .from('alerts')
        .update({ media_paths: evidenceListRef.current })
        .eq('id', alertId);
      if (error) {
        console.warn('[Recording] DB sync error:', error.message);
      } else {
        if (__DEV__) console.log(`[Recording] Successfully synced media to alert ${alertId}:`, url);
      }
    } catch (err) {
      console.warn('[Recording] DB sync failed:', err);
    }
  }, []);

  // ─── Upload one media chunk in the background ──────────────────────────────
  const uploadChunk = useCallback(async (uri: string, type: 'snapshot' | 'video' | 'audio', alertId: string) => {
    if (!uri || !alertId) return;

    if (isMountedRef.current) setIsUploading(true);
    try {
      if (__DEV__) console.log(`[Recording] Uploading ${type} (${uri})…`);
      const explicitPublicId = `${type}_${Date.now()}`;
      const url = await uploadToCloudinary(uri, { 
        folder: `safen/emergency_${alertId}`,
        public_id: explicitPublicId,
        resourceType: type === 'video' ? 'video' : type === 'audio' ? 'audio' : 'image',
      });
      if (url) {
        if (__DEV__) console.log(`[Recording] ${type} upload SUCCESS:`, url);
        await syncEvidenceToAlert(alertId, url);
        void flushOfflineMediaQueue();
      } else {
        await enqueuePendingUpload({ uri, type, alertId });
      }
    } catch (err) {
      console.warn(`[Recording] ${type} upload error, queueing for retry:`, err);
      await enqueuePendingUpload({ uri, type, alertId });
    } finally {
      if (isMountedRef.current) setIsUploading(false);
    }
  }, [syncEvidenceToAlert]);

  // ─── Cycle rolling audio chunk (overlap-start for gapless 15 s slices) ──────
  //
  // Strategy: start the NEXT recording BEFORE stopping the current one.
  // This eliminates the ~1 s gap that caused only ~14 s of audio to be captured
  // in each slice. We:
  //   1. Create the new Recording object (OS begins buffering immediately)
  //   2. Stop + unload the old one (its already-buffered bytes are flushed to disk)
  //   3. Upload the old URI in the background
  //
  // Guard: isCyclingAudioRef prevents concurrent cycles if the interval fires
  // while a previous cycle hasn't finished yet.
  const cycleAudioChunk = useCallback(async (alertId: string, skipUpload: boolean = false) => {
    if (isCyclingAudioRef.current || !isActiveRef.current) return;
    isCyclingAudioRef.current = true;

    const currentRec = audioRecordingRef.current;
    if (!currentRec) {
      // Recovery guard: if previous cycle failed to start a slice, attempt restart now
      if (isActiveRef.current) {
        try {
          const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          audioRecordingRef.current = recording;
        } catch (recoverErr) {
          console.warn('[Recording] Audio recovery failed:', recoverErr);
        }
      }
      isCyclingAudioRef.current = false;
      return;
    }

    try {
      // 1. Stop + unload the completed slice first, releasing the hardware microphone.
      audioRecordingRef.current = null;
      await currentRec.stopAndUnloadAsync();
      const chunkUri = currentRec.getURI();

      // 2. Upload the completed slice in the background.
      if (chunkUri && !skipUpload) {
        uploadChunk(chunkUri, 'audio', alertId);
      } else if (skipUpload) {
        if (__DEV__) console.log('[Recording] Skipped uploading audio chunk.');
      }

      // 3. Start the next slice with the microphone hardware now cleanly available.
      if (isActiveRef.current) {
        try {
          const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          audioRecordingRef.current = recording;
        } catch (startErr) {
          console.warn('[Recording] Could not start next audio slice:', startErr);
          audioRecordingRef.current = null;
        }
      }
    } catch (err) {
      console.warn('[Recording] Audio cycle error:', err);
    } finally {
      isCyclingAudioRef.current = false;
    }
  }, [uploadChunk]);

  // ─── Start video recording on whatever camera is currently bound ───────────
  const startVideoRecording = useCallback((cam: CameraRef, alertId: string) => {
    if (
      !cam ||
      !isActiveRef.current ||
      !isCameraReadyRef.current ||
      isVideoRecordingRef.current ||
      elapsedSecondsRef.current >= VIDEO_MAX_DURATION_SECONDS
    ) {
      return;
    }
    
    const recordFn = cam.recordAsync ?? cam.record;
    if (typeof recordFn !== 'function') {
      console.warn('[Recording] Camera ref has no recordAsync/record function.');
      return;
    }
    
    isVideoRecordingRef.current = true;
    if (__DEV__) console.log('[Recording] Starting camera 15s video chunk recording…');

    // Camera is muted so native MediaRecorder has 0 hardware microphone conflict with expo-av.
    // maxDuration: 15 tells native camera to cut each chunk at 15s.
    recordFn.call(cam, { maxDuration: 15 })
      .then((result: { uri: string } | undefined) => {
        if (result?.uri) {
          if (__DEV__) console.log('[Recording] Video chunk captured, uploading:', result.uri);
          uploadChunk(result.uri, 'video', alertId);
        } else {
          console.warn('[Recording] recordAsync resolved with no URI:', result);
        }
      })
      .catch((err: Error) => {
        const msg = err?.message?.toLowerCase() ?? '';
        if (
          msg.includes('stopped') ||
          msg.includes('cancel') ||
          msg.includes('cannot be cast') ||
          msg.includes('unable to find') ||
          msg.includes('cameraview')
        ) {
          // Camera unmounted or recording stopped cleanly — not an error
          if (__DEV__) console.log('[Recording] Camera recording chunk finished/stopped.');
        } else {
          console.warn('[Recording] Camera recordAsync error:', err);
        }
      })
      .finally(async () => {
        isVideoRecordingRef.current = false;
        // Native MediaRecorder cool-down: wait 600ms to allow Android/iOS hardware encoder pipeline 
        // to fully flush and release before opening the next recording chunk.
        if (isActiveRef.current && elapsedSecondsRef.current < VIDEO_MAX_DURATION_SECONDS && cameraRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (isActiveRef.current && elapsedSecondsRef.current < VIDEO_MAX_DURATION_SECONDS && cameraRef.current) {
            if (__DEV__) console.log('[Recording] Re-starting next 15s video chunk…');
            startVideoRecording(cameraRef.current, alertId);
          }
        }
      });
  }, [uploadChunk]);

  // ─── START ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (alertId: string) => {
    // 1. Kill previous session's timer and camera SYNCHRONOUSLY
    //    (don't touch audioRecordingRef yet — we await-stop it below)
    isActiveRef.current = false;
    isVideoRecordingRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    safeStopCamera(cameraRef.current);
    isCyclingAudioRef.current = false;
    isAudioReadyRef.current = false;

    // 2. Set alert ID and evidence list before any await
    alertIdRef.current      = alertId;
    evidenceListRef.current = [];

    // 3. Update UI state synchronously
    if (isMountedRef.current) {
      setIsRecording(true);
      setPhase('recording_video_audio');
      setDurationSeconds(0);
      setUploadedEvidence([]);
    }

    // 4. Mark active and start the countdown timer IMMEDIATELY
    //    so the UI ticks up regardless of how long audio setup takes
    isActiveRef.current = true;
    let elapsed = 0;
    elapsedSecondsRef.current = 0;

    timerRef.current = setInterval(() => {
      if (!isActiveRef.current) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        return;
      }
      elapsed += 1;
      elapsedSecondsRef.current = elapsed;
      if (isMountedRef.current) setDurationSeconds(elapsed);

      // Trigger the chunk cycle CYCLE_AHEAD_SECONDS before the nominal 15 s boundary.
      // This gives JS time to stop + restart cleanly so the actual recorded audio
      // in each slice covers the full 15 seconds (previously only ~14 s was captured
      // because stopAndUnloadAsync itself takes ~500 ms–1 s).
      //
      // Example with AUDIO_CHUNK_INTERVAL_SECONDS=15, CYCLE_AHEAD_SECONDS=1:
      //   elapsed=14 → cycle (captures seconds 0–14 = full 15 s slice)
      //   elapsed=29 → cycle (captures seconds 15–29)
      //   elapsed=44 → cycle …
      const boundary = AUDIO_CHUNK_INTERVAL_SECONDS - CYCLE_AHEAD_SECONDS;
      if (elapsed > 0 && elapsed % AUDIO_CHUNK_INTERVAL_SECONDS === boundary) {
        cycleAudioChunk(alertId, false);
      }
      if (elapsed === VIDEO_MAX_DURATION_SECONDS) {
        if (isMountedRef.current) setPhase('recording_audio_background');
        safeStopCamera(cameraRef.current);
      }
    }, 1000);

    // 5. Properly await cleanup of ANY previous audio recording before starting new one
    const oldRec = audioRecordingRef.current;
    audioRecordingRef.current = null;
    if (oldRec) {
      try { 
        await oldRec.stopAndUnloadAsync(); 
      } catch (e: unknown) {
        console.error('[useEmergencyRecording] Failed to cleanup previous audio segment:', e);
      }
    }

    // 6. Check microphone permission (read-only — never prompt during an active SOS).
    //    If the user previously denied mic access, the SOS continues broadcasting GPS
    //    coordinates and alerts; we simply skip the audio recording silently.
    try {
      const { granted } = await Audio.getPermissionsAsync();
      if (!granted) {
        if (__DEV__) console.warn('[Recording] Microphone permission not granted — skipping audio recording. SOS is still active.');
        // Mark audio ready so camera video can still proceed
        isAudioReadyRef.current = true;
        if (isActiveRef.current && cameraRef.current && isCameraReadyRef.current) {
          startVideoRecording(cameraRef.current, alertId);
        }
        return true;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         true,
        playsInSilentModeIOS:       true,
        // staysActiveInBackground requires "audio" in UIBackgroundModes (iOS)
        // and a foreground service on Android. Both are now declared.
        staysActiveInBackground:    true,
        shouldDuckAndroid:          true,
        playThroughEarpieceAndroid: false,
      });

      if (!isActiveRef.current) return true; // cancelled during setup

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      audioRecordingRef.current = recording;
      if (__DEV__) console.log('[Recording] Audio recording started.');
    } catch (err) {
      console.warn('[Recording] Audio setup failed (SOS still active, timer running):', err);
    }

    isAudioReadyRef.current = true;

    // 7. Start camera video if it is already bound and camera is ready
    if (isActiveRef.current && cameraRef.current && isCameraReadyRef.current) {
      startVideoRecording(cameraRef.current, alertId);
    }

    return true;
  }, [cycleAudioChunk, startVideoRecording]);

  // ─── STOP ──────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!isActiveRef.current && !alertIdRef.current) return;

    const alertId = alertIdRef.current;
    isActiveRef.current = false;
    isVideoRecordingRef.current = false;

    // 1. Kill timer immediately
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 2. Stop camera (this triggers camera.recordAsync promise to resolve and upload)
    safeStopCamera(cameraRef.current);

    // 3. Finalise audio slice and upload in background
    const rec = audioRecordingRef.current;
    audioRecordingRef.current = null;
    isCyclingAudioRef.current = false;

    if (isMountedRef.current) {
      setIsRecording(false);
      setPhase('completed');
    }

    if (rec && alertId) {
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) {
          if (__DEV__) console.log('[Recording] Uploading final audio chunk in background:', uri);
          uploadChunk(uri, 'audio', alertId);
        }
      } catch (err) {
        console.warn('[Recording] Final audio unload error:', err);
      }
    }
  }, [uploadChunk]);

  const bindCameraRef = useCallback((ref: CameraView | null) => {
    cameraRef.current = ref as unknown as CameraRef | null;
    // If SOS is already active and camera is ready when camera mounts, start video immediately
    if (isActiveRef.current && isCameraReadyRef.current && alertIdRef.current && ref) {
      if (__DEV__) console.log('[Recording] Camera mounted during active SOS — starting video now.');
      startVideoRecording(ref as unknown as CameraRef, alertIdRef.current);
    }
  }, [startVideoRecording]);

  const onCameraReady = useCallback(() => {
    if (__DEV__) console.log('[Recording] Native Camera is ready.');
    isCameraReadyRef.current = true;
    if (isActiveRef.current && cameraRef.current && alertIdRef.current) {
      startVideoRecording(cameraRef.current, alertIdRef.current);
    }
  }, [startVideoRecording]);

  return {
    isRecording,
    phase,
    durationSeconds,
    uploadedEvidence,
    isUploading,
    startRecording,
    stopRecording,
    bindCameraRef,
    onCameraReady,
  };
}
