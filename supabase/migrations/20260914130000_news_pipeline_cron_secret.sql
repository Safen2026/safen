-- ════════════════════════════════════════════════════════════════════
-- news_pipeline_cron_secret
--
-- Supersedes the jobs from 20260914120000_news_pipeline_cron. Those
-- authenticated with the publishable key alone. That key ships in the app
-- bundle, so anyone could extract it and call enrich-news in a loop,
-- running up the Anthropic bill.
--
-- Both functions now also require an x-cron-secret header matching their
-- NEWS_CRON_SECRET env var. The value lives in Supabase Vault and is read
-- at run time, so it never appears in git or in cron.job.command.
--
-- The publishable key stays in Authorization only because verify_jwt = true
-- requires a key at the gateway. It is not what authorizes the call.
--
-- One-time setup, run BEFORE or right after this migration (same value in
-- both places):
--
--   select vault.create_secret('<long random value>', 'news_cron_secret');
--   supabase secrets set NEWS_CRON_SECRET=<same value>
--
-- Until both are set, the jobs get 401s and nothing is spent. That is
-- deliberate: it fails closed.
-- ════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'news_cron_secret') then
    raise warning 'vault secret news_cron_secret is not set; news cron jobs will be rejected (401) until it is';
  end if;
end $$;

-- Replace, never stack.
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
      'Authorization', 'Bearer sb_publishable_a3re3cHHH3ICwvgMmMFR3A_FqzgL7Tn',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'news_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

select cron.schedule(
  'news-enrich-daily',
  '10,25,40 5 * * *',
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
