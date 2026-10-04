// Local PostgreSQL/WASM only. Install the isolated runtime with:
// npm install --prefix .tmp/generated-documents-rls-runtime --no-save --package-lock=false @electric-sql/pglite
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loader } from './beta-test-support.mjs';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const { PGlite } = require('../.tmp/generated-documents-rls-runtime/node_modules/@electric-sql/pglite');
const pg = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const colleague = '00000000-0000-4000-8000-000000000002';
const dealer = '00000000-0000-4000-8000-000000000003';
const client = '00000000-0000-4000-8000-000000000004';
const application = '00000000-0000-4000-8000-000000000005';
const sql = readFileSync('supabase/migrations/20260928_privacy_enforcement.sql', 'utf8');
const foundation = readFileSync('supabase/migrations/20260927_privacy_authorization_foundation.sql', 'utf8');
// Catalog inspection of linked production on 2026-10-03 confirmed this helper's
// body matches the repository, but the DEPLOYED function is SECURITY DEFINER.
// This replacement is test-only; no migration or production function is changed.
const authorization = sql.match(/create or replace function public\.is_record_authorized_for_user\([\s\S]*?\$\$;/i)[0].replace('security invoker', 'security definer');
const privacyTrigger = foundation.match(/create or replace function public\.assert_record_privacy_fields\([\s\S]*?\$\$;/i)[0];
const policies = [...sql.matchAll(/create policy "[^"]+"\s+on public\.documents[\s\S]*?;/gi)].map(m => m[0]);
assert.equal(policies.length, 4, 'live documents policies: SELECT, INSERT, UPDATE, DELETE');
const files = new Map();
let rejectRead = false;
const columns = ['id', 'dealer_id', 'client_id', 'application_case_id', 'owner_user_id', 'record_scope', 'uploaded_by', 'storage_path'];
const db = {
  storage: { from() { return {
    async upload(path, blob) { files.set(path, new Uint8Array(await blob.arrayBuffer())); return { error: null }; },
    async remove(paths) { paths.forEach(path => files.delete(path)); return { error: null }; },
  }; } },
  from(table) {
    assert.equal(table, 'documents');
    let payload, returning = false, single = false;
    const filters = [];
    const q = {
      insert(value) { payload = value; return q; },
      select() { returning = true; return q; },
      eq(key, value) { assert.ok(columns.includes(key)); filters.push([key, value]); return q; },
      single() { single = true; return q; },
      async then(resolve, reject) {
        try {
          let result;
          if (payload) {
            const keys = columns.filter(k => payload[k] !== undefined);
            const values = keys.map(k => payload[k]);
            values.push(payload);
            result = await pg.query(`insert into public.documents (${keys.join(',')}, record) values (${values.map((_, i) => '$' + (i + 1)).join(',')})${returning ? ' returning *' : ''}`, values);
          } else {
            if (rejectRead) throw Error('Read-back unavailable');
            assert.equal(returning, true);
            result = await pg.query(`select * from public.documents where ${filters.map(([k], i) => `${k} = $${i + 1}`).join(' and ')}`, filters.map(([, v]) => v));
          }
          const rows = result.rows.map(({ record, ...row }) => ({ ...record, ...row }));
          if (single && rows.length !== 1) throw Error('Expected one authorized generated document');
          return resolve({ data: single ? rows[0] : rows, error: null });
        } catch (error) { return resolve({ data: null, error: { message: error.message, code: error.code } }); }
      },
    }; return q;
  },
};
try {
  await pg.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
    create type public.record_scope as enum ('PRIVATE','SHARED','TEST');
    create table public.dealers (id uuid primary key, workspace_kind text);
    create table public.dealer_users (user_id uuid, dealer_id uuid, role text, is_active boolean);
    create table public.dealer_user_permissions (user_id uuid, dealer_id uuid, permission text, scope_type text, expires_at timestamptz);
    create table public.documents (id uuid primary key default gen_random_uuid(), dealer_id uuid not null, client_id uuid not null, application_case_id uuid, owner_user_id uuid, record_scope public.record_scope not null default 'PRIVATE', uploaded_by uuid, storage_path text, record jsonb);
    create function public.is_dealer_member(target_dealer_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.dealer_users where user_id = auth.uid() and dealer_id = target_dealer_id and is_active = true) $$;
    create function public.is_dealer_admin(target_dealer_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.dealer_users where user_id = auth.uid() and dealer_id = target_dealer_id and is_active = true and role in ('owner','administrator')) $$;
    ${authorization}
    ${privacyTrigger}
    create trigger documents_assert_record_privacy_fields before insert or update on public.documents for each row execute function public.assert_record_privacy_fields();
    alter table public.documents enable row level security;
    ${policies.join('\n')}
    grant usage on schema public, auth to authenticated;
    grant select on public.dealer_users, public.dealers to authenticated;
    grant select, insert, update, delete on public.documents to authenticated;
    insert into public.dealers values ('${dealer}', 'PRODUCTION');
    insert into public.dealer_users values ('${owner}','${dealer}','owner',true), ('${colleague}','${dealer}','staff',true);
    set role authenticated;
  `);
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  const payload = { dealer_id: dealer, client_id: client, application_case_id: application, owner_user_id: owner, record_scope: 'PRIVATE', uploaded_by: owner, storage_path: 'synthetic.pdf' };
  const old = await db.from('documents').insert(payload).select('*').single();
  assert.equal(old.error?.code, '42501');
  assert.match(old.error.message, /new row violates row-level security policy/);
  assert.equal((await pg.query('select count(*)::int as count from public.documents')).rows[0].count, 0);
  const predicate = await pg.query('select public.is_dealer_member($1) as membership, $2::uuid = auth.uid() as ownership, public.is_record_authorized_for_user(\'documents\', $3::uuid, auth.uid()) as new_row_visible', [dealer, owner, '00000000-0000-4000-8000-000000000099']);
  assert.deepEqual(predicate.rows[0], { membership: true, ownership: true, new_row_visible: false });
  console.log('PASS: real local PostgreSQL reproduces 42501 for INSERT RETURNING despite correct PRIVATE ownership, even for dealer owner; failing predicate is the STABLE record-lookup SELECT policy');

  const service = loader({ '../lib/supabase': { supabase: db }, '../engines/sapsFieldMappingEngine': { mapApplicationToSapsTemplate: () => ({ template: { sourceUrl: 'synthetic' }, sections: [] }) } })('src/services/generatedApplicationDocumentService.ts');
  const input = { dealerId: dealer, clientId: client, userId: owner, bytes: new Uint8Array(readFileSync('public/saps-templates/SAPS_517_EN_OFFICIAL.pdf')), values: { applicationReference: '' }, data: { application: { applicationCaseId: application, formCode: 'SAPS_517', formLabel: 'SAPS 517' } } };
  const record = await service.archiveOfficialApplicationPdf(input);
  assert.equal(record.owner_user_id, owner);
  assert.equal(record.record_scope, 'PRIVATE');
  assert.equal(record.application_case_id, application);
  assert.deepEqual(files.get(record.storage_path), input.bytes);
  assert.equal((await db.from('documents').select('*').eq('id', record.id).single()).data.id, record.id);
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [colleague]);
  assert.equal((await pg.query('select * from public.documents')).rows.length, 0);
  const unauthorized = await db.from('documents').insert({ ...payload, owner_user_id: owner });
  assert.equal(unauthorized.error?.code, '42501', 'plain INSERT still enforces ownership');
  await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
  rejectRead = true;
  await assert.rejects(service.archiveOfficialApplicationPdf(input), /Read-back unavailable/);
  rejectRead = false;
  const persisted = (await pg.query('select storage_path from public.documents')).rows;
  assert.equal(persisted.length, 2);
  assert.ok(persisted.every(row => files.has(row.storage_path)), 'read-back error must not delete files belonging to committed records');
  console.log('PASS: application registration succeeds with separate RLS-authorized read-back; unauthorized same-dealer user remains denied; read-back failure reports failure without deleting committed PDF');

  // Compile the saved SAPS PDF with existing evidence through the actual pack
  // service, retaining the same local PostgreSQL INSERT/SELECT RLS execution.
  const evidencePdf = await PDFDocument.create(); evidencePdf.addPage();
  files.set('existing-id.pdf', await evidencePdf.save());
  const documents = [
    { ...record, is_verified: true },
    { id: 'existing-id', client_id: client, application_case_id: application, document_type: 'ID_COPY', document_name: 'Existing ID', storage_path: 'existing-id.pdf', file_name: 'existing-id.pdf', mime_type: 'application/pdf', lifecycle_status: 'ACTIVE', is_verified: true, metadata: {} },
  ];
  let statusUpdates = 0;
  const packDb = { ...db, from(table) {
    if (table === 'documents') return db.from(table);
    assert.equal(table, 'application_cases');
    const q = { update() { return q; }, eq() { return q; }, then(resolve) { statusUpdates++; return Promise.resolve({ error: null }).then(resolve); } };
    return q;
  } };
  const packService = loader({
    '../lib/supabase': { supabase: packDb },
    '../engines/docxPdfRenderer': {},
    './clientService': { getClient: async () => ({ first_name: 'Synthetic', surname: 'Applicant', id_number: '8001015009087' }) },
    './applicationCaseService': { getApplicationCase: async () => ({ id: application, application_type: 'COMPETENCY_FIRST_APPLICATION', subjectDescription: 'Shotgun competency', status: 'NOT_STARTED' }) },
    './applicationReadinessService': { getClientApplicationReadiness: async () => ({ cases: [{ caseId: application, state: 'READY', score: 100, requirements: documents.map(d => ({ key: d.document_type, label: d.document_name, detail: 'Verified', documentType: d.document_type, documentId: d.id, required: true, delivery: 'DIGITAL', state: 'SATISFIED' })) }] }) },
    './documentService': { listClientDocuments: async () => documents, createDocumentSignedUrl: async path => path },
  })('src/services/applicationPackService.ts');
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async path => { assert.ok(files.has(path)); return new Response(files.get(path)); };
  try {
    const packInput = { dealerId: dealer, clientId: client, userId: owner, applicationCaseId: application };
    await assert.rejects(packService.generateAndArchiveApplicationPack({ ...packInput, userId: null }), /Sign in/);
    const pack = await packService.generateAndArchiveApplicationPack(packInput);
    assert.equal(pack.document.owner_user_id, owner);
    assert.equal(pack.document.record_scope, 'PRIVATE');
    assert.equal(pack.document.application_case_id, application);
    assert.deepEqual(pack.includedDocumentIds.sort(), [record.id, 'existing-id'].sort());
    assert.equal((await PDFDocument.load(pack.bytes)).getPageCount(), 14);
    assert.deepEqual(files.get(pack.document.storage_path), pack.bytes);
    assert.equal((await db.from('documents').select('*').eq('id', pack.document.id).single()).data.id, pack.document.id);
    assert.equal(statusUpdates, 1);
    assert.equal((await pg.query("select count(*)::int as count from public.documents where record->>'document_type' = 'COMPETENCY_APPLICATION'")).rows[0].count, 2, 'compile never inserts or regenerates a SAPS form');
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [colleague]);
    assert.equal((await pg.query('select * from public.documents where id = $1', [pack.document.id])).rows.length, 0);
    await assert.rejects(packService.generateAndArchiveApplicationPack(packInput), /row-level security/);
    assert.equal(statusUpdates, 1, 'unauthorized registration cannot advance workflow');
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    rejectRead = true;
    await assert.rejects(packService.generateAndArchiveApplicationPack(packInput), /Read-back unavailable/);
    rejectRead = false;
    assert.equal(statusUpdates, 1, 'failed pack read-back cannot advance workflow');
    assert.ok((await pg.query('select storage_path from public.documents')).rows.every(row => files.has(row.storage_path)));
    console.log('PASS: real PostgreSQL compiled-pack registration is PRIVATE, plain INSERT + authorized read-back; same-dealer access denied; saved SAPS/ID reused; missing owner and read-back failures do not advance workflow');
  } finally { globalThis.fetch = priorFetch; }
} finally { await pg.close(); }
