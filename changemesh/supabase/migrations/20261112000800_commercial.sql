-- =============================================================================
-- Stage 7: commercial SaaS
--   * plan limits enforced in the database (assets, workspaces)
--   * invitations (hashed tokens, expiry, email-bound acceptance)
--   * in-app notifications (written by triggers)
--   * API keys (hashed, scoped, revocable)
--   * Stripe: price/customer columns + processed webhook events (idempotency)
-- =============================================================================

alter type public.record_origin add value if not exists 'api';

alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists last_event_at timestamptz;

create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- No policies: only the service role (webhook handler) touches this table.
grant all on public.stripe_events to service_role;

-- ---------------------------------------------------------------------------
-- Plan limits. Without an active subscription an organization gets Starter limits.
-- NULL means unlimited / custom. Team size is metered but not limited: the
-- proposed plans do not define a member cap.
-- ---------------------------------------------------------------------------
create or replace function public.organization_limits(org uuid)
returns table (plan text, assets_limit integer, workspaces_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select plan::text as plan from public.subscriptions
     where organization_id = org and status in ('trialing', 'active', 'past_due')
  )
  select coalesce((select plan from s), 'starter') as plan,
         case coalesce((select plan from s), 'starter') when 'starter' then 25 when 'business' then 250 when 'agency' then 1000 else null end,
         case coalesce((select plan from s), 'starter') when 'starter' then 1 when 'business' then 5 else null end;
$$;

create or replace function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  lim record;
  used integer;
begin
  if tg_table_name = 'assets' then
    if new.status <> 'active' then return new; end if;
    select organization_id into org from public.workspaces where id = new.workspace_id;
    select * into lim from public.organization_limits(org);
    if lim.assets_limit is not null then
      select count(*) into used from public.assets a join public.workspaces w on w.id = a.workspace_id
       where w.organization_id = org and a.status = 'active' and a.id <> new.id;
      if used >= lim.assets_limit then
        raise exception 'Plan limit reached: your % plan includes % assets. Archive assets or upgrade the plan.', lim.plan, lim.assets_limit using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name = 'workspaces' then
    select * into lim from public.organization_limits(new.organization_id);
    if lim.workspaces_limit is not null then
      select count(*) into used from public.workspaces where organization_id = new.organization_id and id <> new.id;
      if used >= lim.workspaces_limit then
        raise exception 'Plan limit reached: your % plan includes % workspace(s). Upgrade to add more.', lim.plan, lim.workspaces_limit using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger assets_plan_limit before insert or update of status on public.assets
  for each row execute function public.enforce_plan_limits();
create trigger workspaces_plan_limit before insert on public.workspaces
  for each row execute function public.enforce_plan_limits();

grant execute on function public.organization_limits(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role public.workspace_role not null check (role <> 'owner'),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_workspace_idx on public.invitations (workspace_id, created_at desc);
create unique index invitations_one_open_per_email on public.invitations (workspace_id, lower(email)) where accepted_at is null and revoked_at is null;
create or replace function public.stamp_invited_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.invited_by := (select auth.uid());
    new.accepted_at := null;
    new.accepted_by := null;
    new.revoked_at := null;
  end if;
  return new;
end;
$$;
create trigger invitations_stamp before insert on public.invitations
  for each row execute function public.stamp_invited_by();

alter table public.invitations enable row level security;
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'admin'));
create policy invitations_revoke on public.invitations for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin') and accepted_at is null)
  with check (public.has_workspace_role(workspace_id, 'admin'));
grant select, insert, update (revoked_at) on public.invitations to authenticated;
grant all on public.invitations to service_role;
create trigger invitations_audit after insert or update on public.invitations
  for each row execute function public.audit_row_change();

-- Information about an invitation for the person holding the link (no other data).
create or replace function public.invitation_preview(p_token_hash text)
returns table (workspace_name text, organization_name text, role public.workspace_role, email text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name, o.name, i.role, i.email,
         case when i.revoked_at is not null then 'revoked'
              when i.accepted_at is not null then 'accepted'
              when i.expires_at < now() then 'expired'
              else 'open' end
    from public.invitations i
    join public.workspaces w on w.id = i.workspace_id
    join public.organizations o on o.id = w.organization_id
   where i.token_hash = p_token_hash;
$$;

create or replace function public.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invitations;
  user_email text;
  org uuid;
begin
  if uid is null then
    raise exception 'Sign in to accept the invitation' using errcode = '42501';
  end if;
  select * into inv from public.invitations where token_hash = p_token_hash for update;
  if not found then
    raise exception 'This invitation link is not valid' using errcode = 'P0001';
  end if;
  if inv.revoked_at is not null then
    raise exception 'This invitation was revoked' using errcode = 'P0001';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invitation was already used' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invitation has expired; ask for a new one' using errcode = 'P0001';
  end if;
  select email into user_email from public.profiles where id = uid;
  if lower(coalesce(user_email, '')) <> lower(inv.email) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  select organization_id into org from public.workspaces where id = inv.workspace_id;
  insert into public.organization_members (organization_id, user_id, role) values (org, uid, 'member') on conflict do nothing;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by) values (inv.workspace_id, uid, inv.role, inv.invited_by)
    on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.workspace_id;
end;
$$;

revoke all on function public.invitation_preview(text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.invitation_preview(text) to authenticated, service_role;
grant execute on function public.accept_invitation(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notifications (written by SECURITY DEFINER triggers; users read and mark their own)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('approval_needed', 'revision_requested', 'scan_failed', 'invitation_accepted', 'payment_problem', 'update_failed')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create or replace function public.notify_workspace(ws uuid, min_role public.workspace_role, p_kind text, p_title text, p_body text, p_link text, p_except uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, workspace_id, kind, title, body, link)
  select m.user_id, ws, p_kind, left(p_title, 200), left(p_body, 1000), p_link
    from public.workspace_members m
   where m.workspace_id = ws
     and public.workspace_role_rank(m.role) >= public.workspace_role_rank(min_role)
     and m.user_id is distinct from p_except;
$$;
revoke all on function public.notify_workspace(uuid, public.workspace_role, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.notification_triggers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_table_name = 'changes' then
    if new.status = 'pending_approval' and old.status is distinct from 'pending_approval' then
      perform public.notify_workspace(new.workspace_id, 'admin', 'approval_needed', 'Updates need your approval', new.title, '/w/' || new.workspace_id || '/approvals', actor);
    end if;
  elsif tg_table_name = 'update_proposals' then
    if new.approval_status = 'needs_revision' and old.approval_status is distinct from 'needs_revision' then
      perform public.notify_workspace(new.workspace_id, 'editor', 'revision_requested', 'A proposal needs a revision', new.reason, '/w/' || new.workspace_id || '/approvals?tab=needs_revision', actor);
    elsif new.execution_status = 'failed' and old.execution_status is distinct from 'failed' then
      perform public.notify_workspace(new.workspace_id, 'admin', 'update_failed', 'An update failed', new.reason, '/w/' || new.workspace_id || '/updates?filter=failed', null);
    end if;
  elsif tg_table_name = 'assets' then
    if new.scan_status = 'failed' and old.scan_status is distinct from 'failed' then
      perform public.notify_workspace(new.workspace_id, 'editor', 'scan_failed', 'A scan failed: ' || new.name, new.last_scan_error, '/w/' || new.workspace_id || '/assets/' || new.id, null);
    end if;
  elsif tg_table_name = 'invitations' then
    if new.accepted_at is not null and old.accepted_at is null and new.invited_by is not null then
      insert into public.notifications (user_id, workspace_id, kind, title, body, link)
      values (new.invited_by, new.workspace_id, 'invitation_accepted', 'Invitation accepted', new.email || ' joined as ' || new.role, '/w/' || new.workspace_id || '/settings/team');
    end if;
  elsif tg_table_name = 'subscriptions' then
    if new.status in ('past_due', 'unpaid') and old.status is distinct from new.status then
      insert into public.notifications (user_id, kind, title, body, link)
      select m.user_id, 'payment_problem', 'Payment problem', 'Stripe reported the subscription as ' || new.status || '. Update the payment method to keep your plan.', null
        from public.organization_members m where m.organization_id = new.organization_id and m.role in ('owner', 'admin');
    end if;
  end if;
  return new;
end;
$$;
create trigger changes_notify after update on public.changes for each row execute function public.notification_triggers();
create trigger update_proposals_notify after update on public.update_proposals for each row execute function public.notification_triggers();
create trigger assets_notify after update on public.assets for each row execute function public.notification_triggers();
create trigger invitations_notify after update on public.invitations for each row execute function public.notification_triggers();
create trigger subscriptions_notify after update on public.subscriptions for each row execute function public.notification_triggers();

-- ---------------------------------------------------------------------------
-- API keys (the secret is shown once; only its SHA-256 hash is stored)
-- ---------------------------------------------------------------------------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  prefix text not null check (prefix ~ '^cm_[a-z0-9]{8}$'),
  key_hash text not null unique check (char_length(key_hash) = 64),
  scopes text[] not null default array['read'] check (scopes <@ array['read', 'write'] and cardinality(scopes) >= 1),
  created_by uuid references public.profiles (id) on delete set null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_workspace_idx on public.api_keys (workspace_id);
create trigger api_keys_stamp before insert on public.api_keys for each row execute function public.stamp_created_by();
create trigger api_keys_audit after insert or update on public.api_keys for each row execute function public.audit_row_change();
alter table public.api_keys enable row level security;
create policy api_keys_select on public.api_keys for select to authenticated using (public.has_workspace_role(workspace_id, 'admin'));
create policy api_keys_insert on public.api_keys for insert to authenticated with check (public.has_workspace_role(workspace_id, 'admin'));
create policy api_keys_revoke on public.api_keys for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin')) with check (public.has_workspace_role(workspace_id, 'admin'));
grant select, insert, update (revoked_at, name) on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
