import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { CameraView, type CameraRecordingOptions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';

/** Minimal interface for the CameraView imperative handle we actually use. */
interface CameraRef {
  recordAsync?: (
    options?: CameraRecordingOptions
  ) => Promise<{ uri: string } | undefined>;

  record?: (
    options?: CameraRecordingOptions
  ) => Promise<{ uri: string } | undefined>;

  stopRecording?: () => void | Promise<void>;

  takePictureAsync?: (
    options?: import('expo-camera').CameraPictureOptions
  ) => Promise<{ uri: string } | undefined>;
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

export function useEmergencyRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [uploadedEvidence, setUploadedEvidence] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const audioRecordingRef = useRef<Audio.Recording | null>(null);
  const isCyclingAudioRef = useRef(false);
  const isAudioReadyRef = useRef(false);
  const elapsedSecondsRef = useRef(0);

  const cameraRef = useRef<CameraRef | null>(null);
  const isCameraReadyRef = useRef(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertIdRef = useRef<string | null>(null);
  const evidenceListRef = useRef<string[]>([]);
  const isActiveRef = useRef(false);
  const isMountedRef = useRef(true);

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
    isCameraReadyRef.current = false;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (cameraRef.current?.stopRecording) {
      try {
        Promise.resolve(cameraRef.current.stopRecording()).catch(() => {});
      } catch {
        // Camera may already have unmounted.
      }
    }

    if (audioRecordingRef.current) {
      try {
        audioRecordingRef.current.stopAndUnloadAsync();
      } catch {}

      audioRecordingRef.current = null;
    }

    isCyclingAudioRef.current = false;
    isAudioReadyRef.current = false;
  };

  // ─── Sync one Cloudinary URL into the DB row ────────────────────────────────
  const syncEvidenceToAlert = useCallback(
    async (alertId: string, url: string) => {
      evidenceListRef.current = [...evidenceListRef.current, url];

      if (isMountedRef.current) {
        setUploadedEvidence([...evidenceListRef.current]);
      }

      try {
        const { error } = await supabase
          .from('alerts')
          .update({ media_paths: evidenceListRef.current })
          .eq('id', alertId);

        if (error) {
          console.warn('[Recording] DB sync error:', error.message);
        } else {
          console.log(
            `[Recording] Successfully synced media to alert ${alertId}:`,
            url
          );
        }
      } catch (err) {
        console.warn('[Recording] DB sync failed:', err);
      }
    },
    []
  );

  // ─── Upload one media chunk in the background ──────────────────────────────
  const uploadChunk = useCallback(
    async (
      uri: string,
      type: 'snapshot' | 'video' | 'audio',
      alertId: string
    ) => {
      if (!uri || !alertId) return;

      if (isMountedRef.current) {
        setIsUploading(true);
      }

      try {
        console.log(`[Recording] Uploading ${type} (${uri})…`);

        const explicitPublicId = `${type}_${Date.now()}`;

        const url = await uploadToCloudinary(uri, {
          folder: `safen/emergency_${alertId}`,
          public_id: explicitPublicId,
        });

        if (url) {
          console.log(`[Recording] ${type} upload SUCCESS:`, url);
          await syncEvidenceToAlert(alertId, url);
        }
      } catch (err) {
        console.warn(`[Recording] ${type} upload error:`, err);
      } finally {
        if (isMountedRef.current) {
          setIsUploading(false);
        }
      }
    },
    [syncEvidenceToAlert]
  );

  // ─── Cycle rolling audio chunk ─────────────────────────────────────────────
  const cycleAudioChunk = useCallback(
    async (alertId: string, skipUpload: boolean = false) => {
      if (isCyclingAudioRef.current || !isActiveRef.current) return;

      isCyclingAudioRef.current = true;

      const currentRec = audioRecordingRef.current;

      if (!currentRec) {
        isCyclingAudioRef.current = false;
        return;
      }

      try {
        await currentRec.stopAndUnloadAsync();

        const chunkUri = currentRec.getURI();

        // Clear the ref after unloading the recorder.
        if (audioRecordingRef.current === currentRec) {
          audioRecordingRef.current = null;
        }

        // At exactly 60 seconds, give the OS time to release the
        // microphone before expo-av tries to acquire it again.
        if (elapsedSecondsRef.current === VIDEO_MAX_DURATION_SECONDS) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        // Start next audio slice.
        if (isActiveRef.current) {
          const { recording: next } =
            await Audio.Recording.createAsync(
              Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

          audioRecordingRef.current = next;
        } else {
          audioRecordingRef.current = null;
        }

        if (chunkUri && !skipUpload) {
          uploadChunk(chunkUri, 'audio', alertId);
        } else if (skipUpload) {
          console.log(
            '[Recording] Skipped uploading audio chunk (video covered this period).'
          );
        }
      } catch (err) {
        console.warn('[Recording] Audio cycle error:', err);
        audioRecordingRef.current = null;
      } finally {
        isCyclingAudioRef.current = false;
      }
    },
    [uploadChunk]
  );

  // ─── Start video recording ─────────────────────────────────────────────────
  const startVideoRecording = useCallback(
    (cam: CameraRef, alertId: string) => {
      if (
        !cam ||
        !isActiveRef.current ||
        !isAudioReadyRef.current ||
        !isCameraReadyRef.current ||
        elapsedSecondsRef.current >= VIDEO_MAX_DURATION_SECONDS
      ) {
        return;
      }

      const recordFn = cam.recordAsync ?? cam.record;

      if (typeof recordFn !== 'function') {
        console.warn(
          '[Recording] Camera ref has no recordAsync/record function.'
        );
        return;
      }

      console.log(
        '[Recording] Starting camera 15s video chunk recording…'
      );

      recordFn
        .call(cam, {})
        .then((result: { uri: string } | undefined) => {
          if (result?.uri) {
            console.log(
              '[Recording] Video chunk captured, uploading:',
              result.uri
            );

            uploadChunk(result.uri, 'video', alertId);
          } else {
            console.warn(
              '[Recording] recordAsync resolved with no URI:',
              result
            );
          }
        })
        .catch((err: Error) => {
          const msg = err?.message?.toLowerCase() ?? '';

          if (
            msg.includes('stopped') ||
            msg.includes('cancel') ||
            msg.includes('cannot be cast') ||
            msg.includes('unable to find') ||
            msg.includes('cameraview') ||
            msg.includes('not ready')
          ) {
            console.log(
              '[Recording] Camera recording chunk finished/stopped.'
            );
          } else {
            console.warn(
              '[Recording] Camera recordAsync error:',
              err
            );
          }
        })
        .finally(async () => {
          // Native MediaRecorder cool-down.
          await new Promise((resolve) => setTimeout(resolve, 600));

          if (
            isActiveRef.current &&
            isCameraReadyRef.current &&
            elapsedSecondsRef.current < VIDEO_MAX_DURATION_SECONDS &&
            cameraRef.current
          ) {
            console.log(
              '[Recording] Re-starting next 15s video chunk…'
            );

            // IMPORTANT:
            // Use the CURRENT camera ref instead of the old `cam`.
            startVideoRecording(
              cameraRef.current,
              alertId
            );
          }
        });
    },
    [uploadChunk]
  );

  // ─── START ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(
    async (alertId: string) => {
      // 1. Kill previous session's timer and camera synchronously.
      isActiveRef.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (cameraRef.current?.stopRecording) {
        try {
          Promise.resolve(
            cameraRef.current.stopRecording()
          ).catch(() => {});
        } catch {
          // Camera may have unmounted between sessions.
        }
      }

      isCyclingAudioRef.current = false;
      isAudioReadyRef.current = false;

      // 2. Set alert ID and evidence list.
      alertIdRef.current = alertId;
      evidenceListRef.current = [];

      // 3. Update UI.
      if (isMountedRef.current) {
        setIsRecording(true);
        setPhase('recording_video_audio');
        setDurationSeconds(0);
        setUploadedEvidence([]);
      }

      // 4. Mark active and start timer immediately.
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

        if (isMountedRef.current) {
          setDurationSeconds(elapsed);
        }

        // Video chunking every 15 seconds.
        if (
          elapsed > 0 &&
          elapsed <= VIDEO_MAX_DURATION_SECONDS &&
          elapsed % AUDIO_CHUNK_INTERVAL_SECONDS === 0
        ) {
          if (cameraRef.current?.stopRecording) {
            try {
              Promise.resolve(
                cameraRef.current.stopRecording()
              ).catch(() => {});
            } catch {}
          }
        }

        if (elapsed % AUDIO_CHUNK_INTERVAL_SECONDS === 0) {
          const isDuringFirst60s =
            elapsed <= VIDEO_MAX_DURATION_SECONDS;

          cycleAudioChunk(alertId, isDuringFirst60s);
        }

        if (elapsed === VIDEO_MAX_DURATION_SECONDS) {
          if (isMountedRef.current) {
            setPhase('recording_audio_background');
          }
        }
      }, 1000);

      // 5. Properly stop any previous audio recording.
      const oldRec = audioRecordingRef.current;
      audioRecordingRef.current = null;

      if (oldRec) {
        try {
          await oldRec.stopAndUnloadAsync();
        } catch {}
      }

      // 6. Request permissions and start fresh audio recording.
      try {
        await Audio.requestPermissionsAsync();

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        if (!isActiveRef.current) {
          return true;
        }

        const { recording } =
          await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );

        audioRecordingRef.current = recording;

        console.log('[Recording] Audio recording started.');
      } catch (err) {
        console.warn(
          '[Recording] Audio setup failed (SOS still active, timer running):',
          err
        );
      }

      isAudioReadyRef.current = true;

      // 7. Only start camera if it is ACTUALLY ready.
      if (
        isActiveRef.current &&
        isCameraReadyRef.current &&
        cameraRef.current
      ) {
        startVideoRecording(
          cameraRef.current,
          alertId
        );
      }

      return true;
    },
    [cycleAudioChunk, startVideoRecording]
  );

  // ─── STOP ──────────────────────────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!isActiveRef.current && !alertIdRef.current) {
      return;
    }

    const alertId = alertIdRef.current;

    isActiveRef.current = false;

    // Prevent any new camera recording from starting.
    isCameraReadyRef.current = false;
    isAudioReadyRef.current = false;

    // 1. Kill timer immediately.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 2. Stop camera.
    if (cameraRef.current?.stopRecording) {
      try {
        // Catch asynchronous native errors.
        Promise.resolve(
          cameraRef.current.stopRecording()
        ).catch(() => {});
      } catch {
        // Camera may already have unmounted.
      }
    }

    // 3. Finalise audio slice.
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
          // Video covers the first 60 seconds.
          if (
            elapsedSecondsRef.current <=
            VIDEO_MAX_DURATION_SECONDS
          ) {
            console.log(
              `[Recording] Discarding final audio chunk (cancelled at ${elapsedSecondsRef.current}s, video covers this).`
            );
          } else {
            console.log(
              '[Recording] Uploading final audio chunk in background:',
              uri
            );

            uploadChunk(uri, 'audio', alertId);
          }
        }
      } catch (err) {
        console.warn(
          '[Recording] Final audio unload error:',
          err
        );
      }
    }
  }, [uploadChunk]);

  // ─── CAMERA REF ────────────────────────────────────────────────────────────
  const bindCameraRef = useCallback(
    (ref: CameraView | null) => {
      cameraRef.current =
        ref as unknown as CameraRef | null;

      // A ref existing does NOT mean the native camera is ready.
      // onCameraReady is responsible for setting this flag.
      if (!ref) {
        isCameraReadyRef.current = false;
      }
    },
    []
  );

  // ─── CAMERA READY ──────────────────────────────────────────────────────────
  const handleCameraReady = useCallback(() => {
    isCameraReadyRef.current = true;

    console.log('[Recording] Camera is ready.');

    // If SOS and audio are already active, start video now.
    if (
      isActiveRef.current &&
      isAudioReadyRef.current &&
      alertIdRef.current &&
      cameraRef.current
    ) {
      console.log(
        '[Recording] Camera is ready during active SOS — starting video.'
      );

      startVideoRecording(
        cameraRef.current,
        alertIdRef.current
      );
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
    handleCameraReady,
  };
}