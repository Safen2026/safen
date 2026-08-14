-- Postgres grants EXECUTE to PUBLIC on new functions, and PostgREST exposes
-- every function in `public` as an RPC endpoint. These are SECURITY DEFINER
-- helpers meant only for the Edge Function's service-role client: left open,
-- any authenticated user could strike (and therefore ban) any other user, or
-- clear their own ban by recording a fresh strike.
revoke execute on function public.record_strike(uuid, text)   from public, anon, authenticated;
revoke execute on function public.strike_state(uuid)          from public, anon, authenticated;
revoke execute on function public.ai_calls_today(uuid)        from public, anon, authenticated;

-- Read-only helpers: harmless to call but nothing outside the server needs them.
revoke execute on function public.report_payload_fingerprint(text, text) from public, anon, authenticated;
revoke execute on function public.sha256_hex(text)                        from public, anon, authenticated;
revoke execute on function public.current_settings()                      from public, anon, authenticated;

-- cluster_report() filters incident_clusters on (category, last_reported_at)
-- plus a lat/lng bounding box, on EVERY geolocated report insert. The existing
-- reports_geo_time_idx is on a different table and does not serve it.
create index if not exists incident_clusters_cat_time_idx
  on public.incident_clusters (category, last_reported_at desc);
