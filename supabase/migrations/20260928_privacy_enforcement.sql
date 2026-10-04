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

    when 'application_checklist_items' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.application_checklist_items
      where id = p_record_id;

    when 'application_pack_items' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.application_pack_items
      where id = p_record_id;

    when 'notification_log' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.notification_log
      where id = p_record_id;

    when 'audit_log' then
      select dealer_id, owner_user_id, record_scope
      into v_dealer_id, v_owner_user_id, v_record_scope
      from public.audit_log
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
        'clients.write',
        'applications.read',
        'applications.write',
        'documents.read',
        'documents.write',
        'workspace.manage_permissions'
      )
      and dup.scope_type = 'workspace'
      and (dup.expires_at is null or dup.expires_at > now())
  );

  if v_has_admin then
    return true;
  end if;

  if v_record_scope is null then
    v_record_scope := 'PRIVATE';
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

create or replace view public.privacy_access_guard as
select 'clients' as table_name, id as record_id, dealer_id, owner_user_id, record_scope from public.clients
union all
select 'competencies', id, dealer_id, owner_user_id, record_scope from public.competencies
union all
select 'firearms', id, dealer_id, owner_user_id, record_scope from public.firearms
union all
select 'firearm_licences', id, dealer_id, owner_user_id, record_scope from public.firearm_licences
union all
select 'application_cases', id, dealer_id, owner_user_id, record_scope from public.application_cases
union all
select 'documents', id, dealer_id, owner_user_id, record_scope from public.documents
union all
select 'application_checklist_items', id, dealer_id, owner_user_id, record_scope from public.application_checklist_items
union all
select 'application_pack_items', id, dealer_id, owner_user_id, record_scope from public.application_pack_items
union all
select 'notification_log', id, dealer_id, owner_user_id, record_scope from public.notification_log
union all
select 'audit_log', id, dealer_id, owner_user_id, record_scope from public.audit_log;

drop policy if exists "dealer members can view dealer records" on public.dealers;
drop policy if exists "dealer admins can update dealer records" on public.dealers;
drop policy if exists "dealer members can access clients" on public.clients;
drop policy if exists "clients require explicit ownership or policy grant" on public.clients;
drop policy if exists "clients require explicit ownership or admin access" on public.clients;
drop policy if exists "clients require access to delete" on public.clients;
drop policy if exists "dealer members can access competencies" on public.competencies;
drop policy if exists "competencies enforce ownership" on public.competencies;
drop policy if exists "competencies enforce authorized update" on public.competencies;
drop policy if exists "competencies enforce authorized delete" on public.competencies;
drop policy if exists "dealer members can access firearms" on public.firearms;
drop policy if exists "firearms enforce ownership" on public.firearms;
drop policy if exists "firearms enforce authorized update" on public.firearms;
drop policy if exists "firearms enforce authorized delete" on public.firearms;
drop policy if exists "dealer members can access firearm licences" on public.firearm_licences;
drop policy if exists "firearm licences enforce ownership" on public.firearm_licences;
drop policy if exists "firearm licences enforce authorized update" on public.firearm_licences;
drop policy if exists "firearm licences enforce authorized delete" on public.firearm_licences;
drop policy if exists "dealer members can access application cases" on public.application_cases;
drop policy if exists "application cases enforce ownership" on public.application_cases;
drop policy if exists "application cases enforce authorized update" on public.application_cases;
drop policy if exists "application cases enforce authorized delete" on public.application_cases;
drop policy if exists "dealer members can access documents" on public.documents;
drop policy if exists "documents enforce ownership" on public.documents;
drop policy if exists "documents enforce authorized update" on public.documents;
drop policy if exists "documents enforce authorized delete" on public.documents;
drop policy if exists "application checklist items require authorized access" on public.application_checklist_items;
drop policy if exists "application checklist items enforce ownership" on public.application_checklist_items;
drop policy if exists "application checklist items enforce authorized update" on public.application_checklist_items;
drop policy if exists "application pack items require authorized access" on public.application_pack_items;
drop policy if exists "application pack items enforce ownership" on public.application_pack_items;
drop policy if exists "application pack items enforce authorized update" on public.application_pack_items;
drop policy if exists "notification log requires authorized access" on public.notification_log;
drop policy if exists "notification log authorize writes" on public.notification_log;
drop policy if exists "audit log requires authorized access" on public.audit_log;
drop policy if exists "audit log authorize writes" on public.audit_log;
drop policy if exists "private document storage requires record authorization" on storage.objects;
drop policy if exists "private document storage insert requires record authorization" on storage.objects;
drop policy if exists "private document storage update requires record authorization" on storage.objects;
drop policy if exists "private document storage delete requires record authorization" on storage.objects;

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

create policy "application checklist items require authorized access"
on public.application_checklist_items
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_checklist_items', id, auth.uid())
);

create policy "application checklist items enforce ownership"
on public.application_checklist_items
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

create policy "application checklist items enforce authorized update"
on public.application_checklist_items
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_checklist_items', id, auth.uid())
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

create policy "application pack items require authorized access"
on public.application_pack_items
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_pack_items', id, auth.uid())
);

create policy "application pack items enforce ownership"
on public.application_pack_items
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

create policy "application pack items enforce authorized update"
on public.application_pack_items
for update
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('application_pack_items', id, auth.uid())
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

create policy "notification log requires authorized access"
on public.notification_log
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('notification_log', id, auth.uid())
);

create policy "notification log authorize writes"
on public.notification_log
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or created_by = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create policy "audit log requires authorized access"
on public.audit_log
for select
to authenticated
using (
  public.is_dealer_member(dealer_id)
  and public.is_record_authorized_for_user('audit_log', id, auth.uid())
);

create policy "audit log authorize writes"
on public.audit_log
for insert
to authenticated
with check (
  public.is_dealer_member(dealer_id)
  and (
    owner_user_id is null
    or owner_user_id = auth.uid()
    or user_id = auth.uid()
    or public.is_dealer_admin(dealer_id)
  )
  and (record_scope is null or record_scope in ('PRIVATE', 'SHARED', 'TEST'))
);

create or replace view public.firearm_licence_expiry_view
with (security_invoker = true)
as
select
  fl.id,
  fl.dealer_id,
  fl.client_id,
  fl.firearm_id,
  fl.licence_number,
  fl.licence_section,
  fl.issue_date,
  fl.expiry_date,
  fl.status,
  c.first_name,
  c.surname,
  c.cellphone,
  c.email,
  f.make,
  f.model,
  f.calibre,
  f.serial_number,
  f.firearm_type,
  f.required_competency,
  (fl.expiry_date - current_date) as days_until_expiry,
  case
    when fl.expiry_date < current_date then 'EXPIRED'
    when fl.expiry_date <= current_date + 30 then '30_DAYS'
    when fl.expiry_date <= current_date + 60 then '60_DAYS'
    when fl.expiry_date <= current_date + 90 then '90_DAYS'
    when fl.expiry_date <= current_date + 120 then '120_DAYS'
    when fl.expiry_date <= current_date + 150 then '150_DAYS'
    when fl.expiry_date <= current_date + 180 then '180_DAYS'
    else 'NOT_DUE'
  end as reminder_stage
from public.firearm_licences fl
join public.clients c on c.id = fl.client_id
join public.firearms f on f.id = fl.firearm_id
where public.is_record_authorized_for_user('firearm_licences', fl.id, auth.uid());

create or replace view public.competency_expiry_view
with (security_invoker = true)
as
select
  co.id,
  co.dealer_id,
  co.client_id,
  co.category,
  co.certificate_number,
  co.issue_date,
  co.expiry_date,
  co.verified,
  c.first_name,
  c.surname,
  c.cellphone,
  c.email,
  case
    when co.expiry_date is null then null
    else co.expiry_date - current_date
  end as days_until_expiry,
  case
    when co.expiry_date is null then 'NO_EXPIRY_RECORDED'
    when co.expiry_date < current_date then 'EXPIRED'
    when co.expiry_date <= current_date + 30 then '30_DAYS'
    when co.expiry_date <= current_date + 60 then '60_DAYS'
    when co.expiry_date <= current_date + 90 then '90_DAYS'
    when co.expiry_date <= current_date + 120 then '120_DAYS'
    when co.expiry_date <= current_date + 150 then '150_DAYS'
    when co.expiry_date <= current_date + 180 then '180_DAYS'
    else 'NOT_DUE'
  end as reminder_stage
from public.competencies co
join public.clients c on c.id = co.client_id
where public.is_record_authorized_for_user('competencies', co.id, auth.uid());

create or replace view public.competency_application_case_view
with (security_invoker = true)
as
select
  ac.id,
  ac.dealer_id,
  ac.client_id,
  ac.application_type,
  ac.competency_category,
  ac.competency_id,
  ac.status,
  ac.opened_date,
  ac.target_submission_date,
  ac.actual_submission_date,
  ac.application_reference,
  ac.police_station,
  ac.outcome_date,
  ac.outcome_notes,
  ac.progress_percent,
  ac.assigned_to,
  c.first_name,
  c.surname,
  c.id_number,
  c.cellphone,
  c.email
from public.application_cases ac
join public.clients c on c.id = ac.client_id
where ac.application_type in (
  'COMPETENCY_FIRST_APPLICATION',
  'COMPETENCY_RENEWAL'
)
and public.is_record_authorized_for_user('application_cases', ac.id, auth.uid())
and public.is_record_authorized_for_user('clients', c.id, auth.uid());

create or replace view public.firearm_licence_application_case_view
with (security_invoker = true)
as
select
  ac.id,
  ac.dealer_id,
  ac.client_id,
  ac.application_type,
  ac.firearm_id,
  ac.firearm_licence_id,
  ac.status,
  ac.opened_date,
  ac.target_submission_date,
  ac.actual_submission_date,
  ac.application_reference,
  ac.police_station,
  ac.outcome_date,
  ac.outcome_notes,
  ac.progress_percent,
  ac.assigned_to,
  c.first_name,
  c.surname,
  c.id_number,
  c.cellphone,
  c.email,
  f.make,
  f.model,
  f.calibre,
  f.serial_number,
  f.firearm_type,
  f.required_competency
from public.application_cases ac
join public.clients c on c.id = ac.client_id
join public.firearms f on f.id = ac.firearm_id
where ac.application_type in (
  'FIREARM_LICENCE_FIRST_APPLICATION',
  'FIREARM_LICENCE_RENEWAL'
)
and public.is_record_authorized_for_user('application_cases', ac.id, auth.uid())
and public.is_record_authorized_for_user('clients', c.id, auth.uid())
and public.is_record_authorized_for_user('firearms', f.id, auth.uid());

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

create policy "private document storage insert requires record authorization"
on storage.objects
for insert
to authenticated
with check (
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
