// Derives a clean filename and MIME type from a local URI
export const getFileInfo = (uri: string): { fileName: string; mimeType: string } => {
  const isVideo = uri.includes('video') || uri.endsWith('.mp4') || uri.endsWith('.mov');
  const isAudio = uri.includes('audio') || uri.includes('recording') || uri.endsWith('.m4a') || uri.endsWith('.caf');
  const timestamp = Date.now();

  if (isVideo) return { fileName: `video_${timestamp}.mp4`, mimeType: 'video/mp4' };
  if (isAudio) return { fileName: `audio_${timestamp}.m4a`, mimeType: 'audio/m4a' };
  return { fileName: `photo_${timestamp}.jpg`, mimeType: 'image/jpeg' };
};

const UPLOAD_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A single upload attempt, hard-capped at UPLOAD_TIMEOUT_MS so a dead
// connection can't hang the whole flow indefinitely.
const attemptUpload = async (
  uri: string,
  options?: { public_id?: string; folder?: string }
): Promise<string | null> => {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    console.warn('Cloudinary environment variables missing');
    return null;
  }

  const { fileName, mimeType } = getFileInfo(uri);
  const isVideo = mimeType.startsWith('video') || mimeType.startsWith('audio');
  const resourceType = isVideo ? 'video' : 'image'; // Cloudinary groups audio under 'video'

  const formData = new FormData();
  formData.append('file', { uri, type: mimeType, name: fileName } as any);
  formData.append('upload_preset', uploadPreset);
  if (options?.public_id) formData.append('public_id', options.public_id);
  if (options?.folder) formData.append('folder', options.folder);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const data = await response.json();
    if (data.secure_url) return data.secure_url;

    console.warn('Cloudinary upload rejected:', data);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Uploads a single local file URI to Cloudinary and returns its secure
// URL. Retries transient failures (timeouts, network errors) up to
// MAX_ATTEMPTS times with a short backoff before giving up — a lot of
// "media didn't upload" reports turn out to be a single dropped
// request on a flaky connection, and this absorbs most of those.
export const uploadToCloudinary = async (
  uri: string,
  options?: { public_id?: string; folder?: string }
): Promise<string | null> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const url = await attemptUpload(uri, options);
      if (url) return url;
      // A clean "no secure_url" response (e.g. bad preset) won't fix
      // itself on retry — stop immediately instead of wasting attempts.
      return null;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      console.warn(`Cloudinary upload attempt ${attempt}/${MAX_ATTEMPTS} failed for ${uri}:`, err);
      if (!isLastAttempt) {
        await sleep(attempt * 800); // 800ms, 1600ms backoff
      }
    }
  }

  console.warn('Cloudinary upload permanently failed after retries:', lastError);
  return null;
};
