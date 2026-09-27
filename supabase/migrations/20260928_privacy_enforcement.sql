begin;

create or replace function public.is_record_authorized_for_user(
  p_table_name text,
  p_record_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_dealer_id uuid;
  v_record_scope public.record_scope;
  v_owner_user_id uuid;
  v_has_membership boolean;
  v_has_admin boolean;
  v_has_explicit_grant boolean;
begin
  if p_user_id is null or p_record_id is null then
    return false;
  end if;

  v_has_membership := false;
  v_has_admin := false;
  v_has_explicit_grant := false;

  case p_table_name
    when 'clients' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.clients
      where id = p_record_id;

    when 'competencies' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.competencies
      where id = p_record_id;

    when 'firearms' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.firearms
      where id = p_record_id;

    when 'firearm_licences' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.firearm_licences
      where id = p_record_id;

    when 'application_cases' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.application_cases
      where id = p_record_id;

    when 'documents' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.documents
      where id = p_record_id;

    else
      return false;
  end case;

  if v_dealer_id is null then
    return false;
  end if;

  v_has_membership := exists (
    select 1
    from public.dealer_users du
    where du.user_id = p_user_id
      and du.dealer_id = v_dealer_id
      and du.is_active = true
  );

  if not v_has_membership then
    return false;
  end if;

  v_has_admin := exists (
    select 1
    from public.dealer_users du
    where du.user_id = p_user_id
      and du.dealer_id = v_dealer_id
      and du.is_active = true
      and du.role in ('owner', 'administrator')
  );

  if v_owner_user_id = p_user_id then
    return true;
  end if;

  v_has_explicit_grant := exists (
    select 1
    from public.dealer_user_permissions dup
    where dup.user_id = p_user_id
      and dup.dealer_id = v_dealer_id
      and dup.permission in (
        'clients.read',
        'applications.read',
        'documents.read',
        'clients.write',
        'applications.write',
        'documents.write'
      )
      and dup.scope_type = 'workspace'
      and (dup.expires_at is null or dup.expires_at > now())
  );

  if v_has_admin then
    return true;
  end if;

  if v_record_scope = 'PRIVATE' then
    return v_has_explicit_grant;
  end if;

  if v_record_scope = 'SHARED' then
    return v_has_explicit_grant or exists (
      select 1
      from public.dealer_users du
      where du.user_id = p_user_id
        and du.dealer_id = v_dealer_id
        and du.is_active = true
        and du.role in ('owner', 'administrator', 'staff')
    );
  end if;

  if v_record_scope = 'TEST' then
    return exists (
      select 1
      from public.dealer_users du
      join public.dealers d on d.id = du.dealer_id
      where du.user_id = p_user_id
        and du.dealer_id = v_dealer_id
        and du.is_active = true
        and d.workspace_kind = 'TEST'
        and du.role = 'tester'
    ) or v_has_explicit_grant;
  end if;

  return false;
end;
$$;

create or replace function public.can_manage_workspace_membership(
  p_user_id uuid,
  p_dealer_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.dealer_users du
    where du.user_id = p_user_id
      and du.dealer_id = p_dealer_id
      and du.is_active = true
      and du.role in ('owner', 'administrator')
  );
$$;

alter table public.dealers enable row level security;

create policy "dealer members can view dealer records"
on public.dealers
for select
to authenticated
using (public.is_dealer_member(id));

create policy "dealer admins can update dealer records"
on public.dealers
for update
to authenticated
using (public.is_dealer_admin(id))
with check (public.is_dealer_admin(id));

drop policy if exists "dealer members can access clients" on public.clients;
create policy "dealer members can access clients"
on public.clients
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('clients', id, auth.uid())
);

create policy "clients require explicit ownership or policy grant"
on public.clients
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "clients require explicit ownership or admin access"
on public.clients
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('clients', id, auth.uid())
)
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "clients require access to delete" 
on public.clients
for delete
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('clients', id, auth.uid())
);

drop policy if exists "dealer members can access competencies" on public.competencies;
create policy "dealer members can access competencies"
on public.competencies
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('competencies', id, auth.uid())
);

create policy "competencies enforce ownership" 
on public.competencies
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "competencies enforce authorized update"
on public.competencies
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('competencies', id, auth.uid())
)
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "competencies enforce authorized delete"
on public.competencies
for delete
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('competencies', id, auth.uid())
);

drop policy if exists "dealer members can access firearms" on public.firearms;
create policy "dealer members can access firearms"
on public.firearms
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('firearms', id, auth.uid())
);

create policy "firearms enforce ownership"
on public.firearms
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "firearms enforce authorized update"
on public.firearms
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('firearms', id, auth.uid())
)
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "firearms enforce authorized delete"
on public.firearms
for delete
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('firearms', id, auth.uid())
);

drop policy if exists "dealer members can access firearm licences" on public.firearm_licences;
create policy "dealer members can access firearm licences"
on public.firearm_licences
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('firearm_licences', id, auth.uid())
);

create policy "firearm licences enforce ownership"
on public.firearm_licences
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "firearm licences enforce authorized update"
on public.firearm_licences
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('firearm_licences', id, auth.uid())
)
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "firearm licences enforce authorized delete"
on public.firearm_licences
for delete
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('firearm_licences', id, auth.uid())
);

drop policy if exists "dealer members can access application cases" on public.application_cases;
create policy "dealer members can access application cases"
on public.application_cases
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_cases', id, auth.uid())
);

create policy "application cases enforce ownership"
on public.application_cases
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "application cases enforce authorized update"
on public.application_cases
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_cases', id, auth.uid())
)
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "application cases enforce authorized delete"
on public.application_cases
for delete
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_cases', id, auth.uid())
);

create policy "dealer members can access documents"
on public.documents
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('documents', id, auth.uid())
);

create policy "documents enforce ownership"
on public.documents
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "documents enforce authorized update"
on public.documents
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('documents', id, auth.uid())
)
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "documents enforce authorized delete"
on public.documents
for delete
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('documents', id, auth.uid())
);

create or replace view public.privacy_access_guard as
select
  'clients' as table_name,
  id as record_id,
  dealer_id,
  owner_user_id,
  record_scope
from public.clients
union all
select
  'competencies', id, dealer_id, owner_user_id, record_scope
from public.competencies
union all
select
  'firearms', id, dealer_id, owner_user_id, record_scope
from public.firearms
union all
select
  'firearm_licences', id, dealer_id, owner_user_id, record_scope
from public.firearm_licences
union all
select
  'application_cases', id, dealer_id, owner_user_id, record_scope
from public.application_cases
union all
select
  'documents', id, dealer_id, owner_user_id, record_scope
from public.documents;

-- Storage policy mapping: if the DB record is denied, storage is denied.
create policy "private document storage requires record authorization"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'licenceguard-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_path = storage.objects.name
      and public.is_record_authorized_for_user('documents', d.id, auth.uid())
  )
);

create policy "private document storage update requires record authorization"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'licenceguard-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_path = storage.objects.name
      and public.is_record_authorized_for_user('documents', d.id, auth.uid())
  )
)
with check (
  bucket_id = 'licenceguard-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_path = storage.objects.name
      and public.is_record_authorized_for_user('documents', d.id, auth.uid())
  )
);

create policy "private document storage delete requires record authorization"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'licenceguard-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_path = storage.objects.name
      and public.is_record_authorized_for_user('documents', d.id, auth.uid())
  )
);

commit;
