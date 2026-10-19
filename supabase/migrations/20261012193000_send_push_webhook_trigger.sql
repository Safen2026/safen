-- ════════════════════════════════════════════════════════════════════
-- send_push_webhook_trigger
--
-- Uses pg_net (built into every Supabase project) to call the
-- send-push Edge Function on every INSERT into public.notifications.
-- Reads the webhook secret securely from Supabase Vault at runtime
-- so no raw secret keys are exposed in migrations or git.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_send_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret'
  limit 1;

  perform net.http_post(
    url     := 'https://ujbknxfvatvtwthxtytu.supabase.co/functions/v1/send-push',
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'notifications',
                 'schema', 'public',
                 'record', jsonb_build_object('id', NEW.id)
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', coalesce(v_secret, '')
               )
  );
  return NEW;
end;
$$;

drop trigger if exists on_notification_insert on public.notifications;

create trigger on_notification_insert
  after insert on public.notifications
  for each row
  execute function public.trigger_send_push();
