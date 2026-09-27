begin;

create type if not exists public.workspace_kind as enum ('PRODUCTION', 'TEST');
create type if not exists public.record_scope as enum ('PRIVATE', 'SHARED', 'TEST');

-- Preserve the existing role model while adding an explicit tester role.
do $$
begin
  if exists (
    select 1 from pg_type where typname = 'dealer_user_role'
  ) then
    if not exists (
      select 1
      from unnest(enum_range(null::public.dealer_user_role)) as value(role)
      where role = 'tester'
    ) then
      alter type public.dealer_user_role add value if not exists 'tester';
    end if;
  end if;
end $$;

alter table public.dealers
  add column if not exists workspace_kind public.workspace_kind not null default 'PRODUCTION';

alter table public.dealers
  add constraint if not exists dealers_workspace_kind_check
  check (workspace_kind in ('PRODUCTION', 'TEST'));

create table if not exists public.dealer_user_permissions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  scope_type text not null default 'workspace'
    check (scope_type in ('workspace', 'client', 'application', 'document', 'test')),
  scope_id uuid,
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_user_permissions_scope_check
    check (
      (scope_type = 'workspace' and scope_id is null)
      or (scope_type <> 'workspace' and scope_id is not null)
    ),
  unique (dealer_id, user_id, permission, scope_type, scope_id)
);

create index if not exists dealer_user_permissions_user_id_idx
  on public.dealer_user_permissions(user_id);

create index if not exists dealer_user_permissions_dealer_id_idx
  on public.dealer_user_permissions(dealer_id);

create or replace function public.has_workspace_role(
  p_user_id uuid,
  p_dealer_id uuid,
  p_roles text[]
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
      and du.role::text = any (p_roles)
  );
$$;

create or replace function public.has_permission(
  p_user_id uuid,
  p_dealer_id uuid,
  p_permission text,
  p_scope_type text default 'workspace',
  p_scope_id uuid default null
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.dealer_user_permissions dup
    where dup.dealer_id = p_dealer_id
      and dup.user_id = p_user_id
      and dup.permission = p_permission
      and dup.scope_type = p_scope_type
      and (p_scope_type = 'workspace' or dup.scope_id = p_scope_id)
      and (dup.expires_at is null or dup.expires_at > now())
  );
$$;

create or replace function public.assert_record_privacy_fields()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.record_scope is null then
    new.record_scope := 'PRIVATE';
  end if;

  if new.record_scope not in ('PRIVATE', 'SHARED', 'TEST') then
    raise exception 'Invalid record scope.';
  end if;

  if new.owner_user_id is not null then
    if not exists (
      select 1
      from public.dealer_users du
      where du.user_id = new.owner_user_id
        and du.dealer_id = new.dealer_id
        and du.is_active = true
    ) then
      raise exception 'Ownership must belong to an active member of the same dealer.';
    end if;
  end if;

  if new.record_scope = 'TEST' then
    if not exists (
      select 1
      from public.dealers d
      where d.id = new.dealer_id
        and d.workspace_kind = 'TEST'
    ) then
      raise exception 'TEST-scoped records must belong to a TEST workspace.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_dealer_user_permission()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.dealer_users du
    where du.dealer_id = new.dealer_id
      and du.user_id = new.user_id
      and du.is_active = true
  ) then
    raise exception 'Permission grants require an active dealer membership.';
  end if;

  if not exists (
    select 1
    from public.dealer_users du
    where du.dealer_id = new.dealer_id
      and du.user_id = new.granted_by
      and du.is_active = true
      and du.role in ('owner', 'administrator')
  ) then
    raise exception 'Only owner/admin may grant workspace permissions.';
  end if;

  return new;
end;
$$;

alter table public.clients
  add column if not exists owner_user_id uuid references auth.users(id);

alter table public.clients
  add column if not exists record_scope public.record_scope not null default 'PRIVATE';

alter table public.competencies
  add column if not exists owner_user_id uuid references auth.users(id);

alter table public.competencies
  add column if not exists record_scope public.record_scope not null default 'PRIVATE';

alter table public.firearms
  add column if not exists owner_user_id uuid references auth.users(id);

alter table public.firearms
  add column if not exists record_scope public.record_scope not null default 'PRIVATE';

alter table public.firearm_licences
  add column if not exists owner_user_id uuid references auth.users(id);

alter table public.firearm_licences
  add column if not exists record_scope public.record_scope not null default 'PRIVATE';

alter table public.application_cases
  add column if not exists owner_user_id uuid references auth.users(id);

alter table public.application_cases
  add column if not exists record_scope public.record_scope not null default 'PRIVATE';

alter table public.documents
  add column if not exists owner_user_id uuid references auth.users(id);

alter table public.documents
  add column if not exists record_scope public.record_scope not null default 'PRIVATE';

create trigger clients_assert_record_privacy_fields
before insert or update on public.clients
for each row execute function public.assert_record_privacy_fields();

create trigger competencies_assert_record_privacy_fields
before insert or update on public.competencies
for each row execute function public.assert_record_privacy_fields();

create trigger firearms_assert_record_privacy_fields
before insert or update on public.firearms
for each row execute function public.assert_record_privacy_fields();

create trigger firearm_licences_assert_record_privacy_fields
before insert or update on public.firearm_licences
for each row execute function public.assert_record_privacy_fields();

create trigger application_cases_assert_record_privacy_fields
before insert or update on public.application_cases
for each row execute function public.assert_record_privacy_fields();

create trigger documents_assert_record_privacy_fields
before insert or update on public.documents
for each row execute function public.assert_record_privacy_fields();

create trigger dealer_user_permissions_validate
before insert or update on public.dealer_user_permissions
for each row execute function public.validate_dealer_user_permission();

create index if not exists clients_owner_user_id_idx
  on public.clients(owner_user_id);

create index if not exists competencies_owner_user_id_idx
  on public.competencies(owner_user_id);

create index if not exists firearms_owner_user_id_idx
  on public.firearms(owner_user_id);

create index if not exists firearm_licences_owner_user_id_idx
  on public.firearm_licences(owner_user_id);

create index if not exists application_cases_owner_user_id_idx
  on public.application_cases(owner_user_id);

create index if not exists documents_owner_user_id_idx
  on public.documents(owner_user_id);

create index if not exists clients_record_scope_idx
  on public.clients(dealer_id, record_scope);

create index if not exists competencies_record_scope_idx
  on public.competencies(dealer_id, record_scope);

create index if not exists firearms_record_scope_idx
  on public.firearms(dealer_id, record_scope);

create index if not exists firearm_licences_record_scope_idx
  on public.firearm_licences(dealer_id, record_scope);

create index if not exists application_cases_record_scope_idx
  on public.application_cases(dealer_id, record_scope);

create index if not exists documents_record_scope_idx
  on public.documents(dealer_id, record_scope);

-- Explicitly fail closed when ownership or permissions are absent.
-- Dealer membership remains necessary but no longer sufficient for private records.

commit;
