-- =============================================================================
-- Stage 6: approval workflow + update execution
--   * revision loop: needs_revision -> (editor revises) -> pending
--   * approval moves execution to "ready"; nothing executes automatically
--   * update_executions: history of every execution, rollback and simulation
--   * start/finish RPCs: one execution at a time per proposal (no duplicates),
--     admin-only, approved proposals only, idempotency key passed to executors
--   * change status follows its proposals
-- =============================================================================

alter table public.update_proposals
  add column revision_count integer not null default 0 check (revision_count >= 0),
  add column execution_attempts integer not null default 0 check (execution_attempts >= 0);

create table public.update_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_id uuid not null,
  action text not null check (action in ('execute', 'rollback', 'simulate')),
  mode text not null check (mode in ('internal', 'manual', 'integration', 'simulation')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  idempotency_key text not null,
  attempt integer not null default 1 check (attempt >= 1),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error text check (char_length(error) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (proposal_id, workspace_id) references public.update_proposals (id, workspace_id) on delete cascade
);
create index update_executions_workspace_idx on public.update_executions (workspace_id, started_at desc);
create index update_executions_proposal_idx on public.update_executions (proposal_id, started_at desc);
-- At most one running execution or rollback per proposal.
create unique index update_executions_one_running_idx on public.update_executions (proposal_id) where status = 'running' and action <> 'simulate';

create trigger update_executions_stamp_created_by before insert on public.update_executions
  for each row execute function public.stamp_created_by();
create trigger update_executions_audit after insert or update on public.update_executions
  for each row execute function public.audit_row_change();

alter table public.update_executions enable row level security;
create policy update_executions_select on public.update_executions for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Simulations are harmless previews (editor+); real executions are admin-only (checked in the RPCs too).
create policy update_executions_insert on public.update_executions for insert to authenticated
  with check (
    (action = 'simulate' and public.has_workspace_role(workspace_id, 'editor'))
    or (action <> 'simulate' and public.has_workspace_role(workspace_id, 'admin'))
  );
create policy update_executions_update on public.update_executions for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));
grant select, insert, update on public.update_executions to authenticated;
grant all on public.update_executions to service_role;

-- Editors may send a revised proposal back for approval; everything else about
-- approval and execution status stays admin-only.
create or replace function public.guard_proposal_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_revision boolean := old.approval_status = 'needs_revision' and new.approval_status = 'pending' and new.execution_status = old.execution_status;
begin
  if current_user = 'authenticated'
     and (new.approval_status is distinct from old.approval_status or new.execution_status is distinct from old.execution_status)
     and not public.has_workspace_role(new.workspace_id, 'admin')
     and not (is_revision and public.has_workspace_role(new.workspace_id, 'editor')) then
    raise exception 'Only workspace admins can approve, reject or execute proposals' using errcode = '42501';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'idempotency_key is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The change follows its proposals.
create or replace function public.refresh_change_status(p_change_id uuid)
returns public.change_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  st public.change_status;
  cur public.change_status;
begin
  select status into cur from public.changes where id = p_change_id;
  if cur is null or cur = 'cancelled' then
    return cur;
  end if;
  select case
    when bool_or(approval_status in ('pending', 'needs_revision')) then 'pending_approval'
    when bool_or(approval_status = 'approved' and execution_status <> 'completed') then 'approved'
    when bool_or(approval_status = 'approved') then 'completed'
    when count(*) > 0 then 'rejected'
    else null
  end::public.change_status into st
  from public.update_proposals where change_id = p_change_id;
  if st is not null and st is distinct from cur then
    update public.changes set status = st where id = p_change_id;
    return st;
  end if;
  return cur;
end;
$$;

-- Approval now also marks the proposal ready for execution (it never executes it).
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
     set approval_status = p_decision,
         execution_status = case when p_decision = 'approved' then 'ready'::public.execution_status else execution_status end
   where id = p_proposal_id
  returning * into result;

  insert into public.approvals (workspace_id, proposal_id, decision, comment, decided_by)
  values (current_row.workspace_id, p_proposal_id, p_decision, nullif(trim(p_comment), ''), (select auth.uid()));

  perform public.refresh_change_status(current_row.change_id);
  return result;
end;
$$;

create or replace function public.revise_update_proposal(
  p_proposal_id uuid,
  p_proposed_value text,
  p_reason text,
  p_note text
)
returns public.update_proposals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.update_proposals;
  result public.update_proposals;
begin
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Describe what you changed in this revision' using errcode = 'P0001';
  end if;
  select * into p from public.update_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0001';
  end if;
  if p.approval_status <> 'needs_revision' then
    raise exception 'Only proposals that need a revision can be revised' using errcode = 'P0001';
  end if;
  update public.update_proposals
     set proposed_value = left(p_proposed_value, 4000),
         reason = left(p_reason, 4000),
         evidence = evidence || jsonb_build_array(jsonb_build_object('label', 'Revision ' || (p.revision_count + 1), 'detail', left(trim(p_note), 500))),
         approval_status = 'pending',
         revision_count = p.revision_count + 1
   where id = p_proposal_id
  returning * into result;
  perform public.refresh_change_status(p.change_id);
  return result;
end;
$$;

-- Claims a proposal for execution or rollback. The row lock + status checks +
-- the partial unique index make a second concurrent execution impossible.
create or replace function public.start_proposal_execution(
  p_proposal_id uuid,
  p_action text,
  p_mode text
)
returns table (execution_id uuid, idempotency_key text, attempt integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.update_proposals;
  stale boolean;
  exec_id uuid;
  n integer;
begin
  if p_action not in ('execute', 'rollback') then
    raise exception 'Unknown action' using errcode = 'P0001';
  end if;
  select * into p from public.update_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Proposal not found' using errcode = 'P0001';
  end if;
  if not public.has_workspace_role(p.workspace_id, 'admin') then
    raise exception 'Only workspace admins can execute updates' using errcode = '42501';
  end if;
  if p.approval_status <> 'approved' then
    raise exception 'Only approved proposals can be executed' using errcode = 'P0001';
  end if;

  -- An execution stuck "in progress" for 10 minutes did not finish: close it honestly.
  select exists (
    select 1 from public.update_executions e
     where e.proposal_id = p.id and e.status = 'running' and e.action <> 'simulate' and e.started_at < now() - interval '10 minutes'
  ) into stale;
  if stale then
    update public.update_executions set status = 'failed', finished_at = now(), error = 'The execution did not finish (timed out or the server stopped). Its outcome is unknown; check the target before retrying.'
     where proposal_id = p.id and status = 'running' and action <> 'simulate';
    update public.update_proposals set execution_status = 'failed' where id = p.id and execution_status = 'in_progress';
    select * into p from public.update_proposals where id = p_proposal_id;
  end if;

  if p_action = 'execute' and p.execution_status not in ('ready', 'failed', 'not_started') then
    raise exception 'This update is % and cannot be executed again', replace(p.execution_status::text, '_', ' ') using errcode = 'P0001';
  end if;
  if p_action = 'rollback' and p.execution_status <> 'completed' then
    raise exception 'Only completed updates can be rolled back' using errcode = 'P0001';
  end if;

  n := p.execution_attempts + 1;
  update public.update_proposals set execution_status = 'in_progress', execution_attempts = n where id = p.id;
  insert into public.update_executions (workspace_id, proposal_id, action, mode, idempotency_key, attempt)
  values (p.workspace_id, p.id, p_action, p_mode, p.idempotency_key, n)
  returning id into exec_id;
  return query select exec_id, p.idempotency_key, n;
end;
$$;

create or replace function public.finish_proposal_execution(
  p_execution_id uuid,
  p_succeeded boolean,
  p_result jsonb,
  p_error text
)
returns public.execution_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.update_executions;
  p public.update_proposals;
  st public.execution_status;
begin
  select * into e from public.update_executions where id = p_execution_id for update;
  if not found then
    raise exception 'Execution not found' using errcode = 'P0001';
  end if;
  if e.status <> 'running' then
    raise exception 'This execution has already finished' using errcode = 'P0001';
  end if;
  if not p_succeeded and coalesce(trim(p_error), '') = '' then
    raise exception 'A failed execution needs an error message' using errcode = 'P0001';
  end if;
  select * into p from public.update_proposals where id = e.proposal_id for update;

  st := case
    when e.action = 'execute' and p_succeeded then 'completed'
    when e.action = 'execute' then 'failed'
    when e.action = 'rollback' and p_succeeded then 'ready'
    else 'completed' -- a failed rollback leaves the applied update in place
  end;

  update public.update_executions
     set status = case when p_succeeded then 'succeeded' else 'failed' end,
         result = coalesce(p_result, '{}'::jsonb),
         error = left(p_error, 2000),
         finished_at = now()
   where id = e.id;
  update public.update_proposals
     set execution_status = st,
         execution_result = jsonb_build_object('action', e.action, 'mode', e.mode, 'succeeded', p_succeeded, 'executionId', e.id, 'at', now()) || coalesce(p_result, '{}'::jsonb),
         executed_at = case when e.action = 'execute' and p_succeeded then now() when e.action = 'rollback' and p_succeeded then null else executed_at end
   where id = p.id;
  perform public.refresh_change_status(p.change_id);
  return st;
end;
$$;

revoke all on function public.refresh_change_status(uuid) from public, anon;
revoke all on function public.revise_update_proposal(uuid, text, text, text) from public, anon;
revoke all on function public.start_proposal_execution(uuid, text, text) from public, anon;
revoke all on function public.finish_proposal_execution(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.refresh_change_status(uuid) to authenticated, service_role;
grant execute on function public.revise_update_proposal(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.start_proposal_execution(uuid, text, text) to authenticated, service_role;
grant execute on function public.finish_proposal_execution(uuid, boolean, jsonb, text) to authenticated, service_role;
