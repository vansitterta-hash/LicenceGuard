begin;

create table if not exists public.application_workspace_events (
  id uuid primary key default gen_random_uuid(),
  application_case_id uuid not null references public.application_cases(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists application_workspace_events_case_created_idx
  on public.application_workspace_events(application_case_id, created_at desc);

alter table public.application_workspace_events enable row level security;

create policy "Dealer members can read application workspace events"
  on public.application_workspace_events for select
  to authenticated
  using (
    exists (
      select 1 from public.application_cases ac
      where ac.id = application_workspace_events.application_case_id
        and public.is_dealer_member(ac.dealer_id)
        and public.is_record_authorized_for_user('application_cases', ac.id, auth.uid())
    )
  );

create policy "Dealer members can add application workspace events"
  on public.application_workspace_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and
    exists (
      select 1 from public.application_cases ac
      where ac.id = application_workspace_events.application_case_id
        and public.is_dealer_member(ac.dealer_id)
        and public.is_record_authorized_for_user('application_cases', ac.id, auth.uid())
    )
  );

commit;
