import { supabase } from './supabase';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type QualityInput = {
  category: string;
  description: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hasMedia: boolean;
  lastSeenAt?: string | null;
  policeReference?: string | null;
};

export type QualityVerdict =
  | { status: 'pass'; token: string | null; priority: Priority; degraded: boolean }
  | { status: 'needs_detail'; missing: string[]; feedback: string; strikesLeft: number }
  | { status: 'paused'; retryAt: string };

/**
 * Never throws. A network failure returns a degraded pass, because a dropped
 * connection must not become a wall between someone and reporting an emergency.
 */
export async function checkReportQuality(input: QualityInput): Promise<QualityVerdict> {
  try {
    const { data, error } = await supabase.functions.invoke('check-report-quality', {
      body: {
        category: input.category,
        description: input.description,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        has_media: input.hasMedia,
        last_seen_at: input.lastSeenAt ?? null,
        police_reference: input.policeReference ?? null,
      },
    });

    if (error || !data) {
      // functions.invoke rejects on any non-2xx, so the 429 "paused" verdict
      // arrives here rather than as data. It is a verdict, not a transport
      // failure, and must not be turned into a fail-open pass.
      const ctx = (error as { context?: Response })?.context;
      if (ctx?.status === 429) {
        try {
          const body = await ctx.json();
          if (body?.status === 'paused') {
            return { status: 'paused', retryAt: body.retry_at };
          }
        } catch {
          // fall through to the degraded pass below
        }
      }

      console.warn('[reportQuality] invoke failed, failing open:', error?.message);
      return { status: 'pass', token: null, priority: 'medium', degraded: true };
    }

    if (data.status === 'paused') {
      return { status: 'paused', retryAt: data.retry_at };
    }

    if (data.status === 'needs_detail') {
      const count = data.strikes?.count ?? 0;
      const threshold = data.strikes?.threshold ?? 3;
      return {
        status: 'needs_detail',
        missing: data.missing ?? [],
        feedback: data.feedback ?? 'Please add a little more detail.',
        strikesLeft: Math.max(0, threshold - count),
      };
    }

    return {
      status: 'pass',
      token: data.token ?? null,
      priority: (data.priority ?? 'medium') as Priority,
      degraded: data.quality_status !== 'passed',
    };
  } catch (err) {
    console.warn('[reportQuality] threw, failing open:', err);
    return { status: 'pass', token: null, priority: 'medium', degraded: true };
  }
}
