import { getMediaType } from '../../src/utils/mediaUtils';

describe('getMediaType', () => {
  // ─── Filename prefix rules (Cloudinary convention) ───────────────────────
  it('returns "video" for a URL with filename starting with video_', () => {
    expect(getMediaType('https://res.cloudinary.com/demo/video/upload/video_abc123.mp4')).toBe('video');
  });

  it('returns "audio" for a URL with filename starting with audio_', () => {
    expect(getMediaType('https://res.cloudinary.com/demo/video/upload/audio_recording.m4a')).toBe('audio');
  });

  it('returns "audio" for a URL with filename starting with recording', () => {
    expect(getMediaType('https://res.cloudinary.com/demo/video/upload/recording_20240101.m4a')).toBe('audio');
  });

  // ─── Extension-based detection ────────────────────────────────────────────
  it('returns "video" for .mp4 extension', () => {
    expect(getMediaType('https://example.com/clip.mp4')).toBe('video');
  });

  it('returns "video" for .mov extension', () => {
    expect(getMediaType('https://example.com/clip.mov')).toBe('video');
  });

  it('returns "video" for .webm extension', () => {
    expect(getMediaType('https://example.com/clip.webm')).toBe('video');
  });

  it('returns "audio" for .m4a extension', () => {
    expect(getMediaType('https://example.com/clip.m4a')).toBe('audio');
  });

  it('returns "audio" for .mp3 extension', () => {
    expect(getMediaType('https://example.com/clip.mp3')).toBe('audio');
  });

  it('returns "audio" for .wav extension', () => {
    expect(getMediaType('https://example.com/clip.wav')).toBe('audio');
  });

  it('returns "audio" for .caf extension', () => {
    expect(getMediaType('https://example.com/clip.caf')).toBe('audio');
  });

  it('returns "audio" for .aac extension', () => {
    expect(getMediaType('https://example.com/clip.aac')).toBe('audio');
  });

  // ─── Query string stripping ───────────────────────────────────────────────
  it('strips query string before detecting extension', () => {
    expect(getMediaType('https://example.com/clip.mp4?v=123&token=abc')).toBe('video');
  });

  it('strips query string before detecting extension (audio)', () => {
    expect(getMediaType('https://example.com/audio.m4a?expires=99999')).toBe('audio');
  });

  // ─── Case insensitivity ───────────────────────────────────────────────────
  it('is case-insensitive for extensions', () => {
    expect(getMediaType('https://example.com/clip.MP4')).toBe('video');
    expect(getMediaType('https://example.com/clip.M4A')).toBe('audio');
  });

  // ─── Fallback to image ────────────────────────────────────────────────────
  it('returns "image" for a .jpg URL', () => {
    expect(getMediaType('https://example.com/photo.jpg')).toBe('image');
  });

  it('returns "image" for a .png URL', () => {
    expect(getMediaType('https://example.com/photo.png')).toBe('image');
  });

  it('returns "image" for an unknown extension', () => {
    expect(getMediaType('https://example.com/file.xyz')).toBe('image');
  });

  it('returns "image" for a URL with no extension', () => {
    expect(getMediaType('https://example.com/somepath')).toBe('image');
  });

  it('returns "image" for an empty string', () => {
    expect(getMediaType('')).toBe('image');
  });

  // ─── In-path extension detection (fallback) ───────────────────────────────
  it('returns "video" when .mp4 appears anywhere in the URL path (fallback rule)', () => {
    // Even though .mp4 is not the final extension here, the URL contains ".mp4"
    // so the last-resort fallback in the implementation correctly returns "video".
    // This documents the intentional behaviour: we err on the side of video/audio
    // detection rather than silently treating evidence files as images.
    expect(getMediaType('https://cdn.example.com/video.mp4/thumbnail')).toBe('video');
  });
});
