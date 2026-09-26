begin;

do $$
declare
  v_expected_legacy_count integer;
begin
  /*
   * These three historical NOT_STARTED cases pre-date draft uniqueness.
   * They are deliberately preserved unchanged.
   *
   * Safety gate: all three must still belong to the one known legacy
   * duplicate key before they may be excluded from future uniqueness.
   */
  select count(*)
    into v_expected_legacy_count
  from public.application_cases
  where id in (
      '3ecd17e8-1608-41bf-9152-eb8c5b371a42'::uuid,
      '93b8611d-93b8-4165-bfba-16f617243acc'::uuid,
      '54d9c1e5-6ff7-4f54-84e2-f387964032a3'::uuid
    )
    and dealer_id = '17feb216-fe82-4fe2-9c1c-51b2c30e252a'::uuid
    and client_id = '7d81eb92-be38-4569-8aa9-411ba73d0e3b'::uuid
    and application_type = 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'
    and firearm_id = 'eebea409-970e-4487-833c-b81162ee2fa8'::uuid
    and status = 'NOT_STARTED';

  if v_expected_legacy_count <> 3 then
    raise exception 'Legacy firearm draft safety check failed. Expected the three known historical drafts to remain unchanged.';
  end if;

  /*
   * Refuse migration if ANY duplicate exists among rows that the new
   * uniqueness rule will cover.
   */
  if exists (
    select 1
    from public.application_cases
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
    group by dealer_id, client_id, application_type, firearm_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add firearm draft uniqueness: additional duplicate NOT_STARTED firearm application cases exist.';
  end if;
end
$$;

create unique index application_cases_one_not_started_firearm_draft_idx
  on public.application_cases (
    dealer_id,
    client_id,
    application_type,
    firearm_id
  )
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
    );

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
security invoker
set search_path = public
as $$
declare
  v_case public.application_cases;
begin
  if p_application_type not in (
    'FIREARM_LICENCE_FIRST_APPLICATION',
    'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
    'FIREARM_LICENCE_RENEWAL',
    'FIREARM_LICENCE_REAPPLICATION'
  ) then
    raise exception 'Draft creation is only available for firearm application types';
  end if;

  if not exists (
    select 1
    from public.clients
    where id = p_client_id
      and dealer_id = p_dealer_id
  ) then
    raise exception 'Client is not available to this dealer';
  end if;

  if not exists (
    select 1
    from public.firearms
    where id = p_firearm_id
      and dealer_id = p_dealer_id
      and client_id = p_client_id
  ) then
    raise exception 'Firearm is not available for this client and dealer';
  end if;

  if p_firearm_licence_id is not null
     and not exists (
       select 1
       from public.firearm_licences
       where id = p_firearm_licence_id
         and dealer_id = p_dealer_id
         and client_id = p_client_id
         and firearm_id = p_firearm_id
     )
  then
    raise exception 'Firearm licence is not available for this firearm, client and dealer';
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
    created_by,
    updated_by
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
    auth.uid(), auth.uid()
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
  returning * into v_case;

  return v_case;
end;
$$;

revoke all on function public.create_or_resume_firearm_application_draft(
  uuid, uuid, public.application_case_type, uuid, uuid, text, text, date
) from public;

grant execute on function public.create_or_resume_firearm_application_draft(
  uuid, uuid, public.application_case_type, uuid, uuid, text, text, date
) to authenticated;

commit;
