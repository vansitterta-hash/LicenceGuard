begin;

set local lock_timeout = '5s';

create or replace function public.create_or_resume_competency_application_draft(
  p_dealer_id uuid,
  p_client_id uuid,
  p_values jsonb
)
returns public.application_cases
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_case public.application_cases;
  v_input public.application_cases;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_dealer_member(p_dealer_id) then
    raise exception 'You do not have access to this dealer.';
  end if;

  if not public.is_record_authorized_for_user('clients', p_client_id, v_user_id)
    or not exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.dealer_id = p_dealer_id
    )
  then
    raise exception 'Client is not available to this dealer.';
  end if;

  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'Start the application in a fresh transaction and try again.';
  end if;

  perform 1
  from public.clients c
  where c.id = p_client_id
    and c.dealer_id = p_dealer_id
  for update;

  if not found then
    raise exception 'Client is not available to this dealer.';
  end if;

  v_input := jsonb_populate_record(null::public.application_cases, coalesce(p_values, '{}'::jsonb));

  if v_input.dealer_id is distinct from p_dealer_id
    or v_input.client_id is distinct from p_client_id
  then
    raise exception 'Application tenant details do not match the authorized request.';
  end if;

  if v_input.application_type not in (
      'COMPETENCY_FIRST_APPLICATION',
      'COMPETENCY_ADDITIONAL_CATEGORY',
      'COMPETENCY_RENEWAL',
      'COMPETENCY_REAPPLICATION'
    )
    or v_input.application_type is null
    or v_input.status is distinct from 'NOT_STARTED'
  then
    raise exception 'This application cannot be started as a competency draft.';
  end if;

  if v_input.competency_id is not null and (
    not public.is_record_authorized_for_user('competencies', v_input.competency_id, v_user_id)
    or not exists (
      select 1 from public.competencies c
      where c.id = v_input.competency_id
        and c.dealer_id = p_dealer_id
        and c.client_id = p_client_id
    )
  ) then
    raise exception 'Competency is not available for this client.';
  end if;

  select ac.*
  into v_case
  from public.application_cases ac
  where ac.dealer_id = p_dealer_id
    and ac.client_id = p_client_id
    and ac.application_type = v_input.application_type
    and ac.status = 'NOT_STARTED'
  order by ac.created_at, ac.id
  limit 1
  for update;

  if found then
    if not public.is_record_authorized_for_user('application_cases', v_case.id, v_user_id) then
      raise exception 'An existing application draft is not available to this user.';
    end if;
    return v_case;
  end if;

  insert into public.application_cases (
    dealer_id,
    client_id,
    application_type,
    status,
    competency_category,
    competency_id,
    acquisition_source,
    motivation_summary,
    opened_date,
    target_submission_date,
    police_station,
    actual_submission_date,
    application_reference,
    outcome_date,
    outcome_notes,
    progress_percent,
    dealer_notes,
    client_notes,
    record_scope,
    created_by,
    updated_by,
    owner_user_id
  )
  values (
    p_dealer_id,
    p_client_id,
    v_input.application_type,
    'NOT_STARTED',
    v_input.competency_category,
    v_input.competency_id,
    'NOT_APPLICABLE',
    v_input.motivation_summary,
    v_input.opened_date,
    v_input.target_submission_date,
    v_input.police_station,
    v_input.actual_submission_date,
    v_input.application_reference,
    v_input.outcome_date,
    v_input.outcome_notes,
    v_input.progress_percent,
    v_input.dealer_notes,
    v_input.client_notes,
    'PRIVATE',
    v_user_id,
    v_user_id,
    v_user_id
  )
  returning * into v_case;

  return v_case;
end;
$function$;

create or replace function public.create_or_resume_firearm_application_draft(
  p_dealer_id uuid,
  p_client_id uuid,
  p_application_type public.application_case_type,
  p_firearm_id uuid,
  p_firearm_licence_id uuid,
  p_licence_section text,
  p_acquisition_source text,
  p_opened_date date
)
returns public.application_cases
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_case public.application_cases;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_dealer_member(p_dealer_id) then
    raise exception 'You do not have access to this dealer.';
  end if;

  if p_application_type not in (
    'FIREARM_LICENCE_FIRST_APPLICATION',
    'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
    'FIREARM_LICENCE_RENEWAL',
    'FIREARM_LICENCE_REAPPLICATION'
  ) then
    raise exception 'Draft creation is only available for firearm application types';
  end if;

  if not public.is_record_authorized_for_user('clients', p_client_id, v_user_id)
    or not exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.dealer_id = p_dealer_id
    )
  then
    raise exception 'Client is not available to this dealer';
  end if;

  if not public.is_record_authorized_for_user('firearms', p_firearm_id, v_user_id)
    or not exists (
      select 1 from public.firearms f
      where f.id = p_firearm_id
        and f.dealer_id = p_dealer_id
        and f.client_id = p_client_id
    )
  then
    raise exception 'Firearm is not available for this client and dealer';
  end if;

  if p_firearm_licence_id is not null and (
    not public.is_record_authorized_for_user('firearm_licences', p_firearm_licence_id, v_user_id)
    or not exists (
      select 1 from public.firearm_licences fl
      where fl.id = p_firearm_licence_id
        and fl.dealer_id = p_dealer_id
        and fl.client_id = p_client_id
        and fl.firearm_id = p_firearm_id
    )
  ) then
    raise exception 'Firearm licence is not available for this firearm, client and dealer';
  end if;

  perform 1
  from public.clients c
  where c.id = p_client_id
    and c.dealer_id = p_dealer_id
  for update;

  if not found then
    raise exception 'Client is not available to this dealer';
  end if;

  select ac.*
  into v_case
  from public.application_cases ac
  where ac.dealer_id = p_dealer_id
    and ac.client_id = p_client_id
    and ac.application_type = p_application_type
    and ac.firearm_id = p_firearm_id
    and ac.status = 'NOT_STARTED'
    and ac.id not in (
      '3ecd17e8-1608-41bf-9152-eb8c5b371a42'::uuid,
      '93b8611d-93b8-4165-bfba-16f617243acc'::uuid,
      '54d9c1e5-6ff7-4f54-84e2-f387964032a3'::uuid
    )
  order by ac.created_at, ac.id
  limit 1
  for update;

  if found and not public.is_record_authorized_for_user('application_cases', v_case.id, v_user_id) then
    raise exception 'An existing application draft is not available to this user.';
  end if;

  insert into public.application_cases (
    dealer_id,
    client_id,
    application_type,
    status,
    firearm_id,
    firearm_licence_id,
    licence_section,
    acquisition_source,
    opened_date,
    record_scope,
    created_by,
    updated_by,
    owner_user_id
  )
  values (
    p_dealer_id,
    p_client_id,
    p_application_type,
    'NOT_STARTED',
    p_firearm_id,
    p_firearm_licence_id,
    nullif(trim(p_licence_section), ''),
    p_acquisition_source,
    p_opened_date,
    'PRIVATE',
    v_user_id,
    v_user_id,
    v_user_id
  )
  on conflict (dealer_id, client_id, application_type, firearm_id)
    where status = 'NOT_STARTED'
      and firearm_id is not null
      and application_type in (
        'FIREARM_LICENCE_FIRST_APPLICATION',
        'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
        'FIREARM_LICENCE_RENEWAL',
        'FIREARM_LICENCE_REAPPLICATION'
      )
      and id not in (
        '3ecd17e8-1608-41bf-9152-eb8c5b371a42'::uuid,
        '93b8611d-93b8-4165-bfba-16f617243acc'::uuid,
        '54d9c1e5-6ff7-4f54-84e2-f387964032a3'::uuid
      )
  do update
    set updated_by = excluded.updated_by
    where public.is_record_authorized_for_user('application_cases', application_cases.id, v_user_id)
  returning * into v_case;

  if v_case.id is null then
    raise exception 'An existing application draft is not available to this user.';
  end if;

  return v_case;
end;
$function$;

create or replace function public.guard_competency_draft_start()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_case_id uuid;
begin
  if TG_OP = 'UPDATE' then
    if old.application_type::text like 'COMPETENCY_%'
      and old.status::text in ('SUBMITTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'CLOSED')
    then
      raise exception 'This application is protected and can no longer be edited.';
    end if;
  end if;

  if new.application_type::text like 'COMPETENCY_%' then
    if v_user_id is null or not public.is_dealer_member(new.dealer_id) then
      raise exception 'You do not have access to this dealer.';
    end if;

    if not public.is_record_authorized_for_user('clients', new.client_id, v_user_id)
      or not exists (
        select 1 from public.clients c
        where c.id = new.client_id and c.dealer_id = new.dealer_id
      )
    then
      raise exception 'Client is not available to this dealer.';
    end if;

    if new.competency_id is not null and (
      not public.is_record_authorized_for_user('competencies', new.competency_id, v_user_id)
      or not exists (
        select 1 from public.competencies c
        where c.id = new.competency_id
          and c.dealer_id = new.dealer_id
          and c.client_id = new.client_id
      )
    ) then
      raise exception 'Competency is not available for this client.';
    end if;
  end if;

  if TG_OP = 'INSERT'
    and new.application_type::text like 'COMPETENCY_%'
    and coalesce(new.record_scope::text, 'PRIVATE') = 'PRIVATE'
  then
    if new.owner_user_id is null then
      new.owner_user_id := v_user_id;
    elsif new.owner_user_id is distinct from v_user_id
      and not public.is_dealer_admin(new.dealer_id)
    then
      raise exception 'Private application ownership must belong to the creating user.';
    end if;
  end if;

  if new.status = 'NOT_STARTED' and new.application_type::text like 'COMPETENCY_%' then
    if TG_OP = 'UPDATE'
      and (old.dealer_id, old.client_id, old.application_type, old.status)
        is not distinct from (new.dealer_id, new.client_id, new.application_type, new.status)
    then
      return new;
    end if;

    if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
      raise exception 'Start the application in a fresh transaction and try again.';
    end if;

    perform 1 from public.clients c
    where c.id = new.client_id and c.dealer_id = new.dealer_id
    for update;

    if not found then
      raise exception 'Client is not available to this dealer.';
    end if;

    select ac.id into v_existing_case_id
    from public.application_cases ac
    where ac.dealer_id = new.dealer_id
      and ac.client_id = new.client_id
      and ac.application_type = new.application_type
      and ac.status = 'NOT_STARTED'
      and ac.id is distinct from new.id
    order by ac.created_at, ac.id
    limit 1
    for update;

    if found then
      raise exception 'A working application already exists. Continue the existing application.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.create_or_resume_competency_application_draft(uuid, uuid, jsonb) from public, anon;
revoke all on function public.create_or_resume_firearm_application_draft(uuid, uuid, public.application_case_type, uuid, uuid, text, text, date) from public, anon;
revoke all on function public.guard_competency_draft_start() from public, anon, authenticated;

grant execute on function public.create_or_resume_competency_application_draft(uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_or_resume_firearm_application_draft(uuid, uuid, public.application_case_type, uuid, uuid, text, text, date) to authenticated;

commit;
