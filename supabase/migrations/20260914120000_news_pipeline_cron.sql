-- ════════════════════════════════════════════════════════════════════
-- news_pipeline_cron
--
-- The feed pipeline had no scheduler: ingest-news and enrich-news were
-- only ever invoked by hand, so news_items_raw stayed empty and the feed
-- rendered blank for every user. This schedules both, daily.
--
-- Timing is WAT-relative (UTC+1), because the audience is Nigerian:
--   05:00 UTC = 06:00 WAT  ingest — overnight national news is up by then
--   05:10/25/40 UTC        enrich — drains what ingest just queued
--
-- Why enrich fires three times off one daily job: enrich-news processes
-- BATCH_SIZE = 40 per invocation, and a full six-source poll yields ~95
-- items. One run a day would leave a permanent, growing backlog. Three
-- staggered runs clear ~120 — headroom over observed volume. The cadence
-- is still daily; only the drain is batched.
--
-- Auth uses the PUBLISHABLE key, not the service-role key. It is already
-- public by design (it ships in eas.json and in the app bundle), so it is
-- not a secret being introduced to git here. Both functions run
-- verify_jwt = true and reach the database through their own service-role
-- client, so this header only gets them past the gateway.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- Re-running this migration must not stack duplicate jobs.
select cron.unschedule('news-ingest-daily')
  where exists (select 1 from cron.job where jobname = 'news-ingest-daily');
select cron.unschedule('news-enrich-daily')
  where exists (select 1 from cron.job where jobname = 'news-enrich-daily');

select cron.schedule(
  'news-ingest-daily',
  '0 5 * * *',
  $job$
  select net.http_post(
    url     := 'https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/ingest-news',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_a3re3cHHH3ICwvgMmMFR3A_FqzgL7Tn'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

-- 24s observed for a full 40-item batch; 120s leaves room for a slow
-- Anthropic response without the worker abandoning the reply.
select cron.schedule(
  'news-enrich-daily',
  '10,25,40 5 * * *',
  $job$
  select net.http_post(
    url     := 'https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/enrich-news',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_a3re3cHHH3ICwvgMmMFR3A_FqzgL7Tn'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
