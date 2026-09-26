-- Local proposal only. No backfill, defaults, policy changes, or existing-row writes.
alter table public.clients
  add column if not exists saps271_declarations jsonb;

comment on column public.clients.saps271_declarations is
  'SAPS 271 G62-G67 client answers (NOT_ANSWERED/YES/NO), up to two incidents per question, and explicit confirmedAt timestamp. NULL means not answered.';
