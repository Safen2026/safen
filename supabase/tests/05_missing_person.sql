do $$
declare
  v_user uuid; v_reason text;
begin
  select id into v_user from public.profiles limit 1;
  update public.app_settings set quality_gate_mode = 'enforcing';

  -- Each of the four omissions must be rejected, WITHOUT any AI involvement.
  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', null,
            now(), 'Ikeja/CR/1123', 6.6, 3.35);
    assert false, 'accepted a missing-person report with no photo';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_PHOTO%', format('wrong error: %s', sqlerrm);
  end;

  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', array['https://x/1.jpg'],
            null, 'Ikeja/CR/1123', 6.6, 3.35);
    assert false, 'accepted a missing-person report with no last_seen_at';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_LAST_SEEN%', format('wrong error: %s', sqlerrm);
  end;

  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', array['https://x/1.jpg'],
            now(), '   ', 6.6, 3.35);
    assert false, 'accepted a missing-person report with a blank police reference';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_POLICE_REF%', format('wrong error: %s', sqlerrm);
  end;

  begin
    insert into public.reports (user_id, category, description, status, media_paths,
                                last_seen_at, police_reference, latitude, longitude)
    values (v_user, 'missing_person', 'my brother is missing', 'open', array['https://x/1.jpg'],
            now(), 'Ikeja/CR/1123', null, null);
    assert false, 'accepted a missing-person report with no coordinates';
  exception when others then
    assert sqlerrm like '%MISSING_PERSON_LOCATION%', format('wrong error: %s', sqlerrm);
  end;

  -- Other categories are unaffected by these rules.
  update public.app_settings set quality_gate_mode = 'advisory';
end $$;
