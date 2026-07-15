-- ============================================================
-- LicenceGuard
-- Application & Renewal Case Architecture Upgrade
--
-- Supports:
-- 1. First-time competency applications
-- 2. Competency renewals
-- 3. First-time firearm licence applications
-- 4. Firearm licence renewals
-- ============================================================

begin;

-- ============================================================
-- APPLICATION CASE ENUMS
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'application_case_type'
  ) then
    create type application_case_type as enum (
      'COMPETENCY_FIRST_APPLICATION',
      'COMPETENCY_RENEWAL',
      'FIREARM_LICENCE_FIRST_APPLICATION',
      'FIREARM_LICENCE_RENEWAL'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'application_case_status'
  ) then
    create type application_case_status as enum (
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
      'WITHDRAWN',
      'CLOSED'
    );
  end if;
end
$$;

-- ============================================================
-- RENAME RENEWAL CASES TO APPLICATION CASES
-- ============================================================

do $$
begin
  if to_regclass('public.renewal_cases') is not null
     and to_regclass('public.application_cases') is null then
    alter table public.renewal_cases
      rename to application_cases;
  end if;
end
$$;

-- ============================================================
-- ADD GENERAL APPLICATION FIELDS
-- ============================================================

alter table public.application_cases
  add column if not exists application_type application_case_type;

update public.application_cases
set application_type = 'FIREARM_LICENCE_RENEWAL'
where application_type is null;

alter table public.application_cases
  alter column application_type set not null;

alter table public.application_cases
  add column if not exists competency_category competency_category;

alter table public.application_cases
  add column if not exists application_reference text;

alter table public.application_cases
  add column if not exists outcome_date date;

alter table public.application_cases
  add column if not exists outcome_notes text;

alter table public.application_cases
  add column if not exists withdrawn_date date;

alter table public.application_cases
  add column if not exists closed_date date;

-- ============================================================
-- CONVERT OLD STATUS TO GENERAL APPLICATION STATUS
-- ============================================================

alter table public.application_cases
  add column if not exists application_status application_case_status;

update public.application_cases
set application_status =
  case status::text
    when 'NOT_STARTED'
      then 'NOT_STARTED'::application_case_status
    when 'CLIENT_CONTACTED'
      then 'CLIENT_CONTACTED'::application_case_status
    when 'DOCUMENTS_REQUESTED'
      then 'DOCUMENTS_REQUESTED'::application_case_status
    when 'DOCUMENTS_INCOMPLETE'
      then 'DOCUMENTS_INCOMPLETE'::application_case_status
    when 'DOCUMENTS_COMPLETE'
      then 'DOCUMENTS_COMPLETE'::application_case_status
    when 'PACK_IN_PREPARATION'
      then 'PACK_IN_PREPARATION'::application_case_status
    when 'READY_FOR_SUBMISSION'
      then 'READY_FOR_SUBMISSION'::application_case_status
    when 'SUBMITTED'
      then 'SUBMITTED'::application_case_status
    when 'APPROVED'
      then 'APPROVED'::application_case_status
    when 'DECLINED'
      then 'DECLINED'::application_case_status
    when 'CLOSED'
      then 'CLOSED'::application_case_status
    else 'NOT_STARTED'::application_case_status
  end
where application_status is null;

alter table public.application_cases
  alter column application_status
  set default 'NOT_STARTED';

alter table public.application_cases
  alter column application_status
  set not null;

alter table public.application_cases
  drop column if exists status;

alter table public.application_cases
  rename column application_status to status;

-- ============================================================
-- CASE VALIDATION
-- ============================================================

alter table public.application_cases
  drop constraint if exists application_cases_required_links_check;

alter table public.application_cases
  add constraint application_cases_required_links_check
  check (
    (
      application_type in (
        'COMPETENCY_FIRST_APPLICATION',
        'COMPETENCY_RENEWAL'
      )
      and competency_category is not null
    )
    or
    (
      application_type in (
        'FIREARM_LICENCE_FIRST_APPLICATION',
        'FIREARM_LICENCE_RENEWAL'
      )
      and firearm_id is not null
    )
  );

-- ============================================================
-- INDEXES
-- ============================================================

drop index if exists renewal_cases_dealer_id_idx;
drop index if exists renewal_cases_client_id_idx;
drop index if exists renewal_cases_status_idx;

create index if not exists application_cases_dealer_id_idx
  on public.application_cases(dealer_id);

create index if not exists application_cases_client_id_idx
  on public.application_cases(client_id);

create index if not exists application_cases_status_idx
  on public.application_cases(dealer_id, status);

create index if not exists application_cases_type_idx
  on public.application_cases(dealer_id, application_type);

create index if not exists application_cases_competency_category_idx
  on public.application_cases(client_id, competency_category);

create index if not exists application_cases_firearm_idx
  on public.application_cases(firearm_id);

-- ============================================================
-- RENAME CHECKLIST TABLE
-- ============================================================

do $$
begin
  if to_regclass('public.renewal_checklist_items') is not null
     and to_regclass('public.application_checklist_items') is null then
    alter table public.renewal_checklist_items
      rename to application_checklist_items;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'application_checklist_items'
      and column_name = 'renewal_case_id'
  ) then
    alter table public.application_checklist_items
      rename column renewal_case_id to application_case_id;
  end if;
end
$$;

drop index if exists renewal_checklist_case_id_idx;

create index if not exists application_checklist_case_id_idx
  on public.application_checklist_items(application_case_id);

-- ============================================================
-- RENAME DOCUMENT CASE LINK
-- ============================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'renewal_case_id'
  ) then
    alter table public.documents
      rename column renewal_case_id to application_case_id;
  end if;
end
$$;

drop index if exists documents_renewal_case_id_idx;

create index if not exists documents_application_case_id_idx
  on public.documents(application_case_id);

-- ============================================================
-- RENAME NOTIFICATION CASE LINK
-- ============================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_log'
      and column_name = 'renewal_case_id'
  ) then
    alter table public.notification_log
      rename column renewal_case_id to application_case_id;
  end if;
end
$$;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

drop trigger if exists renewal_cases_set_updated_at
  on public.application_cases;

drop trigger if exists application_cases_set_updated_at
  on public.application_cases;

create trigger application_cases_set_updated_at
before update on public.application_cases
for each row execute function public.set_updated_at();

drop trigger if exists renewal_checklist_items_set_updated_at
  on public.application_checklist_items;

drop trigger if exists application_checklist_items_set_updated_at
  on public.application_checklist_items;

create trigger application_checklist_items_set_updated_at
before update on public.application_checklist_items
for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.application_cases
  enable row level security;

alter table public.application_checklist_items
  enable row level security;

drop policy if exists
  "dealer members can access renewal cases"
  on public.application_cases;

drop policy if exists
  "dealer members can access application cases"
  on public.application_cases;

create policy
  "dealer members can access application cases"
on public.application_cases
for all
to authenticated
using (
  public.is_dealer_member(dealer_id)
)
with check (
  public.is_dealer_member(dealer_id)
);

drop policy if exists
  "dealer members can access renewal checklist items"
  on public.application_checklist_items;

drop policy if exists
  "dealer members can access application checklist items"
  on public.application_checklist_items;

create policy
  "dealer members can access application checklist items"
on public.application_checklist_items
for all
to authenticated
using (
  public.is_dealer_member(dealer_id)
)
with check (
  public.is_dealer_member(dealer_id)
);

-- ============================================================
-- COMPETENCY APPLICATION VIEW
-- ============================================================

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
join public.clients c
  on c.id = ac.client_id
where ac.application_type in (
  'COMPETENCY_FIRST_APPLICATION',
  'COMPETENCY_RENEWAL'
);

-- ============================================================
-- FIREARM LICENCE APPLICATION VIEW
-- ============================================================

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
join public.clients c
  on c.id = ac.client_id
join public.firearms f
  on f.id = ac.firearm_id
where ac.application_type in (
  'FIREARM_LICENCE_FIRST_APPLICATION',
  'FIREARM_LICENCE_RENEWAL'
);

commit;