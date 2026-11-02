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

  // Explicit filename prefix checks (highest priority)
  if (filename.startsWith('video_') || filename.includes('video_')) return 'video';
  if (filename.startsWith('audio_') || filename.startsWith('recording') || filename.includes('audio_')) return 'audio';

  // Standard video extensions
  if (
    filename.endsWith('.mp4') ||
    filename.endsWith('.mov') ||
    filename.endsWith('.webm') ||
    filename.endsWith('.mkv') ||
    filename.endsWith('.3gp')
  ) {
    return 'video';
  }

  // Standard audio extensions
  if (
    filename.endsWith('.m4a') ||
    filename.endsWith('.mp3') ||
    filename.endsWith('.wav') ||
    filename.endsWith('.caf') ||
    filename.endsWith('.aac') ||
    filename.endsWith('.ogg')
  ) {
    return 'audio';
  }

  // Substring checks for query-parametered or transformed Cloudinary URLs
  if (lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm')) return 'video';
  if (lower.includes('.m4a') || lower.includes('.mp3') || lower.includes('.wav') || lower.includes('.caf') || lower.includes('.aac')) return 'audio';

  // Cloudinary puts both audio and video under /video/upload/.
  // If the path or public_id contains "video", classify as video.
  if (lower.includes('/video/upload/') && lower.includes('video')) return 'video';

  return 'image';
};

/**
 * Extracts the recording timestamp from media URLs where the filename
 * follows the standard pattern: [type]_[timestamp] (e.g. audio_1730560800000.m4a).
 * Returns null if no valid timestamp is found.
 */
export const extractMediaTimestamp = (url: string): Date | null => {
  if (!url) return null;
  const match = url.match(/(?:audio|video|photo|snapshot)_(\d{10,13})/i);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  if (isNaN(num)) return null;

  // Convert seconds (10 digits) to milliseconds if needed
  const ms = num < 10000000000 ? num * 1000 : num;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date;
};
