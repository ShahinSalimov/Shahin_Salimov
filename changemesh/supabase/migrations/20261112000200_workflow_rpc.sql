-- =============================================================================
-- Stage 2: workflow hardening
--   * created_by / reviewed_by are always the real caller (cannot be spoofed)
--   * decide_update_proposal(): atomic approve / reject / request-revision
-- =============================================================================

-- Authorship columns are set by the database from the JWT, never trusted from the client.
create or replace function public.stamp_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['assets', 'asset_versions', 'asset_relationships', 'changes', 'update_proposals', 'integrations'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.stamp_created_by()', t || '_stamp_created_by', t);
  end loop;
end;
$$;

create or replace function public.stamp_relationship_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  if current_user = 'authenticated' and new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger asset_relationships_review before update on public.asset_relationships
  for each row execute function public.stamp_relationship_review();

-- Atomic decision on an update proposal. SECURITY INVOKER: the caller's RLS
-- policies and the admin-only guard trigger still apply.
create or replace function public.decide_update_proposal(
  p_proposal_id uuid,
  p_decision public.approval_status,
  p_comment text default null
)
returns public.update_proposals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.update_proposals;
  result public.update_proposals;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_decision = 'pending' then
    raise exception 'A decision must be approved, rejected or needs_revision' using errcode = 'P0001';
  end if;
  if p_decision in ('rejected', 'needs_revision') and coalesce(trim(p_comment), '') = '' then
    raise exception 'A comment is required when rejecting or requesting a revision' using errcode = 'P0001';
  end if;

  select * into current_row from public.update_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0001';
  end if;
  if current_row.approval_status in ('approved', 'rejected') then
    raise exception 'This proposal has already been decided' using errcode = 'P0001';
  end if;

  update public.update_proposals
     set approval_status = p_decision
   where id = p_proposal_id
  returning * into result;

  insert into public.approvals (workspace_id, proposal_id, decision, comment, decided_by)
  values (current_row.workspace_id, p_proposal_id, p_decision, nullif(trim(p_comment), ''), (select auth.uid()));

  return result;
end;
$$;

revoke all on function public.decide_update_proposal(uuid, public.approval_status, text) from public, anon;
grant execute on function public.decide_update_proposal(uuid, public.approval_status, text) to authenticated;
