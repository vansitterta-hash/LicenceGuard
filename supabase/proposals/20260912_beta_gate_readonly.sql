-- Read-only compatibility review only.
-- This proposal is intentionally not executed.

select
  n.nspname as schema_name,
  c.relname as table_name,
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as data_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attnum;

select
  t.typname as enum_name,
  e.enumlabel as enum_value
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typtype = 'e'
order by t.typname, e.enumsortorder;

select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_or_resume_competency_application_draft',
    'guard_beta_record_removal',
    'guard_competency_draft_start',
    'remove_safe_beta_record'
  )
order by p.proname;
