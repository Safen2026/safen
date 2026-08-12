do $$
begin
  -- Whitespace and casing must not change the fingerprint.
  assert public.report_payload_fingerprint('security', 'Man  took   my  BAG')
       = public.report_payload_fingerprint('  SECURITY ', 'man took my bag'),
    'fingerprint is not normalisation-stable';

  -- Different meaning must change it.
  assert public.report_payload_fingerprint('security', 'man took my bag')
      <> public.report_payload_fingerprint('security', 'man took my car'),
    'fingerprint collides on different descriptions';

  -- Shape.
  assert public.report_payload_fingerprint('fire', 'smoke') ~ '^[0-9a-f]{64}$',
    'fingerprint is not 64 lowercase hex chars';

  -- Agreement with the TypeScript implementation. Regenerate with:
  --   npx deno@2 run supabase/functions/_shared/emit_fingerprint.ts "security" "Man  took   my  BAG"
  assert public.report_payload_fingerprint('security', 'Man  took   my  BAG')
       = current_setting('safen.expected_fp', true),
    format('SQL/TS fingerprint drift: sql=%s ts=%s',
           public.report_payload_fingerprint('security', 'Man  took   my  BAG'),
           current_setting('safen.expected_fp', true));
end $$;
