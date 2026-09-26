-- LicenceGuard live-schema inspection (read-only)
-- Run in the Supabase SQL editor. This script performs SELECT statements only.
-- Export every result grid so it can be compared with the repository audit.

-- 1. PostgreSQL/project identity (no secrets).
select
  current_database() as database_name,
  current_user as database_user,
  current_setting('server_version') as postgres_version,
  current_schema() as current_schema;
 
-- 2. Supabase migration history, when available.
-- query_to_xml executes the table query only when to_regclass confirms that
-- the optional migration-history relation exists. SELECT * avoids assuming a
-- particular Supabase CLI version's migration-history column layout.
select
  case
    when to_regclass('supabase_migrations.schema_migrations') is null
      then 'MIGRATION_HISTORY_TABLE_NOT_PRESENT'
    else 'MIGRATION_HISTORY_TABLE_EXISTS'
  end as migration_history_status,
  case
    when to_regclass('supabase_migrations.schema_migrations') is null
      then null
    else query_to_xml(
      'select * from supabase_migrations.schema_migrations order by 1',
      true,
      false,
      ''
    )::text
  end as migration_history_records;

-- 3. Presence and RLS state of relevant public tables.
select
  n.nspname as table_schema,
  c.relname as table_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'dealers',
    'dealer_users',
    'dealer_memberships',
    'clients',
    'competencies',
    'firearms',
    'firearm_licences',
    'renewal_cases',
    'application_cases',
    'renewal_checklist_items',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events'
  )
order by c.relname;

-- 4. Exact columns, types, enum/domain identity, defaults and nullability.
select
  cols.table_schema,
  cols.table_name,
  cols.ordinal_position,
  cols.column_name,
  cols.data_type,
  cols.udt_schema,
  cols.udt_name,
  cols.is_nullable,
  cols.column_default,
  cols.is_identity,
  cols.identity_generation,
  cols.is_generated,
  cols.generation_expression
from information_schema.columns cols
where cols.table_schema = 'public'
  and cols.table_name in (
    'dealer_users',
    'dealer_memberships',
    'clients',
    'competencies',
    'firearms',
    'firearm_licences',
    'renewal_cases',
    'application_cases',
    'renewal_checklist_items',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events'
  )
order by cols.table_name, cols.ordinal_position;

-- 5. Every public enum and its values in declared order.
select
  n.nspname as enum_schema,
  t.typname as enum_name,
  e.enumsortorder,
  e.enumlabel
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
join pg_catalog.pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
order by t.typname, e.enumsortorder;

-- 6. Primary, unique, foreign-key and check constraints, including definitions.
select
  n.nspname as table_schema,
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition,
  con.convalidated as is_validated
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'dealer_users',
    'dealer_memberships',
    'clients',
    'competencies',
    'firearms',
    'firearm_licences',
    'renewal_cases',
    'application_cases',
    'renewal_checklist_items',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events'
  )
order by c.relname, constraint_type, con.conname;

-- 7. Foreign keys with resolved source and target columns.
select
  src_ns.nspname as source_schema,
  src.relname as source_table,
  con.conname as foreign_key_name,
  src_att.attname as source_column,
  target_ns.nspname as target_schema,
  target.relname as target_table,
  target_att.attname as target_column,
  con.confdeltype as delete_action_code,
  con.confupdtype as update_action_code
from pg_catalog.pg_constraint con
join pg_catalog.pg_class src on src.oid = con.conrelid
join pg_catalog.pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_catalog.pg_class target on target.oid = con.confrelid
join pg_catalog.pg_namespace target_ns on target_ns.oid = target.relnamespace
join lateral unnest(con.conkey) with ordinality src_key(attnum, ord) on true
join lateral unnest(con.confkey) with ordinality target_key(attnum, ord)
  on target_key.ord = src_key.ord
join pg_catalog.pg_attribute src_att
  on src_att.attrelid = src.oid and src_att.attnum = src_key.attnum
join pg_catalog.pg_attribute target_att
  on target_att.attrelid = target.oid and target_att.attnum = target_key.attnum
where con.contype = 'f'
  and src_ns.nspname = 'public'
  and src.relname in (
    'application_cases',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events'
  )
order by src.relname, con.conname, src_key.ord;

-- 8. Indexes and complete index definitions.
select
  schemaname as table_schema,
  tablename as table_name,
  indexname as index_name,
  indexdef as index_definition
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'application_cases',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events',
    'dealer_users',
    'dealer_memberships'
  )
order by tablename, indexname;

-- 9. RLS policies and their exact USING/WITH CHECK expressions.
select
  schemaname as table_schema,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'application_cases',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events',
    'dealer_users',
    'dealer_memberships'
  )
order by tablename, policyname;

-- 10. Triggers attached to relevant tables.
select
  event_object_schema as table_schema,
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'application_cases',
    'application_checklist_items',
    'documents',
    'document_templates',
    'application_workspace_events'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 11. Definitions of relevant helper functions and views.
select
  n.nspname as routine_schema,
  p.proname as routine_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_dealer_id',
    'current_dealer_role',
    'is_dealer_member',
    'is_dealer_admin',
    'set_updated_at'
  )
order by p.proname;

select
  schemaname as view_schema,
  viewname as view_name,
  definition
from pg_catalog.pg_views
where schemaname = 'public'
  and viewname in (
    'competency_application_case_view',
    'firearm_licence_application_case_view'
  )
order by viewname;

-- 12. Referenced-table check for the workspace-event policies.
select
  to_regclass('public.dealer_users') as dealer_users_table,
  to_regclass('public.dealer_memberships') as dealer_memberships_table,
  to_regclass('public.application_workspace_events') as workspace_events_table;

-- 13. Focused compatibility matrix for fields used by current TypeScript/services.
with expected(table_name, column_name) as (
  values
    ('application_cases', 'id'),
    ('application_cases', 'dealer_id'),
    ('application_cases', 'client_id'),
    ('application_cases', 'application_type'),
    ('application_cases', 'status'),
    ('application_cases', 'competency_category'),
    ('application_cases', 'competency_id'),
    ('application_cases', 'firearm_id'),
    ('application_cases', 'firearm_licence_id'),
    ('application_cases', 'licence_section'),
    ('application_cases', 'acquisition_source'),
    ('application_cases', 'supplier_name'),
    ('application_cases', 'supplier_id_or_registration'),
    ('application_cases', 'supplier_contact'),
    ('application_cases', 'supplier_licence_number'),
    ('application_cases', 'sale_or_invoice_reference'),
    ('application_cases', 'motivation_summary'),
    ('application_cases', 'opened_date'),
    ('application_cases', 'target_submission_date'),
    ('application_cases', 'actual_submission_date'),
    ('application_cases', 'application_reference'),
    ('application_cases', 'police_station'),
    ('application_cases', 'outcome_date'),
    ('application_cases', 'outcome_notes'),
    ('application_cases', 'withdrawn_date'),
    ('application_cases', 'closed_date'),
    ('application_cases', 'assigned_to'),
    ('application_cases', 'progress_percent'),
    ('application_cases', 'dealer_notes'),
    ('application_cases', 'client_notes'),
    ('application_cases', 'created_by'),
    ('application_cases', 'updated_by'),
    ('application_cases', 'created_at'),
    ('application_cases', 'updated_at'),
    ('documents', 'id'),
    ('documents', 'dealer_id'),
    ('documents', 'client_id'),
    ('documents', 'competency_id'),
    ('documents', 'firearm_id'),
    ('documents', 'firearm_licence_id'),
    ('documents', 'application_case_id'),
    ('documents', 'parent_document_id'),
    ('documents', 'document_type'),
    ('documents', 'document_scope'),
    ('documents', 'lifecycle_status'),
    ('documents', 'document_name'),
    ('documents', 'document_date'),
    ('documents', 'expiry_date'),
    ('documents', 'issued_by'),
    ('documents', 'reference_number'),
    ('documents', 'version_number'),
    ('documents', 'storage_path'),
    ('documents', 'file_name'),
    ('documents', 'original_file_name'),
    ('documents', 'mime_type'),
    ('documents', 'file_size_bytes'),
    ('documents', 'checksum_sha256'),
    ('documents', 'is_verified'),
    ('documents', 'is_generated'),
    ('documents', 'generated_from_template_id'),
    ('documents', 'archived_at'),
    ('documents', 'archived_by'),
    ('documents', 'archive_reason'),
    ('documents', 'notes'),
    ('documents', 'metadata'),
    ('documents', 'created_by'),
    ('documents', 'updated_by'),
    ('documents', 'created_at'),
    ('documents', 'updated_at')
)
select
  expected.table_name,
  expected.column_name,
  case when cols.column_name is null then false else true end as exists_live,
  cols.data_type,
  cols.udt_name,
  cols.is_nullable,
  cols.column_default
from expected
left join information_schema.columns cols
  on cols.table_schema = 'public'
 and cols.table_name = expected.table_name
 and cols.column_name = expected.column_name
order by expected.table_name, expected.column_name;
