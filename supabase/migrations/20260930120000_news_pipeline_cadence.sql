-- ════════════════════════════════════════════════════════════════════
-- news_pipeline_cadence
--
-- Supersedes the daily jobs from 20260914130000_news_pipeline_cron_secret.
-- Users reported that the feed barely changes, and it could not: ingest
-- ran once a day at 06:00 WAT. An RSS feed only exposes its latest ~10-30
-- articles, and outlets like Punch or Vanguard publish hundreds a day, so
-- a daily poll saw a morning snapshot and missed everything else. With
-- ~92% of articles rejected as not security-relevant, that left 4-14
-- stories a day for the whole country.
--
--   news-ingest  every 30 min  — well inside each feed's rolling window
--   news-enrich  every 10 min  — drains whatever ingest queued
--
-- Measured 2026-09-30, each feed's RSS spans only 1.4-4.8 hours of
-- articles, so even a 12-hourly poll would drop 60-90% of stories. 30
-- minutes stays inside the shortest window (Daily Post, ~1.4h).
--
-- Cost: Anthropic spend tracks article volume, not invocations (an empty
-- queue costs one SELECT). Capturing the whole stream raises volume from
-- ~95 to roughly 800 articles/day, i.e. ~8x the previous Haiku spend.
-- Capacity is ample: 40 rows per enrich run x 144 runs/day, and runs
-- cannot overlap (a full 40-row batch takes ~24s).
--
-- ingest-news auto-disables a source after MAX_CONSECUTIVE_FAILURES
-- polls; that constant is derived from INGEST_INTERVAL_MINUTES in
-- ingest.ts and must be kept in step with the schedule below.
--
-- Auth is unchanged: x-cron-secret from Vault, publishable key only to
-- get past the gateway.
-- ════════════════════════════════════════════════════════════════════

-- Replace, never stack. Covers both the old daily names and these.
select cron.unschedule(jobname) from cron.job
  where jobname in ('news-ingest-daily', 'news-enrich-daily', 'news-ingest', 'news-enrich');

select cron.schedule(
  'news-ingest',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url     := 'https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/ingest-news',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_a3re3cHHH3ICwvgMmMFR3A_FqzgL7Tn',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'news_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

-- Offset by 5 minutes so the first enrich after each ingest sees its rows.
select cron.schedule(
  'news-enrich',
  '5-59/10 * * * *',
  $job$
  select net.http_post(
    url     := 'https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/enrich-news',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_a3re3cHHH3ICwvgMmMFR3A_FqzgL7Tn',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'news_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

comment on column public.news_sources.consecutive_failures is
  'Auto-disabled after one day of consecutive failed polls (48 at the 30-minute cadence). RSS feeds break silently; without this the feed just thins out.';
