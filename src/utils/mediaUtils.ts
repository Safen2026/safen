/**
 * Utility functions for handling media files and URLs across the app.
 */

/**
 * Detect whether a URL is a video, audio, or image file.
 * Cloudinary puts ALL media (including audio) under /video/upload/,
 * so we must check the actual file extension from the URL tail FIRST.
 */
export const getMediaType = (url: string): 'video' | 'audio' | 'image' => {
  const lower = url.toLowerCase();
  const pathPart = lower.split('?')[0];
  const filename = pathPart.split('/').pop() ?? '';

  if (filename.startsWith('video_')) return 'video';
  if (filename.startsWith('audio_') || filename.startsWith('recording')) return 'audio';

  if (filename.endsWith('.mp4') || filename.endsWith('.mov') || filename.endsWith('.webm')) return 'video';
  if (filename.endsWith('.m4a') || filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.caf') || filename.endsWith('.aac')) return 'audio';

  if (lower.includes('.mp4') || lower.includes('.mov')) return 'video';
  if (lower.includes('.m4a') || lower.includes('.mp3') || lower.includes('.wav')) return 'audio';

  return 'image';
};
