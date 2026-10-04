import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader } from './beta-test-support.mjs';

// Offline policy/payload regression, not a claim of live PostgreSQL RLS testing.
const sql = readFileSync('supabase/migrations/20260928_privacy_enforcement.sql', 'utf8');
assert.match(sql, /create policy "documents enforce ownership"[\s\S]*?owner_user_id = auth.uid\(\)/);
assert.match(sql, /create policy "dealer members can access documents"[\s\S]*?is_record_authorized_for_user\('documents', id, auth.uid\(\)\)/);
const { canAccessPrivateRecord } = loader()('src/utils/authorizationPolicy.ts');
const canRead = (record, userId) => canAccessPrivateRecord({ currentUserId: userId, ownerUserId: record.owner_user_id, scope: record.record_scope, role: 'staff', hasExplicitGrant: false });
let currentUser = 'owner', uploadCount = 0, insertCount = 0;
const files = new Map(), records = [];
const db = {
  storage: { from() { return {
    async upload(path, blob) { uploadCount++; files.set(path, new Uint8Array(await blob.arrayBuffer())); return { error: null }; },
    async remove(paths) { for (const path of paths) files.delete(path); return { error: null }; },
  }; } },
  from(table) {
    assert.equal(table, 'documents');
    let payload, selected = false, single = false;
    const filters = [];
    const q = {
      insert(value) { insertCount++; payload = value; return q; },
      select() { selected = true; return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      single() { single = true; return q; },
      async then(resolve) {
        if (payload) {
          // A returned representation triggers the STABLE policy snapshot bug.
          const record = { ...payload, record_scope: payload.record_scope ?? 'PRIVATE' };
          if (selected || record.owner_user_id !== currentUser) {
            return resolve({ error: { message: 'new row violates row-level security policy for table documents' } });
          }
          records.push(record);
          return resolve({ data: null, error: null });
        }
        assert.equal(selected, true);
        const visible = records.filter(row => canRead(row, currentUser) && filters.every(f => f(row)));
        return resolve({ data: single ? visible[0] : visible, error: null });
      },
    };
    return q;
  },
};
const service = loader({
  '../lib/supabase': { supabase: db },
  '../engines/sapsFieldMappingEngine': { mapApplicationToSapsTemplate: () => ({ template: { sourceUrl: 'pinned-template' }, sections: [] }) },
})('src/services/generatedApplicationDocumentService.ts');
const bytes = new Uint8Array([37, 80, 68, 70, 45]);
const input = { dealerId: 'dealer', clientId: 'client', userId: 'owner', bytes, values: { applicationReference: '' } };
for (const formCode of ['SAPS_271', 'SAPS_517', 'SAPS_517_A', 'SAPS_517_G', 'SAPS_518_A']) {
  const data = { application: { formCode, formLabel: formCode, applicationCaseId: `case-${formCode}` } };
  const record = await service.archiveOfficialApplicationPdf({ ...input, data });
  assert.equal(record.owner_user_id, 'owner');
  assert.equal(record.record_scope, 'PRIVATE');
  assert.equal(record.uploaded_by, 'owner');
  assert.equal(record.dealer_id, 'dealer');
  assert.equal(record.client_id, 'client');
  assert.equal(record.application_case_id, data.application.applicationCaseId);
  assert.deepEqual(files.get(record.storage_path), bytes);
  assert.equal(canRead(record, 'owner'), true);
  assert.equal(canRead(record, 'other-staff'), false);
  assert.equal(canRead({ ...record, owner_user_id: null }, 'other-staff'), false);
  assert.equal(canRead({ ...record, owner_user_id: undefined }, 'other-staff'), false);
  for (const userId of [null, undefined, '', '   ']) {
    const before = [uploadCount, insertCount];
    await assert.rejects(service.archiveOfficialApplicationPdf({ ...input, data, userId }), /Sign in/);
    await assert.rejects(service.archiveCompletedApplication({ ...input, data, userId }), /Sign in/);
    assert.deepEqual([uploadCount, insertCount], before, 'missing ownership fails before upload/insert');
  }
  currentUser = 'other-staff';
  const recordCount = records.length;
  await assert.rejects(service.archiveOfficialApplicationPdf({ ...input, data }), /row-level security/);
  assert.equal(records.length, recordCount, 'spoofed owner rejected by existing policy');
  currentUser = 'owner';
}
console.log('PASS: shared generated PDF payload assigns PRIVATE signed-in ownership and correct associations; missing owner fails closed; same-dealer ungranted staff cannot read or spoof ownership in the policy model');

// Normal uploads still use their existing service, fields and storage path.
let normalPayload;
const normalDb = { ...db, from() { return { insert(payload) {
  normalPayload = payload;
  return { select() { return { single: async () => ({ data: { id: 'normal', ...payload }, error: null }) }; } };
} }; } };
const normalService = loader({ '../lib/supabase': { supabase: normalDb } })('src/services/documentService.ts');
const blob = new Blob([bytes], { type: 'application/pdf' });
const normal = await normalService.uploadClientDocument({
  dealerId: 'dealer', clientId: 'client', userId: 'owner', applicationCaseId: 'case',
  documentType: 'ID_COPY', documentName: 'Existing upload path', documentDate: '', expiryDate: '', issuedBy: '', referenceNumber: '', notes: '',
  file: { name: 'identity.pdf', uri: '', mimeType: 'application/pdf', size: blob.size, webFile: blob },
});
assert.equal(normal.id, 'normal');
assert.equal(normalPayload.is_generated, false);
assert.equal(normalPayload.is_verified, false);
assert.equal(normalPayload.uploaded_by, 'owner');
assert.equal(normalPayload.application_case_id, 'case');
assert.match(normalPayload.storage_path, /^dealer\/client\/ID_COPY\//);
assert.equal('owner_user_id' in normalPayload, false, 'normal upload payload deliberately unchanged by this repair');
console.log('PASS: existing normal upload service behavior unchanged (mocked persistence)');
