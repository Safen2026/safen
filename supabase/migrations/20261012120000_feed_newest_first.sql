-- ════════════════════════════════════════════════════════════════════
-- feed_newest_first
--
-- The feed was ordered by score (severity x 12h recency decay x proximity),
-- so a six-hour-old critical item sat above something published a minute
-- ago. Users read it as a news feed and expect newest on top, so order by
-- time instead.
--
-- This also fixes pagination. The client pages with p_before = the last
-- row's occurred_at, which is only a correct cursor when rows are ordered
-- by occurred_at. Under score ordering a page could end on an old
-- high-score item and the next page would then skip every newer row that
-- had not been shown yet.
--
-- score stays in feed_row (the client type still carries it) and the
-- weight helpers stay defined; only the final ordering changes. Severe
-- nearby items still reach users through the push notifier.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.get_area_feed(
  p_state_code text default null,
  p_lga_code   text default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_limit      integer default 20,
  p_before     timestamptz default null
) returns setof public.feed_row
language sql stable security invoker as $$
  select * from (
    select * from public.get_area_news_items(p_state_code, p_lga_code, p_limit, p_before)
    union all
    select * from public.get_area_community_items(p_lat, p_lng, p_limit, p_before)
  ) merged
  -- id is a stable tiebreak for items sharing a timestamp.
  order by merged.occurred_at desc, merged.id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.get_area_feed(text, text, double precision, double precision, integer, timestamptz) from public;
grant execute on function public.get_area_feed(text, text, double precision, double precision, integer, timestamptz) to authenticated;
