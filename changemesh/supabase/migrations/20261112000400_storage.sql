-- =============================================================================
-- Stage 3: private storage for uploaded asset files (Supabase Storage).
-- Object paths: <workspace_id>/<asset_id>/<file>. Members read, editors write.
-- Skipped automatically on plain PostgreSQL (no "storage" schema), e.g. in tests.
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not found; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('asset-files', 'asset-files', false, 10485760, array['application/pdf', 'text/csv', 'text/plain', 'text/markdown'])
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy asset_files_select on storage.objects for select to authenticated
    using (bucket_id = 'asset-files' and public.is_workspace_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy asset_files_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'asset-files' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'))
  $p$;
  execute $p$
    create policy asset_files_delete on storage.objects for delete to authenticated
    using (bucket_id = 'asset-files' and public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'editor'))
  $p$;
end;
$$;
