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
  using (
    exists (
      select 1 from public.application_cases ac
      join public.dealer_memberships dm on dm.dealer_id = ac.dealer_id
      where ac.id = application_workspace_events.application_case_id
        and dm.user_id = auth.uid()
        and dm.is_active = true
    )
  );

create policy "Dealer members can add application workspace events"
  on public.application_workspace_events for insert
  with check (
    exists (
      select 1 from public.application_cases ac
      join public.dealer_memberships dm on dm.dealer_id = ac.dealer_id
      where ac.id = application_workspace_events.application_case_id
        and dm.user_id = auth.uid()
        and dm.is_active = true
    )
  );
