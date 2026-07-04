import { useState } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { notifyEmergencyContacts } from '../lib/notifications';
import { uploadToCloudinary } from '../lib/cloudinary';

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

      // 1. Insert report row immediately — user sees success fast.
      // user_id is always the reporting user (the FK/NOT NULL constraint
      // requires it) — `is_anonymous` is what actually controls whether
      // their identity is shown to responders, not this column.
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          user_id: user.id,
          category: payload.category,
          description: payload.details || null,
          address: payload.address || null,
          is_anonymous: payload.isAnonymous,
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

      // 2. Let emergency contacts know right away — don't wait on media.
      notifyEmergencyContacts({
        type: 'report',
        reportId: report.id,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        detailsSnippet: payload.details ? payload.details.slice(0, 120) : null,
      });

      // 3. Upload media to Cloudinary in background. Each file already
      // retries internally (see lib/cloudinary.ts) — this loop only
      // has to handle what's left after those retries are exhausted.
      if (payload.media && payload.media.length > 0) {
        (async () => {
          const uploadedUrls: string[] = [];
          for (const uri of payload.media!) {
            const url = await uploadToCloudinary(uri);
            if (url) uploadedUrls.push(url);
          }

          if (uploadedUrls.length > 0) {
            const { error: updateError } = await supabase
              .from('reports')
              .update({ media_paths: uploadedUrls })
              .eq('id', report.id);
            if (updateError) {
              console.warn('Failed to attach media_paths to report:', updateError.message);
            }
          }

          const failedCount = payload.media!.length - uploadedUrls.length;
          console.log(`Uploaded ${uploadedUrls.length}/${payload.media!.length} media files to Cloudinary`);

          // Don't leave the user thinking their evidence attached when
          // it didn't — this fires even if the app has since been
          // closed/backgrounded, since it's a local (not push) notification
          // scheduled with trigger: null (immediate).
          if (failedCount > 0) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Some media failed to attach',
                body: uploadedUrls.length > 0
                  ? `${failedCount} of ${payload.media!.length} file(s) from your report couldn't be uploaded. The report itself was saved.`
                  : `None of your ${payload.media!.length} attached file(s) could be uploaded, but the report itself was saved.`,
                sound: 'default',
              },
              trigger: null,
            }).catch(() => {});
          }
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
