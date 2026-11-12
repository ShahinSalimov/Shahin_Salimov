-- =============================================================================
-- Stage 5: change detection, impact analysis and AI usage tracking
--   * changes.analysis / analyzed_at  — summary of the latest impact analysis
--   * ai_usage                         — every AI call: tokens, estimated cost, outcome
--   * save_change_analysis()           — atomically replaces impacts + pending proposals
-- AI never approves anything: proposals are always inserted as pending/not_started,
-- and approval changes remain admin-only (guard_proposal_decision trigger).
-- =============================================================================

alter table public.changes
  add column analysis jsonb check (analysis is null or jsonb_typeof(analysis) = 'object'),
  add column analyzed_at timestamptz;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  change_id uuid,
  operation text not null check (operation in ('impact_analysis')),
  provider text not null check (provider in ('claude')),
  model text not null check (char_length(model) <= 100),
  status text not null check (status in ('succeeded', 'failed', 'rejected_output')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) check (cost_usd is null or cost_usd >= 0),
  attempts integer not null default 1 check (attempts between 1 and 10),
  duration_ms integer check (duration_ms >= 0),
  error text check (char_length(error) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (change_id, workspace_id) references public.changes (id, workspace_id) on delete set null (change_id)
);
create index ai_usage_workspace_idx on public.ai_usage (workspace_id, created_at desc);
create trigger ai_usage_stamp_created_by before insert on public.ai_usage
  for each row execute function public.stamp_created_by();

alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy ai_usage_insert on public.ai_usage for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'editor'));
-- Usage records are never edited or deleted by clients.
grant select, insert on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

create or replace function public.save_change_analysis(
  p_change_id uuid,
  p_impacts jsonb,
  p_proposals jsonb,
  p_analysis jsonb
)
returns table (impacts_saved integer, proposals_created integer, proposals_kept integer, new_status public.change_status)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.changes;
  n_impacts integer := 0;
  n_created integer := 0;
  n_kept integer := 0;
  st public.change_status;
begin
  if jsonb_typeof(p_impacts) <> 'array' or jsonb_typeof(p_proposals) <> 'array' then
    raise exception 'Impacts and proposals must be JSON arrays' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_impacts) > 1000 or jsonb_array_length(p_proposals) > 1000 then
    raise exception 'Too many impacts (max 1000)' using errcode = 'P0001';
  end if;

  select * into c from public.changes where id = p_change_id for update;
  if not found then
    raise exception 'Change not found' using errcode = 'P0001';
  end if;
  if c.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'A closed change cannot be analyzed again' using errcode = 'P0001';
  end if;

  -- Replace the previous analysis. Decided proposals (and their history) are kept.
  delete from public.change_impacts where change_id = c.id;
  delete from public.update_proposals
   where change_id = c.id and approval_status = 'pending' and execution_status = 'not_started';
  select count(*)::int into n_kept from public.update_proposals where change_id = c.id;

  insert into public.change_impacts (workspace_id, change_id, asset_id, impact_level, depth, relationship_path, old_value, new_value, confidence, recommended_action, origin)
  select c.workspace_id, c.id, i.asset_id, i.impact_level, i.depth, coalesce(i.relationship_path, '[]'::jsonb), i.old_value, i.new_value, i.confidence, i.recommended_action, i.origin
    from jsonb_to_recordset(p_impacts) as i(
      asset_id uuid, impact_level public.impact_level, depth integer, relationship_path jsonb, old_value text, new_value text,
      confidence numeric, recommended_action text, origin public.record_origin
    );
  get diagnostics n_impacts = row_count;

  insert into public.update_proposals (workspace_id, change_id, change_impact_id, target_asset_id, current_value, proposed_value, reason, evidence, impact_level, origin)
  select c.workspace_id, c.id, ci.id, p.target_asset_id, p.current_value, p.proposed_value, p.reason, coalesce(p.evidence, '[]'::jsonb), p.impact_level, p.origin
    from jsonb_to_recordset(p_proposals) as p(
      target_asset_id uuid, current_value text, proposed_value text, reason text, evidence jsonb, impact_level public.impact_level, origin public.record_origin
    )
    left join public.change_impacts ci on ci.change_id = c.id and ci.asset_id = p.target_asset_id
   where not exists (select 1 from public.update_proposals up where up.change_id = c.id and up.target_asset_id = p.target_asset_id);
  get diagnostics n_created = row_count;

  st := case
    when exists (select 1 from public.update_proposals where change_id = c.id and approval_status in ('pending', 'needs_revision')) then 'pending_approval'::public.change_status
    else 'analyzed'::public.change_status
  end;
  update public.changes set analysis = p_analysis, analyzed_at = now(), status = st where id = c.id;

  return query select n_impacts, n_created, n_kept, st;
end;
$$;

revoke all on function public.save_change_analysis(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_change_analysis(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

-- Fact history of one asset version (for change detection between versions).
create index if not exists extracted_facts_asset_version_idx on public.extracted_facts (asset_id, asset_version) where asset_version is not null;
