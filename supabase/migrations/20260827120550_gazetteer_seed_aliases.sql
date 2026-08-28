-- Landmark / district aliases that Nigerian news copy uses in place of an LGA
-- name. alias_norm is lowercase, punctuation-stripped and whitespace-collapsed;
-- resolveLocations() in _shared/gazetteer.ts normalises identically.
--
-- Must run AFTER 20260827120500_gazetteer_seed_lgas.sql: lga_code is a foreign
-- key into ng_lgas.
--
-- The two 'sabon gari' rows are deliberate. It is a real LGA in Kaduna and a
-- well-known quarter of Fagge in Kano, so the alias is genuinely ambiguous and
-- is resolved by state context.
insert into public.ng_place_aliases (alias_norm, state_code, lga_code) values
  ('ikeja gra',       'LA', 'LA-ikeja'),
  ('allen avenue',    'LA', 'LA-ikeja'),
  ('computer village','LA', 'LA-ikeja'),
  ('maryland',        'LA', 'LA-ikeja'),
  ('victoria island', 'LA', 'LA-eti-osa'),
  ('lekki',           'LA', 'LA-eti-osa'),
  ('ajah',            'LA', 'LA-eti-osa'),
  ('ikoyi',           'LA', 'LA-eti-osa'),
  ('yaba',            'LA', 'LA-lagos-mainland'),
  ('surulere',        'LA', 'LA-surulere'),
  ('oshodi',          'LA', 'LA-oshodi-isolo'),
  ('wuse',            'FC', 'FC-abuja'),
  ('wuse ii',         'FC', 'FC-abuja'),
  ('garki',           'FC', 'FC-abuja'),
  ('maitama',         'FC', 'FC-abuja'),
  ('asokoro',         'FC', 'FC-abuja'),
  ('gwarinpa',        'FC', 'FC-abuja'),
  ('kubwa',           'FC', 'FC-bwari'),
  ('sabon gari',      'KN', 'KN-fagge'),
  ('sabon gari',      'KD', 'KD-sabon-gari'),
  ('port harcourt',   'RI', 'RI-port-harcourt'),
  ('gra phase 2',     'RI', 'RI-port-harcourt')
on conflict (alias_norm, state_code, lga_code) do nothing;

-- Every alias must point at an LGA that actually exists.
do $$
declare bad integer;
begin
  select count(*) into bad
  from public.ng_place_aliases a
  left join public.ng_lgas l on l.code = a.lga_code
  where a.lga_code is not null and l.code is null;
  if bad > 0 then
    raise exception '% alias rows reference a non-existent LGA', bad;
  end if;
end $$;
