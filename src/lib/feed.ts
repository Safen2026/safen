import { supabase } from './supabase';

export type FeedSeverity = 'info' | 'caution' | 'warning' | 'critical';

export interface FeedRow {
  kind        : 'news' | 'community';
  id          : string;
  headline    : string;
  summary     : string;
  advice      : string | null;
  category    : string;
  severity    : FeedSeverity;
  occurred_at : string;
  state_code  : string | null;
  lga_code    : string | null;
  source_label: string;
  deep_link   : string | null;
}

export async function fetchAreaFeed(p: {
  stateCode: string | null;
  lgaCode  : string | null;
  limit    : number;
  before  ?: string | null;
}): Promise<FeedRow[]> {
  const { data, error } = await supabase.rpc('get_area_feed', {
    p_state_code: p.stateCode,
    p_lga_code  : p.lgaCode,
    p_limit     : p.limit,
    p_before    : p.before ?? null,
  });
  if (error) throw error;
  return (data ?? []) as FeedRow[];
}
