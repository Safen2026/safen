import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { CameraView, type CameraRecordingOptions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';

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
  const elapsedSecondsRef = useRef(0);
  const cameraRef = useRef<CameraRef | null>(null);
  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertIdRef         = useRef<string | null>(null);
  const evidenceListRef    = useRef<string[]>([]);
  const isActiveRef        = useRef(false);
  const isMountedRef       = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      killEverything();
    };
  }, []);

  // ─── Hard-stop timers and recorders ─────────────────────────────────────────
  const killEverything = () => {
    isActiveRef.current = false;

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
  };

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
        public_id: explicitPublicId 
      });
      if (url) {
        if (__DEV__) console.log(`[Recording] ${type} upload SUCCESS:`, url);
        await syncEvidenceToAlert(alertId, url);
      }
    } catch (err) {
      console.warn(`[Recording] ${type} upload error:`, err);
    } finally {
      if (isMountedRef.current) setIsUploading(false);
    }
  }, [syncEvidenceToAlert]);

  // ─── Cycle rolling audio chunk (stop current slice, start next) ─────────────
  const cycleAudioChunk = useCallback(async (alertId: string, skipUpload: boolean = false) => {
    if (isCyclingAudioRef.current || !isActiveRef.current) return;
    isCyclingAudioRef.current = true;

    const currentRec = audioRecordingRef.current;
    if (!currentRec) { isCyclingAudioRef.current = false; return; }

    try {
      await currentRec.stopAndUnloadAsync();
      const chunkUri = currentRec.getURI();

      // Cleanly clear the ref now that it's unloaded, so stopRecording doesn't grab a dead recorder
      // if the user cancels exactly during the upcoming 800ms transition delay.
      if (audioRecordingRef.current === currentRec) {
        audioRecordingRef.current = null;
      }

      // iOS/Android Collision Fix: At exactly 60 seconds, the camera is stopping and releasing the microphone.
      // If expo-av immediately asks for the microphone here, the OS panics because the hardware is locked in transition.
      // We give the OS 800ms to gracefully shut down the camera stream before expo-av grabs it.
      if (elapsedSecondsRef.current === VIDEO_MAX_DURATION_SECONDS) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Start next slice immediately
      if (isActiveRef.current) {
        const { recording: next } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        audioRecordingRef.current = next;
      } else {
        audioRecordingRef.current = null;
      }

      if (chunkUri && !skipUpload) {
        uploadChunk(chunkUri, 'audio', alertId);
      } else if (skipUpload) {
        if (__DEV__) console.log('[Recording] Skipped uploading audio chunk (video covered this period).');
      }
    } catch (err) {
      console.warn('[Recording] Audio cycle error:', err);
      audioRecordingRef.current = null;
    } finally {
      isCyclingAudioRef.current = false;
    }
  }, [uploadChunk]);

  // ─── Start video recording on whatever camera is currently bound ───────────
  const startVideoRecording = useCallback((cam: CameraRef, alertId: string) => {
    if (!cam || !isActiveRef.current || !isAudioReadyRef.current || elapsedSecondsRef.current >= VIDEO_MAX_DURATION_SECONDS) return;
    
    const recordFn = cam.recordAsync ?? cam.record;
    if (typeof recordFn !== 'function') {
      console.warn('[Recording] Camera ref has no recordAsync/record function.');
      return;
    }
    
    if (__DEV__) console.log('[Recording] Starting camera 15s video chunk recording…');
    recordFn.call(cam, {})
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
        // Native MediaRecorder cool-down: wait 600ms to allow Android/iOS hardware encoder pipeline 
        // to fully flush and release before opening the next recording chunk.
        if (isActiveRef.current && elapsedSecondsRef.current < VIDEO_MAX_DURATION_SECONDS) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (isActiveRef.current && elapsedSecondsRef.current < VIDEO_MAX_DURATION_SECONDS) {
            if (__DEV__) console.log('[Recording] Re-starting next 15s video chunk…');
            startVideoRecording(cam, alertId);
          }
        }
      });
  }, [uploadChunk]);

  // ─── START ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (alertId: string) => {
    // 1. Kill previous session's timer and camera SYNCHRONOUSLY
    //    (don't touch audioRecordingRef yet — we await-stop it below)
    isActiveRef.current = false;
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

      // Video Chunking: Every 15s during the first minute, stop the camera.
      // This forces the current 15s video segment to save and upload immediately.
      // The 600ms cool-down in startVideoRecording's .finally() then cleanly starts the next 15s chunk!
      if (elapsed > 0 && elapsed <= VIDEO_MAX_DURATION_SECONDS && elapsed % AUDIO_CHUNK_INTERVAL_SECONDS === 0) {
        safeStopCamera(cameraRef.current);
      }

      if (elapsed % AUDIO_CHUNK_INTERVAL_SECONDS === 0) {
        // We do NOT want to upload ANY audio chunks during the first 60s 
        // because the video recording is capturing the audio for that entire minute.
        const isDuringFirst60s = elapsed <= VIDEO_MAX_DURATION_SECONDS;
        cycleAudioChunk(alertId, isDuringFirst60s);
      }
      if (elapsed === VIDEO_MAX_DURATION_SECONDS) {
        if (isMountedRef.current) setPhase('recording_audio_background');
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

    // 6. Request permissions and start fresh audio recording
    //    Failures here are non-fatal — timer is already running
    try {
      await Audio.requestPermissionsAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         true,
        playsInSilentModeIOS:       true,
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

    // 7. Start camera video if it is already bound and ready
    if (isActiveRef.current && cameraRef.current) {
      startVideoRecording(cameraRef.current, alertId);
    }

    return true;
  }, [cycleAudioChunk, startVideoRecording]);

  // ─── STOP ──────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!isActiveRef.current && !alertIdRef.current) return;

    const alertId = alertIdRef.current;
    isActiveRef.current = false;

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
          // If we stopped before 60s, the video chunk covers this time period entirely.
          // Discard the audio chunk so the receiver doesn't get duplicates.
          if (elapsedSecondsRef.current <= VIDEO_MAX_DURATION_SECONDS) {
            if (__DEV__) console.log(`[Recording] Discarding final audio chunk (cancelled at ${elapsedSecondsRef.current}s, video covers this).`);
          } else {
            if (__DEV__) console.log('[Recording] Uploading final audio chunk in background:', uri);
            uploadChunk(uri, 'audio', alertId);
          }
        }
      } catch (err) {
        console.warn('[Recording] Final audio unload error:', err);
      }
    }
  }, [uploadChunk]);

  const bindCameraRef = useCallback((ref: CameraView | null) => {
    cameraRef.current = ref as unknown as CameraRef | null;
    // If SOS is already active AND audio session is ready when camera mounts, start video immediately
    if (isActiveRef.current && isAudioReadyRef.current && alertIdRef.current && ref) {
      if (__DEV__) console.log('[Recording] Camera mounted during active SOS — starting video now.');
      startVideoRecording(ref as unknown as CameraRef, alertIdRef.current);
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
  };
}
