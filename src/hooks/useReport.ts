import { useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';

export type ReportPayload = {
  category: string;
  address: string;
  details: string;
  isAnonymous: boolean;
  media?: string[];
  latitude?: number;
  longitude?: number;
};

// Derives a clean filename and MIME type from a local URI
const getFileInfo = (uri: string): { fileName: string; mimeType: string } => {
  const isVideo = uri.includes('video') || uri.endsWith('.mp4') || uri.endsWith('.mov');
  const isAudio = uri.includes('audio') || uri.includes('recording') || uri.endsWith('.m4a') || uri.endsWith('.caf');
  const timestamp = Date.now();

  if (isVideo) return { fileName: `video_${timestamp}.mp4`, mimeType: 'video/mp4' };
  if (isAudio) return { fileName: `audio_${timestamp}.m4a`, mimeType: 'audio/m4a' };
  return { fileName: `photo_${timestamp}.jpg`, mimeType: 'image/jpeg' };
};

// Uploads a single local file URI to Cloudinary and returns its secure URL
const uploadToCloudinary = async (uri: string): Promise<string | null> => {
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

export function useReport() {
  const [loading, setLoading] = useState(false);

  const submitReport = async (payload: ReportPayload): Promise<boolean> => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return false;
      }

      // 1. Upload media to Cloudinary first
      const uploadedPaths: string[] = [];
      if (payload.media && payload.media.length > 0) {
        for (const uri of payload.media) {
          const url = await uploadToCloudinary(uri);
          if (url) uploadedPaths.push(url);
        }
      }

      // 2. Insert the report row with the Cloudinary URLs
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

      setLoading(false);

      return true;
    } catch (error) {
      console.error('submitReport error:', error);
      setLoading(false);
      return false;
    }
  };

  return { loading, submitReport };
}