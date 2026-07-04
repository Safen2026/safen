// Derives a clean filename and MIME type from a local URI
export const getFileInfo = (uri: string): { fileName: string; mimeType: string } => {
  const isVideo = uri.includes('video') || uri.endsWith('.mp4') || uri.endsWith('.mov');
  const isAudio = uri.includes('audio') || uri.includes('recording') || uri.endsWith('.m4a') || uri.endsWith('.caf');
  const timestamp = Date.now();

  if (isVideo) return { fileName: `video_${timestamp}.mp4`, mimeType: 'video/mp4' };
  if (isAudio) return { fileName: `audio_${timestamp}.m4a`, mimeType: 'audio/m4a' };
  return { fileName: `photo_${timestamp}.jpg`, mimeType: 'image/jpeg' };
};

// Uploads a single local file URI to Cloudinary and returns its secure URL
export const uploadToCloudinary = async (
  uri: string,
  options?: { public_id?: string }
): Promise<string | null> => {
  try {
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
    formData.append('file', {
      uri,
      type: mimeType,
      name: fileName
    } as any);
    formData.append('upload_preset', uploadPreset);
    
    if (options?.public_id) {
      formData.append('public_id', options.public_id);
    }

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: 'POST',
      body: formData,
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();
    if (data.secure_url) {
      return data.secure_url;
    } else {
      console.warn('Cloudinary upload failed:', data);
      return null;
    }
  } catch (err) {
    console.warn('Cloudinary upload error:', err);
    return null;
  }
};
