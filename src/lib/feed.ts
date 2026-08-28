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
  lat         : number | null;
  lng         : number | null;
  source_label: string;
  deep_link   : string | null;
}

export interface AreaRef {
  stateCode: string | null;
  lgaCode  : string | null;
  /** Community incidents carry a centroid but no LGA, so they match by distance. */
  lat      : number | null;
  lng      : number | null;
}

export async function fetchAreaFeed(
  area: AreaRef,
  limit: number,
  before?: string | null,
): Promise<FeedRow[]> {
  const { data, error } = await supabase.rpc('get_area_feed', {
    p_state_code: area.stateCode,
    p_lga_code  : area.lgaCode,
    p_lat       : area.lat,
    p_lng       : area.lng,
    p_limit     : limit,
    p_before    : before ?? null,
  });
  if (error) throw error;
  return (data ?? []) as FeedRow[];
}
