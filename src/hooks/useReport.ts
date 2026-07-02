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

// Uploads a single local file URI to Supabase Storage and returns its path
const uploadMediaFile = async (
  uri: string,
  userId: string,
  reportId: string
): Promise<string | null> => {
  try {
    const { fileName, mimeType } = getFileInfo(uri);
    const storagePath = `${userId}/${reportId}/${fileName}`;

    // Read the file as base64
const base64 = await FileSystem.readAsStringAsync(uri, {
  encoding: 'base64',
});

    // Decode base64 to binary
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const { error } = await supabase.storage
      .from('report-media')
      .upload(storagePath, byteArray, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.warn('Media upload failed:', error.message);
      return null;
    }

    return storagePath;
  } catch (err) {
    console.warn('Media upload error:', err);
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

      // 1. Insert the report row first — fast, gives us the report ID
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

      // 2. Upload media in the background — user isn't waiting for this
      if (payload.media && payload.media.length > 0) {
        (async () => {
          const uploadedPaths: string[] = [];

          for (const uri of payload.media!) {
            const path = await uploadMediaFile(uri, user.id, report.id);
            if (path) uploadedPaths.push(path);
          }

          // Optionally: you could store the uploaded paths back on the report
          // For now they live in storage under userId/reportId/filename
          // which is enough to retrieve them later
        })();
      }

      return true;
    } catch (error) {
      console.error('submitReport error:', error);
      setLoading(false);
      return false;
    }
  };

  return { loading, submitReport };
}