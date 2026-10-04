begin;

set local lock_timeout = '5s';

alter table public.application_cases
  add column if not exists primary_purpose text,
  add column if not exists sport_discipline text,
  add column if not exists sport_association text;

commit;
