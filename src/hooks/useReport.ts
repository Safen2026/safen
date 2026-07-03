import { useState } from 'react';
import { supabase } from '../lib/supabase';

export type ReportPayload = {
  category: string;
  address: string;
  details: string;
  isAnonymous: boolean;
  media?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

const getFileInfo = (uri: string): { fileName: string; mimeType: string } => {
  const lower = uri.toLowerCase();
  const timestamp = Date.now();
  if (lower.includes('video') || lower.endsWith('.mp4') || lower.endsWith('.mov'))
    return { fileName: `video_${timestamp}.mp4`, mimeType: 'video/mp4' };
  if (lower.includes('audio') || lower.includes('recording') || lower.endsWith('.m4a') || lower.endsWith('.caf'))
    return { fileName: `audio_${timestamp}.m4a`, mimeType: 'audio/m4a' };
  return { fileName: `photo_${timestamp}.jpg`, mimeType: 'image/jpeg' };
};

// Upload to Cloudinary — works reliably in Expo Go for all media types
const uploadToCloudinary = async (uri: string): Promise<string | null> => {
  try {
    const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      console.warn('Cloudinary env vars missing: EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET');
      return null;
    }

    const { fileName, mimeType } = getFileInfo(uri);
    // Cloudinary groups audio under 'video' resource type
    const resourceType = mimeType.startsWith('video') || mimeType.startsWith('audio') ? 'video' : 'image';

    const formData = new FormData();
    formData.append('file', { uri, type: mimeType, name: fileName } as any);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      { method: 'POST', body: formData, headers: { Accept: 'application/json' } }
    );

    const data = await response.json();
    if (data.secure_url) return data.secure_url;

    console.warn('Cloudinary upload failed:', data);
    return null;
  } catch (err) {
    console.warn('Cloudinary upload error:', err);
    return null;
  }
};

export function useReport() {
  const [loading, setLoading] = useState(false);

  const submitReport = async (payload: ReportPayload): Promise<boolean> => {
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.warn('No session found');
        setLoading(false);
        return false;
      }

      const { user } = session;

      // 1. Insert report row immediately — user sees success fast
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          user_id: payload.isAnonymous ? null : user.id,
          category: payload.category,
          description: payload.details || null,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          status: 'open',
        })
        .select('id')
        .single();

      if (reportError || !report) {
        console.error('Report insert failed:', reportError?.message);
        setLoading(false);
        return false;
      }

      setLoading(false);

      // 2. Upload media to Cloudinary in background
      if (payload.media && payload.media.length > 0) {
        (async () => {
          const uploadedUrls: string[] = [];
          for (const uri of payload.media!) {
            const url = await uploadToCloudinary(uri);
            if (url) uploadedUrls.push(url);
          }
          if (uploadedUrls.length > 0) {
            await supabase
              .from('reports')
              .update({ media_paths: uploadedUrls })
              .eq('id', report.id);
          }
          console.log(`Uploaded ${uploadedUrls.length}/${payload.media!.length} media files to Cloudinary`);
        })();
      }

      return true;
    } catch (err) {
      console.error('submitReport error:', err);
      setLoading(false);
      return false;
    }
  };

  return { loading, submitReport };
}