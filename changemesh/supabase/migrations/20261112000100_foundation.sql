-- =============================================================================
-- CHANGEMESH — Foundation schema
-- Entities: User (profiles), Organization, OrganizationMember, Workspace,
-- WorkspaceMember, Asset, AssetVersion, AssetRelationship, Change, ChangeImpact,
-- UpdateProposal, Approval, Integration, AuditLog, Subscription.
--
-- Security model
--   * Every tenant table has RLS enabled. Access is granted only through
--     workspace / organization membership checked by SECURITY DEFINER helpers.
--   * anon has no table privileges at all.
--   * Child rows carry workspace_id and use composite foreign keys
--     (x_id, workspace_id) -> parent(id, workspace_id) so a row can never point
--     at a record in another tenant.
--   * audit_logs is append-only and written by triggers, not by clients.
--   * subscriptions are written only by the service role (billing webhooks).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.organization_role as enum ('owner', 'admin', 'member');
create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.asset_type as enum ('website', 'pdf', 'csv', 'manual', 'product_catalog', 'marketing_content');
create type public.asset_status as enum ('active', 'archived');
create type public.scan_status as enum ('not_scanned', 'queued', 'running', 'succeeded', 'partial', 'failed');
create type public.relationship_type as enum ('derived_from', 'embeds', 'links_to', 'syncs_with', 'references', 'duplicates');
create type public.relationship_status as enum ('suggested', 'confirmed', 'rejected');
create type public.record_origin as enum ('manual', 'rule', 'ai', 'scan', 'demo', 'system');
create type public.change_type as enum ('created', 'updated', 'deleted', 'conflicting', 'outdated');
create type public.change_status as enum ('draft', 'analyzing', 'analyzed', 'pending_approval', 'approved', 'rejected', 'completed', 'cancelled');
create type public.impact_level as enum ('critical', 'high', 'medium', 'low');
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'needs_revision');
create type public.execution_status as enum ('not_started', 'ready', 'in_progress', 'completed', 'failed');
create type public.integration_status as enum ('not_connected', 'connected', 'error', 'disabled');
create type public.subscription_plan as enum ('starter', 'business', 'agency', 'enterprise');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');
create type public.audit_actor_type as enum ('user', 'system', 'service');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users (profiles mirror auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 100),
  avatar_url text check (char_length(avatar_url) <= 2048),
  locale text not null default 'en' check (locale in ('en', 'az', 'tr')),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may not promote themselves to platform admin or change their email here.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.is_platform_admin is distinct from old.is_platform_admin then
      raise exception 'is_platform_admin cannot be changed by users' using errcode = '42501';
    end if;
    if new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'email and id are managed by the authentication service' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index workspaces_org_idx on public.workspaces (organization_id);
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies don't recurse into RLS)
-- ---------------------------------------------------------------------------
create or replace function public.workspace_role_rank(r public.workspace_role)
returns int
language sql
immutable
set search_path = ''
as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 when 'owner' then 4 end;
$$;

create or replace function public.organization_role_rank(r public.organization_role)
returns int
language sql
immutable
set search_path = ''
as $$
  select case r when 'member' then 1 when 'admin' then 2 when 'owner' then 3 end;
$$;

create or replace function public.current_workspace_role(ws uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.workspace_members m
  where m.workspace_id = ws and m.user_id = (select auth.uid());
$$;

create or replace function public.has_workspace_role(ws uuid, minimum public.workspace_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.workspace_role_rank(public.current_workspace_role(ws)) >= public.workspace_role_rank(minimum),
    false
  );
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_workspace_role(ws, 'viewer');
$$;

create or replace function public.current_organization_role(org uuid)
returns public.organization_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = org and m.user_id = (select auth.uid());
$$;

create or replace function public.has_organization_role(org uuid, minimum public.organization_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.organization_role_rank(public.current_organization_role(org)) >= public.organization_role_rank(minimum),
    false
  );
$$;

-- Users who belong to any workspace of the organization may see the organization row.
create or replace function public.can_view_organization(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_organization_role(org, 'member')
      or exists (
        select 1 from public.workspace_members m
        join public.workspaces w on w.id = m.workspace_id
        where w.organization_id = org and m.user_id = (select auth.uid())
      );
$$;

create or replace function public.shares_workspace_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.asset_type not null,
  name text not null check (char_length(name) between 1 and 200),
  description text check (char_length(description) <= 2000),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https?://')),
  storage_path text check (char_length(storage_path) <= 1024),
  mime_type text check (char_length(mime_type) <= 255),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status public.asset_status not null default 'active',
  scan_status public.scan_status not null default 'not_scanned',
  last_scanned_at timestamptz,
  last_scan_error text check (char_length(last_scan_error) <= 2000),
  current_version integer not null default 0 check (current_version >= 0),
  is_customer_facing boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  origin public.record_origin not null default 'manual',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint website_requires_url check (type <> 'website' or source_url is not null)
);
create index assets_workspace_created_idx on public.assets (workspace_id, created_at desc);
create index assets_workspace_type_idx on public.assets (workspace_id, type);
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

create table public.asset_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  asset_id uuid not null,
  version integer not null check (version >= 1),
  content_hash text check (char_length(content_hash) <= 128),
  storage_path text check (char_length(storage_path) <= 1024),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, version),
  foreign key (asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade
);
create index asset_versions_workspace_idx on public.asset_versions (workspace_id);

create table public.asset_relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_asset_id uuid not null,
  target_asset_id uuid not null,
  relationship_type public.relationship_type not null,
  status public.relationship_status not null default 'suggested',
  confidence numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  origin public.record_origin not null default 'manual',
  note text check (char_length(note) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_asset_id <> target_asset_id),
  unique (source_asset_id, target_asset_id, relationship_type),
  foreign key (source_asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade,
  foreign key (target_asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade
);
create index asset_relationships_workspace_idx on public.asset_relationships (workspace_id, status);
create index asset_relationships_target_idx on public.asset_relationships (target_asset_id);
create trigger asset_relationships_updated_at before update on public.asset_relationships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Changes, impacts, proposals, approvals
-- ---------------------------------------------------------------------------
create table public.changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text check (char_length(description) <= 4000),
  change_type public.change_type not null,
  status public.change_status not null default 'draft',
  source_asset_id uuid,
  entity_name text check (char_length(entity_name) <= 200),
  attribute_name text check (char_length(attribute_name) <= 200),
  old_value text check (char_length(old_value) <= 4000),
  new_value text check (char_length(new_value) <= 4000),
  origin public.record_origin not null default 'manual',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (source_asset_id, workspace_id) references public.assets (id, workspace_id) on delete set null (source_asset_id)
);
create index changes_workspace_created_idx on public.changes (workspace_id, created_at desc);
create index changes_workspace_status_idx on public.changes (workspace_id, status);
create trigger changes_updated_at before update on public.changes
  for each row execute function public.set_updated_at();

create table public.change_impacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  change_id uuid not null,
  asset_id uuid not null,
  impact_level public.impact_level not null,
  depth integer not null default 1 check (depth between 0 and 32),
  relationship_path jsonb not null default '[]'::jsonb check (jsonb_typeof(relationship_path) = 'array'),
  old_value text check (char_length(old_value) <= 4000),
  new_value text check (char_length(new_value) <= 4000),
  confidence numeric(4, 3) not null default 1 check (confidence between 0 and 1),
  recommended_action text check (char_length(recommended_action) <= 2000),
  origin public.record_origin not null default 'rule',
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (change_id, asset_id),
  foreign key (change_id, workspace_id) references public.changes (id, workspace_id) on delete cascade,
  foreign key (asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade
);
create index change_impacts_workspace_idx on public.change_impacts (workspace_id);
create index change_impacts_asset_idx on public.change_impacts (asset_id);

create table public.update_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  change_id uuid not null,
  change_impact_id uuid,
  target_asset_id uuid not null,
  current_value text check (char_length(current_value) <= 4000),
  proposed_value text check (char_length(proposed_value) <= 4000),
  reason text check (char_length(reason) <= 4000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  impact_level public.impact_level not null,
  approval_status public.approval_status not null default 'pending',
  execution_status public.execution_status not null default 'not_started',
  idempotency_key text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  execution_result jsonb,
  executed_at timestamptz,
  origin public.record_origin not null default 'rule',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (change_id, workspace_id) references public.changes (id, workspace_id) on delete cascade,
  foreign key (change_impact_id, workspace_id) references public.change_impacts (id, workspace_id) on delete set null (change_impact_id),
  foreign key (target_asset_id, workspace_id) references public.assets (id, workspace_id) on delete cascade,
  -- Nothing may run before an explicit approval.
  constraint execution_requires_approval check (
    execution_status in ('not_started') or approval_status = 'approved'
  )
);
create index update_proposals_workspace_status_idx on public.update_proposals (workspace_id, approval_status);
create index update_proposals_change_idx on public.update_proposals (change_id);
create trigger update_proposals_updated_at before update on public.update_proposals
  for each row execute function public.set_updated_at();

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  proposal_id uuid not null,
  decision public.approval_status not null check (decision <> 'pending'),
  comment text check (char_length(comment) <= 2000),
  decided_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (proposal_id, workspace_id) references public.update_proposals (id, workspace_id) on delete cascade
);
create index approvals_proposal_idx on public.approvals (proposal_id, created_at desc);
create index approvals_workspace_idx on public.approvals (workspace_id);

-- Approval decisions on a proposal may only be changed by admins/owners.
create or replace function public.guard_proposal_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and (new.approval_status is distinct from old.approval_status
          or new.execution_status is distinct from old.execution_status)
     and not public.has_workspace_role(new.workspace_id, 'admin') then
    raise exception 'Only workspace admins can approve, reject or execute proposals' using errcode = '42501';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'idempotency_key is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger update_proposals_guard before update on public.update_proposals
  for each row execute function public.guard_proposal_decision();

-- ---------------------------------------------------------------------------
-- Integrations (secrets are never stored in this table)
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  status public.integration_status not null default 'not_connected',
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  -- Reference to a secret in a vault (e.g. Supabase Vault id). Never the secret itself.
  secret_ref text check (char_length(secret_ref) <= 255),
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, display_name)
);
create trigger integrations_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Subscriptions (written only by the billing webhook using the service role)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  plan public.subscription_plan not null,
  status public.subscription_status not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_type public.audit_actor_type not null default 'user',
  action text not null check (char_length(action) between 3 and 100),
  target_type text not null check (char_length(target_type) <= 60),
  target_id text check (char_length(target_id) <= 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_workspace_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function public.prevent_audit_mutation();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row when (pg_trigger_depth() = 0) execute function public.prevent_audit_mutation();

-- Generic row-change audit trigger. Records which columns changed (not full
-- row contents) to avoid copying large or sensitive values into the log.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb;
  old_rec jsonb;
  ws uuid;
  org uuid;
  changed text[];
  actor uuid := (select auth.uid());
begin
  if tg_op = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;
  if tg_op = 'UPDATE' then
    old_rec := to_jsonb(old);
    select array_agg(k order by k) into changed
    from jsonb_object_keys(rec) k
    where k not in ('updated_at') and rec -> k is distinct from old_rec -> k;
    if changed is null then
      return new;
    end if;
  end if;

  if tg_table_name = 'workspaces' then
    ws := (rec ->> 'id')::uuid;
    org := (rec ->> 'organization_id')::uuid;
  elsif tg_table_name in ('organizations') then
    org := (rec ->> 'id')::uuid;
  elsif tg_table_name in ('organization_members') then
    org := (rec ->> 'organization_id')::uuid;
  else
    ws := (rec ->> 'workspace_id')::uuid;
    select w.organization_id into org from public.workspaces w where w.id = ws;
  end if;

  -- The workspace may already be gone during a cascading delete.
  if ws is not null and not exists (select 1 from public.workspaces where id = ws) then
    return coalesce(new, old);
  end if;
  if org is not null and not exists (select 1 from public.organizations where id = org) then
    return coalesce(new, old);
  end if;

  insert into public.audit_logs (organization_id, workspace_id, actor_id, actor_type, action, target_type, target_id, metadata)
  values (
    org,
    ws,
    actor,
    case when actor is null then 'system'::public.audit_actor_type else 'user'::public.audit_actor_type end,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'user_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'changed', to_jsonb(changed),
      'role', rec ->> 'role',
      'user_id', rec ->> 'user_id',
      'status', coalesce(rec ->> 'approval_status', rec ->> 'status'),
      'execution_status', rec ->> 'execution_status',
      'decision', rec ->> 'decision',
      'name', coalesce(rec ->> 'name', rec ->> 'title')
    ))
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'organization_members', 'workspaces', 'workspace_members', 'assets',
    'asset_relationships', 'changes', 'update_proposals', 'approvals', 'integrations'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership integrity
-- ---------------------------------------------------------------------------
-- A workspace must always keep at least one owner.
create or replace function public.ensure_workspace_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.workspaces where id = old.workspace_id)
     and not exists (
       select 1 from public.workspace_members
       where workspace_id = old.workspace_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'A workspace must have at least one owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger workspace_members_keep_owner
  after update or delete on public.workspace_members
  for each row execute function public.ensure_workspace_has_owner();

-- Only owners may grant, change or remove the owner role; members must belong to the organization's people.
create or replace function public.guard_workspace_member_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if (tg_op in ('INSERT', 'UPDATE') and new.role = 'owner')
       or (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner') then
      if not public.has_workspace_role(coalesce(new.workspace_id, old.workspace_id), 'owner') then
        raise exception 'Only owners can grant or change the owner role' using errcode = '42501';
      end if;
    end if;
    if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.workspace_id <> old.workspace_id) then
      raise exception 'Membership keys are immutable' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger workspace_members_guard
  before insert or update or delete on public.workspace_members
  for each row execute function public.guard_workspace_member_change();

-- Same rule for organization owners.
create or replace function public.guard_organization_member_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if (tg_op in ('INSERT', 'UPDATE') and new.role = 'owner')
       or (tg_op in ('UPDATE', 'DELETE') and old.role = 'owner') then
      if not public.has_organization_role(coalesce(new.organization_id, old.organization_id), 'owner') then
        raise exception 'Only owners can grant or change the owner role' using errcode = '42501';
      end if;
    end if;
    if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.organization_id <> old.organization_id) then
      raise exception 'Membership keys are immutable' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger organization_members_guard
  before insert or update or delete on public.organization_members
  for each row execute function public.guard_organization_member_change();

-- Creator of a workspace becomes its owner.
create or replace function public.add_workspace_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger workspaces_add_owner
  after insert on public.workspaces
  for each row execute function public.add_workspace_creator_as_owner();

-- ---------------------------------------------------------------------------
-- RPC: create organization + first workspace atomically (onboarding)
-- ---------------------------------------------------------------------------
create or replace function public.create_organization_with_workspace(
  org_name text,
  org_slug text,
  workspace_name text,
  workspace_slug text
)
returns table (organization_id uuid, workspace_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_org uuid;
  new_ws uuid;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Profile not found' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(org_name), org_slug, uid)
  returning id into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org, uid, 'owner');

  insert into public.workspaces (organization_id, name, slug, created_by)
  values (new_org, trim(workspace_name), workspace_slug, uid)
  returning id into new_ws;

  return query select new_org, new_ws;
end;
$$;

revoke all on function public.create_organization_with_workspace(text, text, text, text) from public, anon;
grant execute on function public.create_organization_with_workspace(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.assets enable row level security;
alter table public.asset_versions enable row level security;
alter table public.asset_relationships enable row level security;
alter table public.changes enable row level security;
alter table public.change_impacts enable row level security;
alter table public.update_proposals enable row level security;
alter table public.approvals enable row level security;
alter table public.integrations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Organizations
create policy organizations_select on public.organizations for select to authenticated
  using (public.can_view_organization(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_organization_role(id, 'admin')) with check (public.has_organization_role(id, 'admin'));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.has_organization_role(id, 'owner'));

-- Organization members
create policy organization_members_select on public.organization_members for select to authenticated
  using (public.has_organization_role(organization_id, 'member'));
-- No INSERT policy: members are added only by SECURITY DEFINER RPCs
-- (onboarding now, invitation acceptance in a later stage), never directly.
create policy organization_members_update on public.organization_members for update to authenticated
  using (public.has_organization_role(organization_id, 'admin'))
  with check (public.has_organization_role(organization_id, 'admin'));
create policy organization_members_delete on public.organization_members for delete to authenticated
  using (public.has_organization_role(organization_id, 'admin') or user_id = (select auth.uid()));

-- Workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id) or public.has_organization_role(organization_id, 'admin'));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (public.has_organization_role(organization_id, 'admin') and created_by = (select auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.has_workspace_role(id, 'admin')) with check (public.has_workspace_role(id, 'admin'));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (public.has_workspace_role(id, 'owner'));

-- Workspace members
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- No INSERT policy: see organization_members above.
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (public.has_workspace_role(workspace_id, 'admin') or user_id = (select auth.uid()));

-- Workspace content tables: members read, editors write.
do $$
declare
  t text;
begin
  foreach t in array array['assets', 'asset_versions', 'asset_relationships', 'changes', 'change_impacts', 'update_proposals'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_workspace_role(workspace_id, ''editor''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_workspace_role(workspace_id, ''editor'')) with check (public.has_workspace_role(workspace_id, ''editor''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_workspace_role(workspace_id, ''editor''))', t || '_delete', t);
  end loop;
end;
$$;

-- Approvals: members read; only admins/owners record decisions, as themselves. Immutable.
create policy approvals_select on public.approvals for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy approvals_insert on public.approvals for insert to authenticated
  with check (public.has_workspace_role(workspace_id, 'admin') and decided_by = (select auth.uid()));

-- Integrations: members read; admins manage.
create policy integrations_select on public.integrations for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy integrations_write on public.integrations for all to authenticated
  using (public.has_workspace_role(workspace_id, 'admin'))
  with check (public.has_workspace_role(workspace_id, 'admin'));

-- Subscriptions: organization members read. No client writes.
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_organization_role(organization_id, 'member'));

-- Audit logs: workspace admins see workspace events; org admins see all org events. No client writes.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (workspace_id is not null and public.has_workspace_role(workspace_id, 'admin'))
    or (organization_id is not null and public.has_organization_role(organization_id, 'admin'))
  );

-- ---------------------------------------------------------------------------
-- Privileges: anon gets nothing; authenticated gets table privileges filtered by RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke update, delete on public.approvals from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke insert on public.organizations from authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
