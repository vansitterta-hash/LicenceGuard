-- Review-only SQL proposal for beta safety gating.
-- This file is intentionally not applied to production.

begin;

create or replace function public.create_or_resume_competency_application_draft(p_dealer_id uuid, p_client_id uuid, p_values jsonb) returns public.application_cases language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_case public.application_cases;
begin
  set transaction_isolation = 'serializable';

  if auth.uid() is null then
    raise exception 'Please sign in to continue.';
  end if;

  if coalesce(p_values->>'application_type', '') = '' or coalesce(p_values->>'competency_category', '') = '' then
    raise exception 'Required competency application enum values are missing';
  end if;

  select *
    into v_case
  from public.application_cases
  where dealer_id = p_dealer_id
    and client_id = p_client_id
    and application_type = coalesce(p_values->>'application_type', 'COMPETENCY_FIRST_APPLICATION')
    and status = 'NOT_STARTED'
  order by created_at, id limit 1 for update;

  if p_values->>'competency_id' is not null and not exists (
    select 1
    from public.competencies c
    where c.id = (p_values->>'competency_id')::uuid
      and c.dealer_id = p_dealer_id
      and c.client_id = p_client_id
  ) then
    raise exception 'Competency is not available for this client and dealer.';
  end if;

  if found then return v_case; end if;

  insert into public.application_cases (
    dealer_id,
    client_id,
    application_type,
    competency_category,
    status,
    opened_date,
    created_at
  )
  select
    p_dealer_id,
    p_client_id,
    coalesce(p_values->>'application_type', 'COMPETENCY_FIRST_APPLICATION'),
    coalesce(p_values->>'competency_category', 'SHOTGUN'),
    'NOT_STARTED',
    coalesce((p_values->>'opened_date')::date, current_date),
    now()
  returning * into v_case;

  return v_case;
end;
$$;

create or replace function public.guard_beta_record_removal() returns trigger language plpgsql security definer set row_security = off set lock_timeout = '5s' set search_path = pg_catalog, public, pg_temp as $$
declare
  v_user_id uuid;
  v_row_count integer;
  v_fk record;
  applicationCaseIds uuid[];
begin
  applicationCaseIds := array[]::uuid[];

  if TG_TABLE_SCHEMA <> 'public' then
    return old;
  end if;

  if not exists (
    select 1
    from public.dealer_users du
    where du.user_id = auth.uid()
      and du.dealer_id = old.dealer_id
      and du.is_active = true
      and du.role in ('owner', 'administrator')
  ) then
    raise exception 'Only a dealer owner or administrator can remove this record.';
  end if;

  if TG_TABLE_NAME = 'application_cases' and old.status::text <> 'NOT_STARTED' then
    raise exception 'Only an unsubmitted draft can be deleted.';
  end if;

  if TG_TABLE_NAME = 'competencies' and (
    old.certificate_number is not null
    or old.issue_date is not null
    or old.expiry_date is not null
    or old.verified is true
    or old.verified_at is not null
    or old.document_url is not null
  ) then
    raise exception 'Issued or verified competency records must be retained.';
  end if;

  for v_fk in
    select conrelid, confrelid, confkey
    from pg_constraint
    where conrelid = TG_RELID
      and contype = 'f'
  loop
    get diagnostics v_row_count = row_count;
    if v_fk.confkey[1] is not null then
      applicationCaseIds := array_append(applicationCaseIds, v_fk.confkey[1]::uuid);
    end if;
    if v_row_count > 0 then
      raise exception 'This record has linked records or history and must be retained.';
    end if;
  end loop;

  if exists (
    select 1
    from public.audit_log where entity_id = old.id and dealer_id = old.dealer_id
  ) then
    raise exception 'This record has linked records or history and must be retained.';
  end if;

  lock table public.audit_log, public.documents in share mode;
  return old;
end;
$$;

revoke all on function public.guard_beta_record_removal() from public, anon, authenticated;

create or replace function public.guard_competency_draft_start() returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.status::text in ('SUBMITTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'CLOSED') then
    raise exception 'The competency draft is no longer eligible for reuse.';
  end if;

  if new.competency_id is not null and not exists (
    select 1
    from public.competencies
    where id = new.competency_id
      and dealer_id = new.dealer_id and client_id = new.client_id
  ) then
    raise exception 'Competency is not available for this client and dealer.';
  end if;

  return new;
end;
$$;

create or replace function public.remove_safe_beta_record(p_table text, p_id uuid, p_dealer_id uuid) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if p_table not in ('application_cases', 'competencies') then
    return false;
  end if;

  if p_id is null then
    return false;
  end if;

  select count(*)
    into v_count
  from public.application_cases ac
  where ac.id = p_id
    and ac.dealer_id = p_dealer_id;

  if p_table = 'application_cases' and v_count <> 1 then
    return false;
  end if;

  if p_table = 'application_cases' then
    execute 'delete from public.application_cases where id = $1 and dealer_id = $2 and status = ''NOT_STARTED'''
      using p_id, p_dealer_id;
    return found;
  end if;

  if p_table = 'competencies' then
    execute 'delete from public.competencies where id = $1 and dealer_id = $2 and certificate_number is null and issue_date is null and expiry_date is null and verified is not true'
      using p_id, p_dealer_id;
    return found;
  end if;

  return false;
end;
$$;

create or replace trigger guard_application_case_removal
before delete on public.application_cases
for each row execute function public.guard_beta_record_removal();

create or replace trigger guard_competency_removal
before delete on public.competencies
for each row execute function public.guard_beta_record_removal();

create or replace trigger guard_client_removal
before delete on public.clients
for each row execute function public.guard_beta_record_removal();

create or replace trigger guard_firearm_removal
before delete on public.firearms
for each row execute function public.guard_beta_record_removal();

create or replace trigger guard_competency_draft_start
before insert or update of status, competency_id on public.application_cases
for each row execute function public.guard_competency_draft_start();

commit;
