import { useState } from 'react';
import { Notifications } from '../lib/expoNotifications';
import { supabase } from '../lib/supabase';
import { notifyEmergencyContacts } from '../lib/notifications';
import { uploadToCloudinary } from '../lib/cloudinary';
import { useSession } from '../context/SessionContext';

export type ReportPayload = {
  category: string;
  address: string;
  details: string;
  isAnonymous: boolean;
  media?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

export function useReport() {
  // Pull the session from the Water Tower (SessionContext) — free, no DB call.
  const session = useSession();
  const [loading, setLoading] = useState(false);

  const submitReport = async (payload: ReportPayload): Promise<boolean> => {
    setLoading(true);

    try {
      if (!session?.user) {
        console.warn('No session found');
        setLoading(false);
        return false;
      }

      const { user } = session;

      // 1. Upload media to Cloudinary FIRST
      const uploadedUrls: string[] = [];
      console.log('[useReport] Media URIs received:', payload.media?.length ?? 0, payload.media);
      if (payload.media && payload.media.length > 0) {
        for (const uri of payload.media) {
          console.log('[useReport] Uploading URI:', uri);
          const url = await uploadToCloudinary(uri);
          console.log('[useReport] Upload result for URI:', uri, '→', url);
          if (url) uploadedUrls.push(url);
        }
      }
      console.log('[useReport] All uploaded URLs:', uploadedUrls);

      // 2. Insert report row with media_paths included
      const insertPayload = {
        user_id: user.id,
        category: payload.category,
        description: payload.details || null,
        address: payload.address || null,
        is_anonymous: payload.isAnonymous,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        media_paths: uploadedUrls.length > 0 ? uploadedUrls : null,
        status: 'open',
      };
      console.log('[useReport] Inserting into DB with media_paths:', insertPayload.media_paths);

      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert(insertPayload)
        .select('id')
        .single();

      console.log('[useReport] DB insert result:', { report, error: reportError?.message });

      if (reportError || !report) {
        console.error('[useReport] Report insert failed:', reportError?.message);
        setLoading(false);
        return false;
      }

      setLoading(false);

      // 3. Let emergency contacts know
      notifyEmergencyContacts({
        type: 'report',
        reportId: report.id,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        detailsSnippet: payload.details ? payload.details.slice(0, 120) : null,
      });

      // 4. Notify if any media failed to attach
      if (payload.media && payload.media.length > 0) {
        const failedCount = payload.media.length - uploadedUrls.length;
        if (failedCount > 0) {
          Notifications?.scheduleNotificationAsync({
            content: {
              title: 'Some media failed to attach',
              body: uploadedUrls.length > 0
                ? `${failedCount} of ${payload.media.length} file(s) from your report couldn't be uploaded.`
                : `None of your ${payload.media.length} attached file(s) could be uploaded.`,
              sound: 'default',
            },
            trigger: null,
          }).catch(() => {});
        }
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
