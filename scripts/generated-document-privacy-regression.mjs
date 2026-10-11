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
  const data = { applicant: {}, application: { formCode, formLabel: formCode, applicationReference: '', applicationCaseId: `case-${formCode}` } };
  const values = service.createReviewValues(data);
  const record = await service.archiveOfficialApplicationPdf({ ...input, data, values });
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
    await assert.rejects(service.archiveOfficialApplicationPdf({ ...input, data, values, userId }), /Sign in/);
    await assert.rejects(service.archiveCompletedApplication({ ...input, data, userId }), /Sign in/);
    assert.deepEqual([uploadCount, insertCount], before, 'missing ownership fails before upload/insert');
  }
  currentUser = 'other-staff';
  const recordCount = records.length;
  await assert.rejects(service.archiveOfficialApplicationPdf({ ...input, data, values }), /row-level security/);
  assert.equal(records.length, recordCount, 'spoofed owner rejected by existing policy');
  currentUser = 'owner';
}
console.log('PASS: shared generated PDF payload assigns PRIVATE signed-in ownership and correct associations; missing owner fails closed; same-dealer ungranted staff cannot read or spoof ownership in the policy model');

// Normal uploads use authenticated source preflight and separate persistence.
let normalPayload, rejectInsert = false, failCleanup = false, failRead = false, uncertainInsert = false;
const linked = {
  clients: { id: 'client', dealer_id: 'dealer', owner_user_id: null, record_scope: 'PRIVATE' },
  application_cases: { id: 'case', dealer_id: 'dealer', owner_user_id: 'owner', record_scope: 'PRIVATE', client_id: 'client', firearm_id: 'firearm' },
  firearms: { id: 'firearm', dealer_id: 'dealer', owner_user_id: null, record_scope: 'PRIVATE', client_id: 'client', is_active: true },
};
const normalDb = { auth: { getUser: async () => ({ data: { user: { id: currentUser } }, error: null }) },
  storage: { from() { return { ...db.storage.from(), async remove(paths) {
    if (failCleanup) return { error: { message: 'Cleanup denied' } };
    return db.storage.from().remove(paths);
  } }; } },
  from(table) {
    if (table === 'documents') {
      const q = db.from(table), insert = q.insert, then = q.then;
      let inserting = false;
      q.insert = payload => { inserting = true; normalPayload = payload; return insert(payload); };
      q.is = q.eq;
      q.then = resolve => {
        if (inserting && rejectInsert) return resolve({ error: { message: 'Insert denied', code: '42501' } });
        if (inserting && uncertainInsert) return resolve({ error: { message: 'Connection lost' } });
        if (!inserting && failRead) return resolve({ error: { message: 'Read-back unavailable' } });
        return then(resolve);
      };
      return q;
    }
    const filters = [];
    const q = { select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, async single() {
      const row = table === 'dealer_users' ? { user_id: 'owner', dealer_id: 'dealer', is_active: true } : linked[table];
      return { data: row && filters.every(([k, v]) => row[k] === v) ? row : null, error: null };
    } };
    return q;
  },
};
const normalService = loader({ '../lib/supabase': { supabase: normalDb } })('src/services/documentService.ts');
const blob = new Blob([bytes], { type: 'application/pdf' });
const normalInput = {
  dealerId: 'dealer', clientId: 'client', userId: 'owner', applicationCaseId: 'case',
  firearmId: 'firearm', documentType: 'DEDICATED_STATUS', documentName: 'Existing upload path', documentDate: '', expiryDate: '', issuedBy: '', referenceNumber: '', notes: '',
  file: { name: 'identity.pdf', uri: '', mimeType: 'application/pdf', size: blob.size, webFile: blob },
};
const normal = await normalService.uploadClientDocument(normalInput);
assert.equal(normalPayload.is_generated, false);
assert.equal(normalPayload.is_verified, false);
assert.equal(normalPayload.uploaded_by, 'owner');
assert.equal(normalPayload.application_case_id, 'case');
assert.match(normalPayload.storage_path, /^dealer\/client\/DEDICATED_STATUS\//);
assert.equal(normal.owner_user_id, 'owner'); assert.equal(normal.record_scope, 'PRIVATE');
const denied = async override => {
  const before = uploadCount;
  await assert.rejects(normalService.uploadClientDocument({ ...normalInput, ...override }), /owner|authorized|relationships/);
  assert.equal(uploadCount, before, 'denied preflight performs no storage upload');
};
await denied({ userId: 'spoofed' }); await denied({ dealerId: 'foreign' });
await denied({ clientId: 'foreign' }); await denied({ applicationCaseId: 'foreign' }); await denied({ firearmId: 'foreign' });
for (const [table, key, value] of [
  ['application_cases', 'client_id', 'foreign'], ['application_cases', 'firearm_id', 'foreign'],
  ['firearms', 'client_id', 'foreign'], ['firearms', 'is_active', false],
  ['clients', 'owner_user_id', 'other'], ['clients', 'record_scope', 'SHARED'],
]) {
  const old = linked[table][key]; linked[table][key] = value;
  await denied({}); linked[table][key] = old;
}
currentUser = 'other-staff'; await denied({}); currentUser = 'owner';
rejectInsert = true;
await assert.rejects(normalService.uploadClientDocument(normalInput), /Insert denied/);
assert.equal(files.has(normalPayload.storage_path), false, 'confirmed rejection removes uploaded object');
failCleanup = true;
await assert.rejects(normalService.uploadClientDocument(normalInput), /Storage cleanup failed: Cleanup denied/);
assert.equal(files.has(normalPayload.storage_path), true);
failCleanup = false; rejectInsert = false; failRead = true;
await assert.rejects(normalService.uploadClientDocument(normalInput), /document was saved/);
assert.ok(records.some(r => r.storage_path === normalPayload.storage_path));
assert.equal(files.has(normalPayload.storage_path), true, 'read-back failure preserves committed file');
failRead = false; uncertainInsert = true;
await assert.rejects(normalService.uploadClientDocument(normalInput), /Save outcome is unknown/);
assert.equal(files.has(normalPayload.storage_path), true, 'uncertain insert never triggers destructive cleanup');
uncertainInsert = false;
const clientOnly = await normalService.uploadClientDocument({ ...normalInput, applicationCaseId: undefined, firearmId: undefined, documentType: 'SUPPORTING_DOCUMENT' });
assert.equal(clientOnly.application_case_id, null); assert.equal(clientOnly.firearm_id, null);
console.log('PASS: normal private uploads, authorized legacy sources, linkage/identity denial, confirmed rejection cleanup, surfaced cleanup failure and committed/uncertain file preservation');

// Existing certificate validity correction, through normal authenticated RLS paths.
const certificates = ['DEDICATED_STATUS', 'MEMBERSHIP_CERTIFICATE', 'GOOD_STANDING'].map(type => ({
  id: type, document_type: type, client_id: 'client', dealer_id: 'dealer', owner_user_id: 'owner', record_scope: 'PRIVATE',
  application_case_id: 'case', lifecycle_status: 'ACTIVE', is_verified: true, expiry_date: null, metadata: {},
  storage_path: `${type}.pdf`, firearm_id: null, competency_id: null, firearm_licence_id: null, issued_by: null,
}));
const validityApplication = { id: 'case', client_id: 'client', dealer_id: 'dealer', owner_user_id: 'owner', record_scope: 'PRIVATE', licence_section: '16' };
const savedAnswers = { associationMember: 'YES', associationName: 'SA Hunters', associationExpiry: '2027-09-12', associationNoExpiry: false };
const validityDb = { auth: normalDb.auth, from(table) {
  const filters = []; let update;
  const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, update(value) { update = value; return q; }, async single() {
    const rows = table === 'documents' ? certificates : table === 'application_cases' ? [validityApplication]
      : [{ id: 'client', dealer_id: 'dealer', saps271_declarations: { applications: { case: savedAnswers } } }];
    const row = rows.find(row => filters.every(([k,v]) => row[k] === v)
      && (table === 'clients' || row.owner_user_id === currentUser));
    if (row && update) Object.assign(row, update);
    return { data: row, error: row ? null : { message: 'RLS denied' } };
  } }; return q;
} };
const certificateService = loader({ '../lib/supabase': { supabase: validityDb } })('src/services/documentService.ts');
const validityEngine = loader()('src/engines/canonicalMotivationEngine.ts');
const certificateSources = { client: { id: 'client', dealer_id: 'dealer' }, application: validityApplication, firearm: { id: 'firearm' }, documents: certificates };
const eligible = type => validityEngine.applicableMotivationEvidence(certificateSources).some(d => d.document_type === type);
assert.equal(await certificateService.suggestedMembershipExpiry('MEMBERSHIP_CERTIFICATE', 'owner', 'case'), '2027-09-12');
assert.equal(await certificateService.suggestedMembershipExpiry('DEDICATED_STATUS', 'owner', 'case'), null, 'dedicated expiry never derives from membership');
assert.equal(eligible('MEMBERSHIP_CERTIFICATE'), false);
assert.equal(eligible('DEDICATED_STATUS'), false);
assert.equal(eligible('GOOD_STANDING'), true);
await certificateService.saveCertificateExpiry('MEMBERSHIP_CERTIFICATE', 'owner', savedAnswers.associationExpiry);
await certificateService.saveCertificateExpiry('DEDICATED_STATUS', 'owner', '2027-09-30');
assert.equal(eligible('MEMBERSHIP_CERTIFICATE'), true); assert.equal(eligible('DEDICATED_STATUS'), true);
assert.ok(certificates.every(d => d.is_verified), 'validity correction preserves actual verification');
await certificateService.saveCertificateExpiry('DEDICATED_STATUS', 'owner', '2025-06-22');
assert.equal(eligible('DEDICATED_STATUS'), false);
await assert.rejects(certificateService.saveCertificateExpiry('DEDICATED_STATUS', 'owner', '2026-02-30'), /valid-until/);
certificates[1].is_verified = false; assert.equal(eligible('MEMBERSHIP_CERTIFICATE'), false); certificates[1].is_verified = true;
certificates[1].application_case_id = 'another-case'; assert.equal(eligible('MEMBERSHIP_CERTIFICATE'), false); certificates[1].application_case_id = 'case';
currentUser = 'other-staff';
await assert.rejects(certificateService.saveCertificateExpiry('DEDICATED_STATUS', 'owner', '2099-01-01'), /owner/);
await assert.rejects(certificateService.saveCertificateExpiry('DEDICATED_STATUS', 'other-staff', '2099-01-01'), /unavailable/);
currentUser = 'owner';
await assert.rejects(certificateService.saveCertificateExpiry('GOOD_STANDING', 'owner', '2099-01-01'), /unavailable/);
certificates[1].expiry_date = null; certificates[1].issued_by = 'Different association';
assert.equal(await certificateService.suggestedMembershipExpiry('MEMBERSHIP_CERTIFICATE', 'owner', 'case'), null);
const librarySource = readFileSync('src/screens/DocumentLibraryScreen.tsx', 'utf8');
assert.match(librarySource, /Verified — validity date required/);
assert.match(librarySource, /Edit validity date/); assert.match(librarySource, /Save validity date/);
console.log('PASS: saved membership expiry suggestion, separate dedicated validity entry, unchanged verification, current/expired/unknown eligibility, owner/linkage guards and existing-library validity controls');
