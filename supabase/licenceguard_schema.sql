-- ============================================================
-- LicenceGuard Desk
-- Firearm Licence Renewal Management
-- Initial Production Schema
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'dealer_user_role'
  ) then
    create type dealer_user_role as enum (
      'owner',
      'administrator',
      'staff'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'competency_category'
  ) then
    create type competency_category as enum (
      'HANDGUN',
      'RIFLE',
      'SHOTGUN',
      'SLR'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'firearm_type'
  ) then
    create type firearm_type as enum (
      'PISTOL',
      'REVOLVER',
      'BOLT_ACTION_RIFLE',
      'LEVER_ACTION_RIFLE',
      'MANUAL_RIFLE',
      'MANUAL_CARBINE',
      'SHOTGUN',
      'SELF_LOADING_RIFLE',
      'HAND_MACHINE_CARBINE',
      'PISTOL_CALIBRE_CARBINE',
      'OTHER'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'licence_status'
  ) then
    create type licence_status as enum (
      'VALID',
      'EXPIRING',
      'EXPIRED',
      'RENEWAL_IN_PROGRESS',
      'SUBMITTED',
      'RENEWED',
      'CANCELLED'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'renewal_case_status'
  ) then
    create type renewal_case_status as enum (
      'NOT_STARTED',
      'CLIENT_CONTACTED',
      'DOCUMENTS_REQUESTED',
      'DOCUMENTS_INCOMPLETE',
      'DOCUMENTS_COMPLETE',
      'PACK_IN_PREPARATION',
      'READY_FOR_SUBMISSION',
      'SUBMITTED',
      'APPROVED',
      'DECLINED',
      'CLOSED'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'notification_channel'
  ) then
    create type notification_channel as enum (
      'WHATSAPP',
      'EMAIL',
      'SMS',
      'PHONE',
      'MANUAL'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'notification_status'
  ) then
    create type notification_status as enum (
      'DRAFT',
      'QUEUED',
      'SENT',
      'DELIVERED',
      'FAILED'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'document_type'
  ) then
    create type document_type as enum (
      'ID_COPY',
      'PROOF_OF_ADDRESS',
      'CURRENT_LICENCE',
      'COMPETENCY_CERTIFICATE',
      'PASSPORT_PHOTO',
      'MOTIVATION',
      'APPLICATION_FORM',
      'ANNEXURE',
      'SUBMISSION_RECEIPT',
      'SUPPORTING_DOCUMENT',
      'OTHER'
    );
  end if;
end
$$;

-- ============================================================
-- DEALERS
-- ============================================================

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trading_name text,
  registration_number text,
  dealer_licence_number text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- DEALER USERS
-- ============================================================

create table if not exists public.dealer_users (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role dealer_user_role not null default 'staff',
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id, user_id)
);

create index if not exists dealer_users_user_id_idx
  on public.dealer_users(user_id);

create index if not exists dealer_users_dealer_id_idx
  on public.dealer_users(dealer_id);

-- ============================================================
-- CLIENTS
-- ============================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  first_name text not null,
  surname text not null,
  id_number text not null,
  cellphone text,
  alternate_cellphone text,
  email text,
  preferred_contact_channel notification_channel
    not null default 'WHATSAPP',
  address_line_1 text,
  address_line_2 text,
  suburb text,
  city text,
  province text,
  postal_code text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id, id_number)
);

create index if not exists clients_dealer_id_idx
  on public.clients(dealer_id);

create index if not exists clients_name_idx
  on public.clients(dealer_id, surname, first_name);

create index if not exists clients_id_number_idx
  on public.clients(dealer_id, id_number);

-- ============================================================
-- COMPETENCIES
-- ============================================================

create table if not exists public.competencies (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  category competency_category not null,
  certificate_number text,
  issue_date date,
  expiry_date date,
  document_url text,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, category)
);

create index if not exists competencies_dealer_id_idx
  on public.competencies(dealer_id);

create index if not exists competencies_client_id_idx
  on public.competencies(client_id);

create index if not exists competencies_expiry_date_idx
  on public.competencies(dealer_id, expiry_date);

-- ============================================================
-- FIREARMS
-- ============================================================

create table if not exists public.firearms (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  make text not null,
  model text,
  calibre text not null,
  serial_number text not null,
  firearm_type firearm_type not null,
  required_competency competency_category not null,
  competency_override_reason text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealer_id, serial_number)
);

create index if not exists firearms_dealer_id_idx
  on public.firearms(dealer_id);

create index if not exists firearms_client_id_idx
  on public.firearms(client_id);

create index if not exists firearms_serial_number_idx
  on public.firearms(dealer_id, serial_number);

-- ============================================================
-- FIREARM LICENCES
-- ============================================================

create table if not exists public.firearm_licences (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  firearm_id uuid not null references public.firearms(id) on delete cascade,
  licence_number text,
  licence_section text,
  issue_date date,
  expiry_date date not null,
  status licence_status not null default 'VALID',
  scanned_licence_url text,
  submitted_date date,
  approval_date date,
  new_expiry_date date,
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists firearm_licences_dealer_id_idx
  on public.firearm_licences(dealer_id);

create index if not exists firearm_licences_client_id_idx
  on public.firearm_licences(client_id);

create index if not exists firearm_licences_firearm_id_idx
  on public.firearm_licences(firearm_id);

create index if not exists firearm_licences_expiry_date_idx
  on public.firearm_licences(dealer_id, expiry_date);

-- ============================================================
-- RENEWAL CASES
-- ============================================================

create table if not exists public.renewal_cases (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  firearm_id uuid references public.firearms(id) on delete set null,
  firearm_licence_id uuid references public.firearm_licences(id) on delete set null,
  competency_id uuid references public.competencies(id) on delete set null,
  status renewal_case_status not null default 'NOT_STARTED',
  opened_date date not null default current_date,
  target_submission_date date,
  actual_submission_date date,
  submission_reference text,
  police_station text,
  assigned_to uuid references auth.users(id),
  progress_percent integer not null default 0
    check (progress_percent between 0 and 100),
  dealer_notes text,
  client_notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renewal_cases_dealer_id_idx
  on public.renewal_cases(dealer_id);

create index if not exists renewal_cases_client_id_idx
  on public.renewal_cases(client_id);

create index if not exists renewal_cases_status_idx
  on public.renewal_cases(dealer_id, status);

-- ============================================================
-- RENEWAL CHECKLIST ITEMS
-- ============================================================

create table if not exists public.renewal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  renewal_case_id uuid not null
    references public.renewal_cases(id) on delete cascade,
  item_key text not null,
  item_label text not null,
  is_required boolean not null default true,
  is_complete boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (renewal_case_id, item_key)
);

create index if not exists renewal_checklist_case_id_idx
  on public.renewal_checklist_items(renewal_case_id);

-- ============================================================
-- DOCUMENTS
-- ============================================================

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  renewal_case_id uuid references public.renewal_cases(id) on delete cascade,
  competency_id uuid references public.competencies(id) on delete set null,
  firearm_licence_id uuid references public.firearm_licences(id) on delete set null,
  document_type document_type not null,
  document_name text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  expiry_date date,
  is_verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  notes text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_dealer_id_idx
  on public.documents(dealer_id);

create index if not exists documents_client_id_idx
  on public.documents(client_id);

create index if not exists documents_renewal_case_id_idx
  on public.documents(renewal_case_id);

-- ============================================================
-- NOTIFICATION LOG
-- ============================================================

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  renewal_case_id uuid references public.renewal_cases(id) on delete set null,
  firearm_licence_id uuid references public.firearm_licences(id) on delete set null,
  competency_id uuid references public.competencies(id) on delete set null,
  channel notification_channel not null,
  status notification_status not null default 'DRAFT',
  recipient text,
  subject text,
  message_body text not null,
  reminder_stage_days integer,
  provider_reference text,
  error_message text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists notification_log_dealer_id_idx
  on public.notification_log(dealer_id);

create index if not exists notification_log_client_id_idx
  on public.notification_log(client_id);

create index if not exists notification_log_created_at_idx
  on public.notification_log(dealer_id, created_at desc);

-- ============================================================
-- AUDIT LOG
-- ============================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_dealer_id_idx
  on public.audit_log(dealer_id);

create index if not exists audit_log_created_at_idx
  on public.audit_log(dealer_id, created_at desc);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function public.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select dealer_id
  from public.dealer_users
  where user_id = auth.uid()
    and is_active = true
  order by created_at asc
  limit 1;
$$;

create or replace function public.current_dealer_role()
returns dealer_user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.dealer_users
  where user_id = auth.uid()
    and is_active = true
  order by created_at asc
  limit 1;
$$;

create or replace function public.is_dealer_member(target_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_users
    where user_id = auth.uid()
      and dealer_id = target_dealer_id
      and is_active = true
  );
$$;

create or replace function public.is_dealer_admin(target_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_users
    where user_id = auth.uid()
      and dealer_id = target_dealer_id
      and is_active = true
      and role in ('owner', 'administrator')
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

drop trigger if exists dealers_set_updated_at on public.dealers;
create trigger dealers_set_updated_at
before update on public.dealers
for each row execute function public.set_updated_at();

drop trigger if exists dealer_users_set_updated_at on public.dealer_users;
create trigger dealer_users_set_updated_at
before update on public.dealer_users
for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists competencies_set_updated_at on public.competencies;
create trigger competencies_set_updated_at
before update on public.competencies
for each row execute function public.set_updated_at();

drop trigger if exists firearms_set_updated_at on public.firearms;
create trigger firearms_set_updated_at
before update on public.firearms
for each row execute function public.set_updated_at();

drop trigger if exists firearm_licences_set_updated_at on public.firearm_licences;
create trigger firearm_licences_set_updated_at
before update on public.firearm_licences
for each row execute function public.set_updated_at();

drop trigger if exists renewal_cases_set_updated_at on public.renewal_cases;
create trigger renewal_cases_set_updated_at
before update on public.renewal_cases
for each row execute function public.set_updated_at();

drop trigger if exists renewal_checklist_items_set_updated_at
  on public.renewal_checklist_items;
create trigger renewal_checklist_items_set_updated_at
before update on public.renewal_checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.dealers enable row level security;
alter table public.dealer_users enable row level security;
alter table public.clients enable row level security;
alter table public.competencies enable row level security;
alter table public.firearms enable row level security;
alter table public.firearm_licences enable row level security;
alter table public.renewal_cases enable row level security;
alter table public.renewal_checklist_items enable row level security;
alter table public.documents enable row level security;
alter table public.notification_log enable row level security;
alter table public.audit_log enable row level security;

-- ============================================================
-- DEALERS POLICIES
-- ============================================================

drop policy if exists "dealer members can view dealer"
  on public.dealers;

create policy "dealer members can view dealer"
on public.dealers
for select
to authenticated
using (public.is_dealer_member(id));

drop policy if exists "dealer admins can update dealer"
  on public.dealers;

create policy "dealer admins can update dealer"
on public.dealers
for update
to authenticated
using (public.is_dealer_admin(id))
with check (public.is_dealer_admin(id));

-- ============================================================
-- DEALER USERS POLICIES
-- ============================================================

drop policy if exists "dealer members can view dealer users"
  on public.dealer_users;

create policy "dealer members can view dealer users"
on public.dealer_users
for select
to authenticated
using (public.is_dealer_member(dealer_id));

drop policy if exists "dealer admins can manage dealer users"
  on public.dealer_users;

create policy "dealer admins can manage dealer users"
on public.dealer_users
for all
to authenticated
using (public.is_dealer_admin(dealer_id))
with check (public.is_dealer_admin(dealer_id));

-- ============================================================
-- STANDARD DEALER-ISOLATED POLICIES
-- ============================================================

drop policy if exists "dealer members can access clients"
  on public.clients;

create policy "dealer members can access clients"
on public.clients
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access competencies"
  on public.competencies;

create policy "dealer members can access competencies"
on public.competencies
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access firearms"
  on public.firearms;

create policy "dealer members can access firearms"
on public.firearms
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access firearm licences"
  on public.firearm_licences;

create policy "dealer members can access firearm licences"
on public.firearm_licences
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access renewal cases"
  on public.renewal_cases;

create policy "dealer members can access renewal cases"
on public.renewal_cases
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access renewal checklist items"
  on public.renewal_checklist_items;

create policy "dealer members can access renewal checklist items"
on public.renewal_checklist_items
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access documents"
  on public.documents;

create policy "dealer members can access documents"
on public.documents
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can access notification log"
  on public.notification_log;

create policy "dealer members can access notification log"
on public.notification_log
for all
to authenticated
using (public.is_dealer_member(dealer_id))
with check (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can view audit log"
  on public.audit_log;

create policy "dealer members can view audit log"
on public.audit_log
for select
to authenticated
using (public.is_dealer_member(dealer_id));

drop policy if exists "dealer members can create audit log"
  on public.audit_log;

create policy "dealer members can create audit log"
on public.audit_log
for insert
to authenticated
with check (public.is_dealer_member(dealer_id));

-- ============================================================
-- EXPIRY VIEWS
-- ============================================================

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
join public.clients c
  on c.id = fl.client_id
join public.firearms f
  on f.id = fl.firearm_id;

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
join public.clients c
  on c.id = co.client_id;

-- ============================================================
-- INITIAL STORAGE BUCKET
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'licenceguard-documents',
  'licenceguard-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- ============================================================
-- STORAGE POLICIES
-- Folder convention:
-- dealer_id/client_id/file_name
-- ============================================================

drop policy if exists "dealer members can view licenceguard documents"
  on storage.objects;

create policy "dealer members can view licenceguard documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'licenceguard-documents'
  and public.is_dealer_member(
    split_part(name, '/', 1)::uuid
  )
);

drop policy if exists "dealer members can upload licenceguard documents"
  on storage.objects;

create policy "dealer members can upload licenceguard documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'licenceguard-documents'
  and public.is_dealer_member(
    split_part(name, '/', 1)::uuid
  )
);

drop policy if exists "dealer members can update licenceguard documents"
  on storage.objects;

create policy "dealer members can update licenceguard documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'licenceguard-documents'
  and public.is_dealer_member(
    split_part(name, '/', 1)::uuid
  )
)
with check (
  bucket_id = 'licenceguard-documents'
  and public.is_dealer_member(
    split_part(name, '/', 1)::uuid
  )
);

drop policy if exists "dealer members can delete licenceguard documents"
  on storage.objects;

create policy "dealer members can delete licenceguard documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'licenceguard-documents'
  and public.is_dealer_member(
    split_part(name, '/', 1)::uuid
  )
);

-- ============================================================
-- COMPLETE
-- ============================================================