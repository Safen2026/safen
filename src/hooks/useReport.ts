import { useState } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { notifyEmergencyContacts } from '../lib/notifications';
import { uploadToCloudinary } from '../lib/cloudinary';
import { checkReportQuality } from '../lib/reportQuality';

export type SubmitResult =
  | { ok: true; degraded: boolean }
  | { ok: false; reason: 'quality'; missing: string[]; feedback: string; strikesLeft: number }
  | { ok: false; reason: 'paused'; retryAt: string }
  | { ok: false; reason: 'gate'; code: string; message: string }
  | { ok: false; reason: 'error' };

const GATE_MESSAGES: Record<string, string> = {
  QUALITY_GATE_MISSING_PERSON_PHOTO: 'A missing-person report needs a recent photo.',
  QUALITY_GATE_MISSING_PERSON_LAST_SEEN: 'Please add when the person was last seen.',
  QUALITY_GATE_MISSING_PERSON_POLICE_REF: 'Please add the police station and case reference.',
  QUALITY_GATE_MISSING_PERSON_LOCATION: 'We need the location where they were last seen.',
  QUALITY_GATE_TOKEN_MISSING: 'Your report could not be verified. Please try submitting again.',
  QUALITY_GATE_TOKEN_UNKNOWN: 'Your report could not be verified. Please try submitting again.',
  QUALITY_GATE_TOKEN_USED: 'This report was already submitted.',
  QUALITY_GATE_TOKEN_EXPIRED: 'Your report took too long to upload. Please submit it again.',
  QUALITY_GATE_TOKEN_WRONG_USER: 'Your report could not be verified. Please try submitting again.',
  QUALITY_GATE_PAYLOAD_MISMATCH: 'Your report changed after it was checked. Please submit it again.',
};

export type ReportPayload = {
  category: string;
  address: string;
  details: string;
  isAnonymous: boolean;
  media?: string[];
  latitude?: number | null;
  longitude?: number | null;
  lastSeenAt?: string | null;
  policeReference?: string | null;
};

export function useReport() {
  const [loading, setLoading] = useState(false);

  const submitReport = async (payload: ReportPayload): Promise<SubmitResult> => {
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.warn('No session found');
        setLoading(false);
        return { ok: false, reason: 'error' };
      }

      const { user } = session;

      // Quality check runs on TEXT ONLY, before the upload — a rejected report
      // should not cost the user a video upload first.
      const verdict = await checkReportQuality({
        category: payload.category,
        description: payload.details,
        address: payload.address,
        latitude: payload.latitude,
        longitude: payload.longitude,
        hasMedia: (payload.media?.length ?? 0) > 0,
        lastSeenAt: payload.lastSeenAt,
        policeReference: payload.policeReference,
      });

      if (verdict.status === 'paused') {
        setLoading(false);
        return { ok: false, reason: 'paused', retryAt: verdict.retryAt };
      }
      if (verdict.status === 'needs_detail') {
        setLoading(false);
        return {
          ok: false, reason: 'quality', missing: verdict.missing,
          feedback: verdict.feedback, strikesLeft: verdict.strikesLeft,
        };
      }

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
        quality_token: verdict.token,
        last_seen_at: payload.lastSeenAt ?? null,
        police_reference: payload.policeReference ?? null,
      };
      console.log('[useReport] Inserting into DB with media_paths:', insertPayload.media_paths);

      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert(insertPayload)
        .select('id')
        .single();

      console.log('[useReport] DB insert result:', { report, error: reportError?.message });

      if (reportError || !report) {
        setLoading(false);
        const code = Object.keys(GATE_MESSAGES).find((k) =>
          (reportError?.message ?? '').includes(k));
        if (code) {
          return { ok: false, reason: 'gate', code, message: GATE_MESSAGES[code] };
        }
        console.error('[useReport] Report insert failed:', reportError?.message);
        return { ok: false, reason: 'error' };
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
          Notifications.scheduleNotificationAsync({
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

      return { ok: true, degraded: verdict.degraded };
    } catch (err) {
      console.error('submitReport error:', err);
      setLoading(false);
      return { ok: false, reason: 'error' };
    }
  };

  return { loading, submitReport };
}
