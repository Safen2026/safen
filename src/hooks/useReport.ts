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

<<<<<<< HEAD
// Uploads a single local file URI to Cloudinary and returns its secure URL
const uploadToCloudinary = async (uri: string): Promise<string | null> => {
  try {
    const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      console.warn('Cloudinary environment variables missing');
=======
const uploadMediaFile = async (
  uri: string,
  userId: string,
  reportId: string,
  accessToken: string,
  supabaseUrl: string,
): Promise<string | null> => {
  try {
    const { fileName, mimeType } = getFileInfo(uri);
    const storagePath = `${userId}/${reportId}/${fileName}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/report-media/${storagePath}`;

    // FormData + fetch — most reliable in Expo Go
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: mimeType,
    } as any);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-upsert': 'true',
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Media upload failed [${response.status}]:`, body);
>>>>>>> 04c6235 (contact fix trial)
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
<<<<<<< HEAD
    console.warn('Cloudinary upload error:', err);
=======
    console.warn('uploadMediaFile error:', err);
>>>>>>> 04c6235 (contact fix trial)
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

<<<<<<< HEAD
      // 1. Upload media to Cloudinary first
      const uploadedPaths: string[] = [];
      if (payload.media && payload.media.length > 0) {
        for (const uri of payload.media) {
          const url = await uploadToCloudinary(uri);
          if (url) uploadedPaths.push(url);
        }
      }

      // 2. Insert the report row with the Cloudinary URLs
=======
      const { user, access_token } = session;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;

      // 1. Insert the report row immediately so user sees success fast
>>>>>>> 04c6235 (contact fix trial)
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          user_id: payload.isAnonymous ? null : user.id,
          category: payload.category,
          description: payload.address ? `Reported Address: ${payload.address}\n\n${payload.details || ''}`.trim() : (payload.details || null),
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          media_urls: uploadedPaths,
          status: 'open',
        })
        .select('id')
        .single();

      if (reportError || !report) {
        console.error('Report insert failed:', reportError?.message);
        setLoading(false);
        return false;
      }

      // Done — user sees success
      setLoading(false);

<<<<<<< HEAD
=======
      // 2. Upload media in background
      if (payload.media && payload.media.length > 0) {
        (async () => {
          const uploadedPaths: string[] = [];
          for (const uri of payload.media!) {
            const path = await uploadMediaFile(uri, user.id, report.id, access_token, supabaseUrl);
            if (path) uploadedPaths.push(path);
          }
          if (uploadedPaths.length > 0) {
            await supabase
              .from('reports')
              .update({ media_paths: uploadedPaths })
              .eq('id', report.id);
          }
          console.log(`Uploaded ${uploadedPaths.length}/${payload.media!.length} media files`);
        })();
      }

>>>>>>> 04c6235 (contact fix trial)
      return true;
    } catch (err) {
      console.error('submitReport error:', err);
      setLoading(false);
      return false;
    }
  };

  return { loading, submitReport };
}