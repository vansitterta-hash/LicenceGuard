import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader, hookHarness, nodes, nativeMock } from './beta-test-support.mjs';
import { complete517Profile } from './saps517-test-fixture.mjs';

// Isolated storage/records only. No live Supabase connection or applicant writes.
const application = { id: 'case', client_id: 'client', application_type: 'COMPETENCY_FIRST_APPLICATION', competency_category: 'SHOTGUN', status: 'NOT_STARTED', acquisition_source: 'NOT_APPLICABLE' };
const client = { id: 'client', first_name: 'Example', surname: 'Applicant', id_number: '8001015009087', address_line_1: '1 Example Road', city: 'Durban', province: 'KwaZulu-Natal', postal_code: '4000', saps271_declarations: complete517Profile() };
const rows = { clients: [client], application_cases: [application], competencies: [], firearms: [], firearm_licences: [], documents: [{ id: 'identity', client_id: 'client', document_type: 'ID_COPY', document_scope: 'CLIENT', lifecycle_status: 'ACTIVE', is_verified: true, metadata: {} }] };
const original = JSON.stringify(rows);
const files = new Map();
let failure = '', uploads = 0, inserts = 0;
const deny = () => { throw Error('Unexpected update/delete of existing data'); };
const db = {
  storage: { from(bucket) {
    assert.equal(bucket, 'licenceguard-documents');
    return {
      async upload(path, blob, options) {
        uploads++;
        assert.equal(options.upsert, false);
        if (failure === 'upload') return { error: { message: 'Upload failed' } };
        files.set(path, new Uint8Array(await blob.arrayBuffer()));
        return { error: null };
      },
      async remove(paths) { for (const path of paths) files.delete(path); return { error: null }; },
    };
  } },
  from(table) {
    const filters = []; let single = false, payload;
    const q = {
      select() { return q; }, order() { return q; },
      eq(k,v) { filters.push(row => row[k] === v); return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      insert(value) { assert.equal(table, 'documents'); payload = value; return q; },
      update: deny, delete: deny, upsert: deny,
      then(resolve, reject) {
        if (payload) {
          assert.equal(payload.owner_user_id, 'user', 'generated insert must assign the signed-in owner');
          assert.equal(payload.record_scope, 'PRIVATE', 'generated form must not become dealer-wide');
          inserts++;
          if (failure === 'insert') return Promise.resolve({ error: { message: 'Registration failed' } }).then(resolve, reject);
          const record = { id: 'generated', created_at: new Date().toISOString(), ...structuredClone(payload) };
          rows.documents.push(record);
          return Promise.resolve({ data: structuredClone(record), error: null }).then(resolve, reject);
        }
        const result = rows[table].filter(row => filters.every(f => f(row)));
        return Promise.resolve({ data: structuredClone(single ? result[0] : result), error: null }).then(resolve, reject);
      },
    }; return q;
  },
};
const mocks = { '../lib/supabase': { supabase: db } };
const load = loader(mocks);
const service = load('src/services/generatedApplicationDocumentService.ts');
const data = await load('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage('client', 'case');
const values = service.createReviewValues(data);
const read = async () => (await loader(mocks)('src/services/applicationReadinessService.ts').getClientApplicationReadiness('client')).cases[0];
const form = result => result.requirements.find(r => r.key === 'COMPETENCY_APPLICATION');
assert.equal(form(await read()).state, 'PENDING_GENERATION');
const fetchBefore = globalThis.fetch;
globalThis.fetch = async url => { assert.equal(url, '/saps-templates/SAPS_517_EN_OFFICIAL.pdf'); return new Response(readFileSync('public' + url)); };
try {
  const bad = structuredClone(data);
  bad.saps271Declarations.saps517.knowledgeOfActTest = null;
  await assert.rejects(service.archiveOfficialApplicationPdf({ dealerId: 'dealer', clientId: 'client', userId: 'user', data: bad, values }), /Complete the required SAPS 517/);
  assert.equal(uploads, 0);
  const bytes = await service.generateOfficialApplicationPdf(data, values);
  const input = { dealerId: 'dealer', clientId: 'client', userId: 'user', data, values, bytes };
  for (const mode of ['upload', 'insert']) {
    failure = mode;
    await assert.rejects(service.archiveOfficialApplicationPdf(input), /failed/i);
    assert.equal(form(await read()).state, 'PENDING_GENERATION');
    assert.equal(rows.documents.length, 1);
    assert.equal(files.size, 0, 'failed registration cleans up its upload');
    await checkWorkflow(false);
  }
  failure = '';
  const document = await service.archiveOfficialApplicationPdf(input);
  assert.equal(document.application_case_id, 'case');
  assert.equal(document.client_id, 'client');
  assert.equal(document.dealer_id, 'dealer');
  assert.equal(document.uploaded_by, 'user');
  assert.equal(document.owner_user_id, 'user');
  assert.equal(document.record_scope, 'PRIVATE');
  assert.equal(document.document_type, 'COMPETENCY_APPLICATION');
  assert.equal(document.document_scope, 'APPLICATION_CASE');
  assert.equal(document.is_generated, true);
  assert.equal(document.is_verified, false, 'generation never impersonates human review');
  assert.deepEqual(files.get(document.storage_path), bytes);
  for (let reload = 0; reload < 2; reload++) {
    const readiness = await read();
    assert.equal(form(readiness).documentId, document.id);
    assert.equal(form(readiness).state, 'UNVERIFIED', 'form exists; verification remains outstanding');
    assert.equal(readiness.missingCount, 0);
    assert.equal(readiness.readyToGenerate, false, 'compile still requires review');
    await checkWorkflow(true);
  }
  assert.equal(JSON.stringify({ ...rows, documents: rows.documents.slice(0, 1) }), original);
  const packLoad = loader({ ...mocks,
    '../engines/docxPdfRenderer': {},
    './applicationCaseService': { getApplicationCase: async () => application },
    './clientService': { getClient: async () => client },
    './documentService': { ...load('src/services/documentService.ts'), listClientDocuments: async () => structuredClone(rows.documents) },
  });
  const packService = packLoad('src/services/applicationPackService.ts');
  let manifest = await packService.buildApplicationPackManifest('client', 'case');
  assert.equal(manifest.packState, 'ACTION_REQUIRED');
  assert.equal(manifest.items.find(i => i.key === 'COMPETENCY_APPLICATION').document.id, document.id);
  // Simulate the existing human verification action in isolated test records.
  rows.documents.find(d => d.id === document.id).is_verified = true;
  manifest = await packService.buildApplicationPackManifest('client', 'case');
  assert.equal(manifest.packState, 'READY');
  assert.deepEqual(manifest.items.filter(i => i.document).map(i => i.document.id).sort(), ['generated', 'identity']);
  assert.equal(manifest.items.find(i => i.key === 'COMPETENCY_APPLICATION').document.storage_path, document.storage_path);
  rows.documents.find(d => d.id === document.id).is_verified = false;
  console.log('PASS: pack selects the persisted generated PDF and existing ID; review gates compilation; verification makes the same manifest ready without an upload');
  console.log('PASS: exact PDF registered to current Shotgun case; reload retains generated document; SAPS forms complete; Review current; Compile waits for verification; failures leave forms incomplete; existing records unchanged');
} finally { globalThis.fetch = fetchBefore; }

async function checkWorkflow(saved) {
  const harness = hookHarness();
  const navigations = [];
  const screenLoad = loader({ ...mocks, react: harness.react,
    'react-native': nativeMock,
    'lucide-react-native': new Proxy({}, { get: (_, key) => String(key) }),
    '../components/Button': 'Button', '../components/Card': 'Card', '../components/Screen': 'Screen', '../components/TextField': 'TextField',
    '../components/intelligence/ReadOnlyIntelligencePanel': 'IntelligencePanel',
    '../context/AuthContext': { useAuth: () => ({ dealerProfile: { dealerId: 'dealer' }, user: { id: 'user' } }) },
    '../utils/userAlert': { userAlert: { alert: (...args) => { throw Error(args.join(': ')); } } },
    '../services/documentService': { ...load('src/services/documentService.ts'), listClientDocuments: async () => structuredClone(rows.documents) },
    '../services/applicationCaseService': { getApplicationCase: async () => application },
    '../services/applicationDocumentSuggestionService': { suggestApplicationDocuments: async () => ({ suggestions: [] }) },
    '../services/applicationWorkspaceService': { getApplicationWorkspaceMeta: async () => ({ id: 'case', status: 'NOT_STARTED', progressPercent: 0 }), listApplicationWorkspaceEvents: async () => [], saveApplicationDraft: deny, recordApplicationWorkspaceEvent: deny },
    '../services/applicationOrchestratorService': { orchestrateApplicationPack: deny },
  });
  harness.mount(screenLoad('src/screens/ApplicationReadinessScreen.tsx').default, { navigation: { addListener: () => () => {}, navigate: (...args) => navigations.push(args) }, route: { params: { clientId: 'client', applicationCaseId: 'case' } } });
  await harness.settle();
  const workflow = nodes(harness.tree).find(n => n.props?.title === 'Guided application workflow');
  const labels = node => nodes(node).map(n => n.props?.children).filter(v => typeof v === 'string');
  const step = title => nodes(workflow).find(n => n.type === 'Pressable' && labels(n).includes(title));
  assert.ok(labels(step('SAPS forms')).includes(saved ? 'Complete' : 'Current step'));
  assert.ok(labels(step('Review')).includes(saved ? 'Current step' : 'Waiting'));
  assert.ok(labels(step('Compile')).includes('Waiting'));
  const generated = nodes(harness.tree).find(n => n.props?.title === 'Generated documents');
  assert.equal(labels(generated).includes('No generated documents yet'), !saved);
  if (saved) assert.ok(labels(generated).includes(rows.documents.at(-1).document_name));
  if (saved) {
    const reviewButton = nodes(harness.tree).find(n => n.type === 'Button' && n.props?.title === 'Review');
    assert.ok(reviewButton, 'generated form offers Review instead of Replace/Upload');
    reviewButton.props.onPress();
    assert.equal(navigations.at(-1)[0], 'DocumentLibrary');
    assert.equal(navigations.at(-1)[1].openUpload, false);
    assert.equal(navigations.at(-1)[1].applicationCaseId, 'case');
  }
  harness.unmount();
}

// Shared orchestrator must use the selected form, not regenerate it on compile.
for (const [applicationType, documentType] of [
  ['COMPETENCY_FIRST_APPLICATION', 'COMPETENCY_APPLICATION'],
  ['COMPETENCY_ADDITIONAL_CATEGORY', 'COMPETENCY_APPLICATION'],
  ['COMPETENCY_RENEWAL', 'COMPETENCY_RENEWAL_FORM'],
  ['FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_APPLICATION_FORM'],
  ['FIREARM_LICENCE_RENEWAL', 'FIREARM_LICENCE_RENEWAL_FORM'],
]) {
  for (const reviewed of [false, true]) {
    let compiled = 0;
    const orchestrator = loader({
      './applicationCaseService': { getApplicationCase: async () => ({ application_type: applicationType }) },
      './applicationDocumentSuggestionService': { suggestApplicationDocuments: async () => ({ suggestions: [] }) },
      './applicationAutofillService': { buildApplicationAutofillPackage: async () => ({ canGenerate: true }) },
      './applicationReadinessService': { getClientApplicationReadiness: async () => ({ cases: [{ caseId: 'case', requirements: [{ documentType, documentId: 'saved-form' }] }] }) },
      './generatedApplicationDocumentService': { archiveOfficialApplicationPdf: deny, createReviewValues: deny },
      './applicationPackService': {
        prepareApplicationPack: async () => ({ manifest: { packState: reviewed ? 'READY' : 'ACTION_REQUIRED', blockingReasons: ['Review required'] } }),
        generateAndArchiveApplicationPack: async () => { compiled++; return { bytes: new Uint8Array(), fileName: 'pack.pdf' }; },
        downloadGeneratedApplicationPack: () => {},
      },
    })('src/services/applicationOrchestratorService.ts');
    await orchestrator.orchestrateApplicationPack({ dealerId: 'dealer', userId: 'user', clientId: 'client', applicationCaseId: 'case' });
    assert.equal(compiled, reviewed ? 1 : 0);
  }
}
console.log('PASS: shared orchestrator reuses saved forms across 271/517/517(a)/517(g)/518(a); review still gates compile; no duplicate form registration');
