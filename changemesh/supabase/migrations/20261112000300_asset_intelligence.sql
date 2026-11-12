-- =============================================================================
-- Stage 3: Asset Intelligence
--   * asset_scans      — history of every scan / upload attempt, with honest status
--   * extracted_facts  — normalized information extracted from assets
--   * start_asset_scan() / record_scan_result() — atomic scan lifecycle
--   * asset_fact_counts — per-asset count of current facts (RLS-aware view)
-- =============================================================================

create type public.extraction_method as enum ('csv', 'html', 'json_ld', 'pdf_text', 'plain_text', 'manual');

create table public.asset_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  asset_id uuid not null,
  kind text not null check (kind in ('website', 'upload')),
  status public.scan_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  asset_version integer check (asset_version is null or asset_version >= 1),
  facts_count integer not null default 0 check (facts_count >= 0),
  error text check (char_length(error) <= 2000),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  created_by uuid references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  foreign key (asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade
);
create index asset_scans_asset_idx on public.asset_scans (asset_id, started_at desc);
create index asset_scans_workspace_idx on public.asset_scans (workspace_id, started_at desc);

create table public.extracted_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  asset_id uuid not null,
  -- Version of the asset content the fact was read from. NULL for manual facts,
  -- which are entered by people and stay valid across content versions.
  asset_version integer check (asset_version is null or asset_version >= 1),
  scan_id uuid,
  entity_name text not null check (char_length(entity_name) between 1 and 300),
  attribute_name text not null check (char_length(attribute_name) between 1 and 200),
  value_text text not null check (char_length(value_text) between 1 and 2000),
  value_number numeric,
  value_unit text check (char_length(value_unit) <= 16),
  normalized_value text not null check (char_length(normalized_value) <= 2000),
  source_location jsonb not null default '{}'::jsonb check (jsonb_typeof(source_location) = 'object'),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  method public.extraction_method not null,
  origin public.record_origin not null default 'scan',
  extracted_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint manual_facts_are_unversioned check ((method = 'manual') = (asset_version is null)),
  foreign key (asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade,
  foreign key (scan_id, workspace_id) references public.asset_scans (id, workspace_id) on delete set null (scan_id)
);
create index extracted_facts_asset_idx on public.extracted_facts (asset_id, asset_version);
create index extracted_facts_lookup_idx on public.extracted_facts (workspace_id, lower(entity_name), lower(attribute_name));

-- Authorship is stamped from the JWT (function from migration 000200).
create trigger asset_scans_stamp_created_by before insert on public.asset_scans
  for each row execute function public.stamp_created_by();
create trigger extracted_facts_stamp_created_by before insert on public.extracted_facts
  for each row execute function public.stamp_created_by();

-- Audit manual facts (people's edits). Scanned facts are covered by the scan record.
create trigger extracted_facts_audit_insert after insert on public.extracted_facts
  for each row when (new.method = 'manual') execute function public.audit_row_change();
create trigger extracted_facts_audit_delete after delete on public.extracted_facts
  for each row when (old.method = 'manual') execute function public.audit_row_change();

alter table public.asset_scans enable row level security;
alter table public.extracted_facts enable row level security;

create policy asset_scans_select on public.asset_scans for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy asset_scans_insert on public.asset_scans for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor'));
create policy asset_scans_update on public.asset_scans for update to authenticated
  using (public.has_workspace_role(workspace_id, 'editor'))
  with check (public.has_workspace_role(workspace_id, 'editor'));

create policy extracted_facts_select on public.extracted_facts for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy extracted_facts_insert on public.extracted_facts for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor'));
create policy extracted_facts_delete on public.extracted_facts for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'editor'));

grant select, insert, update on public.asset_scans to authenticated;
grant select, insert, delete on public.extracted_facts to authenticated;
grant all on public.asset_scans, public.extracted_facts to service_role;

-- Current facts per asset: manual facts + facts of the current content version.
create view public.asset_fact_counts
with (security_invoker = true) as
select f.asset_id, f.workspace_id, count(*)::int as facts_count
from public.extracted_facts f
join public.assets a on a.id = f.asset_id
where f.asset_version is null or f.asset_version = a.current_version
group by f.asset_id, f.workspace_id;

revoke all on public.asset_fact_counts from anon;
grant select on public.asset_fact_counts to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- start_asset_scan: one running scan per asset; stale scans are closed honestly.
-- ---------------------------------------------------------------------------
create or replace function public.start_asset_scan(p_asset_id uuid, p_kind text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.assets;
  scan_id uuid;
begin
  if (select auth.uid()) is null and current_user <> 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into a from public.assets where id = p_asset_id for update;
  if not found then
    raise exception 'Asset not found' using errcode = 'P0001';
  end if;

  -- A scan that has been "running" for over 5 minutes did not finish: say so.
  update public.asset_scans
     set status = 'failed', finished_at = now(), error = 'The scan did not finish (timed out or the server stopped). No results were saved.'
   where asset_id = p_asset_id and status = 'running' and started_at < now() - interval '5 minutes';

  if exists (select 1 from public.asset_scans where asset_id = p_asset_id and status = 'running') then
    raise exception 'A scan is already running for this asset' using errcode = 'P0001';
  end if;

  insert into public.asset_scans (workspace_id, asset_id, kind, status)
  values (a.workspace_id, p_asset_id, p_kind, 'running')
  returning id into scan_id;

  update public.assets set scan_status = 'running' where id = p_asset_id;
  return scan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_scan_result: atomically stores the outcome of a scan.
--   succeeded/partial + new content hash -> new asset version + its facts
--   succeeded/partial + same content hash -> no new version, facts unchanged
--   failed                                -> asset keeps its previous version
-- ---------------------------------------------------------------------------
create or replace function public.record_scan_result(
  p_scan_id uuid,
  p_status public.scan_status,
  p_content_hash text,
  p_summary jsonb,
  p_facts jsonb,
  p_warnings jsonb,
  p_error text,
  p_stats jsonb
)
returns table (asset_version integer, new_version boolean, facts_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.asset_scans;
  a public.assets;
  latest_hash text;
  v integer;
  is_new boolean := false;
  n integer := 0;
begin
  if p_status not in ('succeeded', 'partial', 'failed') then
    raise exception 'A finished scan must be succeeded, partial or failed' using errcode = 'P0001';
  end if;
  if p_facts is null or jsonb_typeof(p_facts) <> 'array' then
    raise exception 'Facts must be a JSON array' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_facts) > 5000 then
    raise exception 'Too many facts in one scan (max 5000)' using errcode = 'P0001';
  end if;
  if p_status = 'failed' and coalesce(trim(p_error), '') = '' then
    raise exception 'A failed scan needs an error message' using errcode = 'P0001';
  end if;

  select * into s from public.asset_scans where id = p_scan_id for update;
  if not found then
    raise exception 'Scan not found' using errcode = 'P0001';
  end if;
  if s.status <> 'running' then
    raise exception 'This scan has already finished' using errcode = 'P0001';
  end if;
  select * into a from public.assets where id = s.asset_id for update;

  v := a.current_version;

  if p_status in ('succeeded', 'partial') then
    select av.content_hash into latest_hash from public.asset_versions av
     where av.asset_id = a.id order by av.version desc limit 1;

    if latest_hash is distinct from p_content_hash then
      is_new := true;
      v := a.current_version + 1;
      insert into public.asset_versions (workspace_id, asset_id, version, content_hash, summary)
      values (a.workspace_id, a.id, v, p_content_hash, coalesce(p_summary, '{}'::jsonb));

      insert into public.extracted_facts (
        workspace_id, asset_id, asset_version, scan_id, entity_name, attribute_name, value_text,
        value_number, value_unit, normalized_value, source_location, confidence, method, origin
      )
      select a.workspace_id, a.id, v, s.id, f.entity_name, f.attribute_name, f.value_text,
             f.value_number, f.value_unit, f.normalized_value, coalesce(f.source_location, '{}'::jsonb), f.confidence, f.method, 'scan'
        from jsonb_to_recordset(p_facts) as f(
          entity_name text, attribute_name text, value_text text, value_number numeric, value_unit text,
          normalized_value text, source_location jsonb, confidence numeric, method public.extraction_method
        );
      get diagnostics n = row_count;
    else
      select count(*)::int into n from public.extracted_facts ef where ef.asset_id = a.id and ef.asset_version = v;
    end if;

    update public.assets
       set scan_status = p_status,
           last_scanned_at = now(),
           last_scan_error = case when p_status = 'partial' then left(p_error, 2000) else null end,
           current_version = v
     where id = a.id;
  else
    update public.assets
       set scan_status = 'failed', last_scanned_at = now(), last_scan_error = left(p_error, 2000)
     where id = a.id;
  end if;

  update public.asset_scans
     set status = p_status,
         finished_at = now(),
         asset_version = case when p_status = 'failed' then null else nullif(v, 0) end,
         facts_count = n,
         error = left(p_error, 2000),
         warnings = coalesce(p_warnings, '[]'::jsonb),
         stats = coalesce(p_stats, '{}'::jsonb)
   where id = s.id;

  return query select nullif(v, 0), is_new, n;
end;
$$;

revoke all on function public.start_asset_scan(uuid, text) from public, anon;
revoke all on function public.record_scan_result(uuid, public.scan_status, text, jsonb, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.start_asset_scan(uuid, text) to authenticated, service_role;
grant execute on function public.record_scan_result(uuid, public.scan_status, text, jsonb, jsonb, jsonb, text, jsonb) to authenticated, service_role;
