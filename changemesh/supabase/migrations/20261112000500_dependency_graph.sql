-- =============================================================================
-- Stage 4: Dependency graph
--   * current_facts: facts of each asset's current version + manual facts
--   * one relationship per asset pair and type, regardless of direction
-- =============================================================================

create view public.current_facts
with (security_invoker = true) as
select f.*
from public.extracted_facts f
join public.assets a on a.id = f.asset_id
where a.status = 'active'
  and (f.asset_version is null or f.asset_version = a.current_version);

revoke all on public.current_facts from anon;
grant select on public.current_facts to authenticated, service_role;

-- A→B and B→A of the same type describe the same link: allow only one.
create unique index asset_relationships_pair_type_idx
  on public.asset_relationships (least(source_asset_id, target_asset_id), greatest(source_asset_id, target_asset_id), relationship_type);

-- Reviewing must not silently re-point a relationship.
create or replace function public.guard_relationship_endpoints()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_asset_id <> old.source_asset_id or new.target_asset_id <> old.target_asset_id or new.workspace_id <> old.workspace_id then
    raise exception 'Relationship endpoints are immutable; delete and create a new relationship instead' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger asset_relationships_endpoints before update on public.asset_relationships
  for each row execute function public.guard_relationship_endpoints();
