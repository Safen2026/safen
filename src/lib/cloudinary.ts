import { getInfoAsync, uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import type { FileInfo } from 'expo-file-system';

// ─── Detect resource type and filename from URI ────────────────────────────────
const getUploadMeta = (uri: string): { fileName: string; mimeType: string; resourceType: 'video' | 'image' } => {
  const lower = uri.toLowerCase();
  const ts = Date.now();

  const isVideo = lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.includes('/video') || lower.includes('camera');
  const isAudio = lower.endsWith('.m4a') || lower.endsWith('.caf') || lower.endsWith('.mp3') || lower.endsWith('.wav')
    || lower.includes('recording') || lower.includes('/av/');

  if (isVideo) return { fileName: `video_${ts}.mp4`, mimeType: 'video/mp4', resourceType: 'video' };
  if (isAudio) return { fileName: `audio_${ts}.m4a`, mimeType: 'audio/m4a', resourceType: 'video' }; // Cloudinary uses /video endpoint for audio too
  return { fileName: `photo_${ts}.jpg`, mimeType: 'image/jpeg', resourceType: 'image' };
};

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const attemptUpload = async (
  uri: string,
  options?: { public_id?: string; folder?: string }
): Promise<string | null> => {
  const cloudName   = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    console.warn('[Cloudinary] Missing env vars — EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME or EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET not set.');
    return null;
  }

  // ── Verify file exists on disk ─────────────────────────────────────────────
  try {
    const info: FileInfo = await getInfoAsync(uri);
    if (!info.exists) {
      console.warn('[Cloudinary] File does not exist at URI:', uri);
      return null;
    }
    // size is only present when exists is true
    const size = (info as FileInfo & { size?: number }).size ?? 0;
    if (size === 0) {
      console.warn('[Cloudinary] File is 0 bytes — skipping upload:', uri);
      return null;
    }
    console.log(`[Cloudinary] File ready: ${size} bytes → ${uri}`);
  } catch (statErr) {
    // getInfoAsync can fail for content:// URIs on some Android versions — proceed anyway
    console.warn('[Cloudinary] Could not stat file (proceeding anyway):', statErr);
  }

  // ── Build upload URL ──────────────────────────────────────────────────────
  const { resourceType, fileName } = getUploadMeta(uri);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  // Force Cloudinary to use our descriptive filename (without extension) as the public_id.
  // This guarantees the resulting URL ends in e.g. "audio_12345.m4a", so the app always
  // knows whether it's audio or video regardless of the folder path.
  const descriptivePublicId = fileName.split('.')[0]; 

  const parameters: Record<string, string> = { 
    upload_preset: uploadPreset,
    public_id: options?.public_id || descriptivePublicId
  };
  
  if (options?.folder) parameters.folder = options.folder;

  console.log(`[Cloudinary] Uploading to ${uploadUrl} (public_id: ${parameters.public_id})…`);

  // ── Upload via FileSystem.uploadAsync (most reliable on Android) ───────────
  const response = await uploadAsync(uploadUrl, uri, {
    fieldName:  'file',
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    parameters,
  });

  console.log('[Cloudinary] HTTP status:', response.status);
  if (response.body) {
    console.log('[Cloudinary] Response (first 500 chars):', response.body.substring(0, 500));
  }

  if (response.status >= 200 && response.status < 300) {
    let parsed: { secure_url?: string };
    try { parsed = JSON.parse(response.body); } catch {
      throw new Error(`[Cloudinary] Could not parse response: ${response.body.substring(0, 200)}`);
    }
    if (parsed?.secure_url) {
      console.log('[Cloudinary] Upload SUCCESS:', parsed.secure_url);
      return parsed.secure_url;
    }
    throw new Error(`[Cloudinary] No secure_url in response: ${response.body.substring(0, 200)}`);
  }

  throw new Error(`[Cloudinary] HTTP ${response.status}: ${response.body?.substring(0, 300)}`);
};

export const uploadToCloudinary = async (
  uri: string,
  options?: { public_id?: string; folder?: string }
): Promise<string | null> => {
  console.log('[Cloudinary] Starting upload for:', uri);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const url = await attemptUpload(uri, options);
      if (url) return url;
      // null return means file didn't exist / 0 bytes — no point retrying
      return null;
    } catch (err) {
      console.warn(`[Cloudinary] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`[Cloudinary] Retrying in ${attempt}s…`);
        await sleep(attempt * 1000);
      }
    }
  }

  console.error('[Cloudinary] All', MAX_ATTEMPTS, 'upload attempts failed.');
  return null;
};

// Named export kept for any callers that import getFileInfo
export const getFileInfo = (uri: string) => getUploadMeta(uri);
