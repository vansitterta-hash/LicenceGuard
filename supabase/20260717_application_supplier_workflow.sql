begin;

alter table public.application_cases
  add column if not exists acquisition_source text not null default 'NOT_APPLICABLE',
  add column if not exists supplier_name text,
  add column if not exists supplier_id_or_registration text,
  add column if not exists supplier_contact text,
  add column if not exists supplier_licence_number text,
  add column if not exists sale_or_invoice_reference text,
  add column if not exists motivation_summary text;

alter table public.application_cases
  drop constraint if exists application_cases_acquisition_source_check;

alter table public.application_cases
  add constraint application_cases_acquisition_source_check
  check (acquisition_source in (
    'DEALER',
    'PRIVATE_SELLER',
    'EXISTING_FIREARM',
    'NOT_APPLICABLE'
  ));

comment on column public.application_cases.acquisition_source is
  'How the firearm enters the application: dealer, private seller, existing firearm, or not applicable.';
comment on column public.application_cases.supplier_name is
  'Dealer trading name or private seller full name.';
comment on column public.application_cases.supplier_id_or_registration is
  'Private seller identity number or dealer registration/reference.';
comment on column public.application_cases.supplier_licence_number is
  'Dealer licence number or private seller firearm licence number where applicable.';
comment on column public.application_cases.motivation_summary is
  'Working motivation brief used while preparing the full motivation document.';

commit;
