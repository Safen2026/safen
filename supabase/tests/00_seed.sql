-- Rehearsal seed. Runs first (filename sorts before 01_*).
--
-- The suite needs three DISTINCT reporters: 07_clusters asserts a cluster with
-- two distinct reporters, and 08's late-joiner block needs a third (it silently
-- no-ops with only two, which would hide the very bug it exists to catch).
--
-- Idempotent: does nothing once three profiles exist, so re-running the suite
-- is safe.
--
-- `public.profiles.id` is assumed to reference `auth.users.id` (the standard
-- Supabase pattern) but that FK is unconfirmed — see DATABASE_SCHEMA.md's open
-- questions. This handles both cases: it attempts the auth.users row first and
-- carries on if that is not possible, then inserts the profile. If the FK does
-- exist and the auth insert failed, the profile insert raises and you will see
-- it as a clear failure here rather than as a confusing error three files later.
do $$
declare
  v_have int;
  v_id   uuid;
  i      int;
begin
  select count(*) into v_have from public.profiles;
  if v_have >= 3 then
    raise notice 'seed: % profiles already present, nothing to do', v_have;
    return;
  end if;

  for i in 1..(3 - v_have) loop
    v_id := gen_random_uuid();

    begin
      insert into auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      )
      values (
        v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        format('rehearsal+%s@example.test', v_id),
        '', now(), now(), '{}'::jsonb, '{}'::jsonb
      );
    exception when others then
      raise notice 'seed: could not create auth.users row (%). Continuing — this is fine if profiles has no FK to auth.users.', sqlerrm;
    end;

    insert into public.profiles (id, full_name)
    values (v_id, format('Rehearsal Reporter %s', i))
    on conflict (id) do nothing;
  end loop;

  select count(*) into v_have from public.profiles;
  assert v_have >= 3,
    format('seed: only %s profiles after seeding; the cluster tests need 3 distinct reporters', v_have);
  raise notice 'seed: % profiles available', v_have;
end $$;
