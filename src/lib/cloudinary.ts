// @ts-nocheck
// Using expo-file-system/legacy for readAsStringAsync (new API doesn't expose it)
import { readAsStringAsync, EncodingType, getInfoAsync } from 'expo-file-system/legacy';
import { Alert } from 'react-native';

// Derives a clean filename and MIME type from a local URI
export const getFileInfo = (uri: string): { fileName: string; mimeType: string } => {
  const isVideo = uri.includes('video') || uri.endsWith('.mp4') || uri.endsWith('.mov');
  const isAudio = uri.includes('audio') || uri.includes('recording') || uri.endsWith('.m4a') || uri.endsWith('.caf');
  const timestamp = Date.now();

  if (isVideo) return { fileName: `video_${timestamp}.mp4`, mimeType: 'video/mp4' };
  if (isAudio) return { fileName: `audio_${timestamp}.m4a`, mimeType: 'audio/m4a' };
  return { fileName: `photo_${timestamp}.jpg`, mimeType: 'image/jpeg' };
};

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const attemptUpload = async (
  uri: string,
  options?: { public_id?: string; folder?: string }
): Promise<string | null> => {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    console.warn('[Cloudinary] Environment variables missing');
    Alert.alert('Config Error', 'Cloudinary cloud name or upload preset is missing.');
    return null;
  }

  const { mimeType } = getFileInfo(uri);
  const isVideo = mimeType.startsWith('video') || mimeType.startsWith('audio');
  const resourceType = isVideo ? 'video' : 'image';
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  // Read the file as base64 using the legacy API
  console.log('[Cloudinary] Reading file as base64...');
  const base64Data = await readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
  });
  console.log('[Cloudinary] Base64 data length:', base64Data.length);

  if (!base64Data || base64Data.length === 0) {
    throw new Error('File is empty or could not be read');
  }

  // Build the data URI that Cloudinary accepts directly
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  // Build FormData with the base64 string
  // React Native's FormData fully supports appending strings.
  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('upload_preset', uploadPreset);
  if (options?.public_id) formData.append('public_id', options.public_id);
  if (options?.folder) formData.append('folder', options.folder);

  console.log('[Cloudinary] Uploading to:', uploadUrl, '(payload base64 length:', base64Data.length, 'bytes)');

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const responseText = await response.text();
  console.log('[Cloudinary] Response status:', response.status);
  console.log('[Cloudinary] Response body:', responseText.substring(0, 300));

  if (response.ok) {
    const data = JSON.parse(responseText);
    if (data.secure_url) {
      console.log('[Cloudinary] SUCCESS:', data.secure_url);
      return data.secure_url;
    }
  }

  throw new Error(`Cloudinary rejected (status ${response.status}): ${responseText.substring(0, 300)}`);
};

export const uploadToCloudinary = async (
  uri: string,
  options?: { public_id?: string; folder?: string }
): Promise<string | null> => {
  let lastError: unknown = null;

  console.log('[Cloudinary] Starting upload for URI:', uri);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const url = await attemptUpload(uri, options);
      if (url) return url;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      console.warn(`[Cloudinary] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (!isLastAttempt) {
        await sleep(attempt * 800);
      }
    }
  }

  console.error('[Cloudinary] Upload permanently failed:', lastError);
  return null;
};
