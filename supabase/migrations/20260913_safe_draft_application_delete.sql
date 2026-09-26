-- LicenceGuard
-- Safe deletion of NOT_STARTED application drafts.
--
-- Purpose:
-- 1. Preserve reusable documents.
-- 2. Remove only the deleted draft's logical document link.
-- 3. Clear documents.application_case_id only when it points to that draft.
-- 4. Delete the draft in the same database transaction.
-- 5. Preserve the existing guard_beta_case_removal trigger protections.
-- 6. Explicitly protect the three known historical firearm drafts.

create or replace function public.delete_application_case_draft(
  p_application_case_id uuid,
  p_dealer_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_case public.application_cases%rowtype;
begin
  -- These three historical firearm drafts are intentionally immutable.
  if p_application_case_id in (
    '3ecd17e8-1608-41bf-9152-eb8c5b371a42'::uuid,
    '93b8611d-93b8-4165-bfba-16f617243acc'::uuid,
    '54d9c1e5-6ff7-4f54-84e2-f387964032a3'::uuid
  ) then
    raise exception
      'This historical application draft is protected and cannot be deleted.';
  end if;

  -- Lock and validate the exact application draft.
  select *
  into v_case
  from public.application_cases
  where id = p_application_case_id
    and dealer_id = p_dealer_id
  for update;

  if not found then
    raise exception
      'Application draft was not found or is not available to this dealer.';
  end if;

  if v_case.status is distinct from 'NOT_STARTED' then
    raise exception
      'Only a not-started application draft can be deleted.';
  end if;

  if v_case.actual_submission_date is not null
     or nullif(v_case.application_reference, '') is not null
     or v_case.outcome_date is not null
     or v_case.closed_date is not null
     or v_case.withdrawn_date is not null
  then
    raise exception
      'Only an unsubmitted draft without outcome or submission records can be deleted.';
  end if;

  -- Preserve documents but detach this draft from them.
  --
  -- A reusable document may reference multiple application cases through:
  -- metadata.applicationCaseIds
  --
  -- Remove only this application's ID and leave every other case link intact.
  update public.documents
  set
    application_case_id =
      case
        when application_case_id = p_application_case_id then null
        else application_case_id
      end,
    metadata =
      case
        when metadata->'applicationCaseIds'
             @> jsonb_build_array(p_application_case_id::text)
        then jsonb_set(
          metadata,
          '{applicationCaseIds}',
          coalesce(
            (
              select jsonb_agg(item)
              from jsonb_array_elements_text(
                coalesce(
                  metadata->'applicationCaseIds',
                  '[]'::jsonb
                )
              ) as items(item)
              where item <> p_application_case_id::text
            ),
            '[]'::jsonb
          ),
          false
        )
        else metadata
      end
  where dealer_id = p_dealer_id
    and (
      application_case_id = p_application_case_id
      or metadata->'applicationCaseIds'
           @> jsonb_build_array(p_application_case_id::text)
    );

  -- Existing BEFORE DELETE guard remains active.
  -- If audit history, remaining FK references, submission history,
  -- or another protected condition exists, this DELETE will fail and
  -- PostgreSQL will roll back the document-detachment update above.
  delete from public.application_cases
  where id = p_application_case_id
    and dealer_id = p_dealer_id;

  if not found then
    raise exception
      'The application draft could not be deleted.';
  end if;
end;
$function$;

revoke all
on function public.delete_application_case_draft(uuid, uuid)
from public;

grant execute
on function public.delete_application_case_draft(uuid, uuid)
to authenticated;