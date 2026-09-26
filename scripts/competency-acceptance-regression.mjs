import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader, hookHarness, nodes, nativeMock } from './beta-test-support.mjs';

// Synthetic data only. Never connects to Supabase or archives a document.
const load = loader({ '../lib/supabase': { supabase: {} } });
const { generateOfficialApplicationPdf, createReviewValues } = load('src/services/generatedApplicationDocumentService.ts');
const declarationPolicy = load('src/utils/saps271Declarations.ts');
const declarations = declarationPolicy.emptySaps271Declarations();
for (const question of declarationPolicy.DECLARATION_QUESTIONS) declarations.answers[question.key].answer = 'NO';
const data = {
  canGenerate: true, issues: [], generatedAt: new Date().toISOString(),
  saps271Declarations: declarations,
  saps271DeclarationFields: declarationPolicy.saps271DeclarationFields(declarations),
  applicant: { fullName: 'Example Applicant', firstName: 'Example', surname: 'Applicant', idNumber: '8001015009087', cellphone: '0123456789', alternateCellphone: '', email: 'example@example.test', residentialAddress: '1 Example Road', suburb: 'Example', city: 'Example City', province: 'Gauteng', postalCode: '0001' },
  application: { applicationCaseId: 'synthetic-case', applicationType: 'COMPETENCY_FIRST_APPLICATION', formCode: 'SAPS_517', formLabel: 'SAPS 517 — Application for a competency certificate', policeStation: 'Example', applicationReference: 'TEST', openedDate: '2026-09-01', motivationSummary: '' },
  firearm: null, supplier: null,
  competency: { category: 'HANDGUN', certificateNumber: '', issueDate: '', expiryDate: '' },
};
const values = createReviewValues(data);
const { mapApplicationToSapsTemplate } = load('src/engines/sapsFieldMappingEngine.ts');
assert.equal(mapApplicationToSapsTemplate(data, values).missingRequiredFieldCount, 0);
const nativeFetch = globalThis.fetch;
let renderedBytes;
globalThis.fetch = async (url) => {
  assert.equal(url, '/saps-templates/SAPS_517_EN_OFFICIAL.pdf');
  return new Response(readFileSync('public' + url), { headers: { 'content-type': 'application/pdf' } });
};
try {
  const bytes = await generateOfficialApplicationPdf(data, values);
  renderedBytes = bytes;
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 11);
  console.log('PASS: official SAPS 517 rendering from the unchanged pinned template');
} finally {
  globalThis.fetch = nativeFetch;
}

const currentCase = { id: 'current', client_id: 'client', application_type: 'COMPETENCY_FIRST_APPLICATION', status: 'NOT_STARTED', competency_category: 'HANDGUN', firearm_id: null, firearm_licence_id: null, competency_id: null, acquisition_source: 'NOT_APPLICABLE' };
const historicalCase = { ...currentCase, id: 'history', status: 'APPROVED' };
const identity = { id: 'identity', client_id: 'client', application_case_id: 'old-firearm-case', document_type: 'ID_COPY', document_scope: 'APPLICATION_CASE', lifecycle_status: 'ACTIVE', is_verified: true, created_at: '2026-01-01', metadata: {}, expiry_date: null, storage_path: 'original-id.pdf' };
const motivation = { ...identity, id: 'motivation', document_type: 'MOTIVATION', application_case_id: historicalCase.id, firearm_id: null, firearm_licence_id: null, storage_path: 'original-motivation.pdf' };
const client = { id: 'client', first_name: 'Example', surname: 'Applicant', id_number: data.applicant.idNumber, address_line_1: '1 Example Road', city: 'Example City', province: 'Gauteng', cellphone: data.applicant.cellphone, saps271_declarations: declarations };
const rows = { clients: [client], application_cases: [currentCase, historicalCase], documents: [identity, motivation], competencies: [], firearms: [], firearm_licences: [] };
const noWrite = () => { throw new Error('Unexpected write during acceptance regression'); };
const db = { from(table) {
  let filters = [], single = false;
  const q = {
    select() { return q; }, order() { return q; },
    eq(key, value) { filters.push((row) => row[key] === value); return q; },
    single() { single = true; return q; }, maybeSingle() { single = true; return q; },
    update: noWrite, insert: noWrite, delete: noWrite, upsert: noWrite,
    then(resolve, reject) { const selected = rows[table].filter((row) => filters.every((filter) => filter(row))); return Promise.resolve({ data: single ? selected[0] : selected, error: null }).then(resolve, reject); },
  }; return q;
} };
const serviceLoad = loader({ '../lib/supabase': { supabase: db } });
const { getClientApplicationReadiness } = serviceLoad('src/services/applicationReadinessService.ts');
const originalRows = JSON.stringify(rows);
const readiness = await getClientApplicationReadiness('client');
assert.equal(readiness.cases.length, 1, 'historical cases must not become active workspaces');
const requirement = (result, key) => result.cases[0].requirements.find((item) => item.key === key);
assert.equal(requirement(readiness, 'ID_COPY').state, 'SATISFIED');
assert.equal(requirement(readiness, 'ID_COPY').documentId, identity.id);
assert.equal(requirement(readiness, 'MOTIVATION').state, 'SATISFIED');
assert.equal(requirement(readiness, 'MOTIVATION').documentId, motivation.id);
assert.equal(JSON.stringify(rows), originalRows);
for (const change of [{ expiry_date: '2000-01-01' }, { lifecycle_status: 'ARCHIVED' }, { document_type: 'SELLER_ID_COPY' }, { client_id: 'another-client' }]) {
  rows.documents = [{ ...identity, ...change }];
  assert.notEqual(requirement(await getClientApplicationReadiness('client'), 'ID_COPY').state, 'SATISFIED');
}
rows.documents = [{ ...identity, is_verified: false }];
assert.equal(requirement(await getClientApplicationReadiness('client'), 'ID_COPY').state, 'UNVERIFIED');
for (const change of [{ application_type: 'FIREARM_LICENCE_FIRST_APPLICATION' }, { competency_category: 'SHOTGUN' }, { application_type: 'COMPETENCY_RENEWAL' }, { client_id: 'another-client' }]) {
  rows.application_cases = [currentCase, { ...historicalCase, ...change }];
  rows.documents = [identity, motivation];
  assert.equal(requirement(await getClientApplicationReadiness('client'), 'MOTIVATION').state, 'MISSING');
}
rows.application_cases = [currentCase, historicalCase];
for (const change of [{ firearm_id: 'firearm' }, { lifecycle_status: 'ARCHIVED' }, { document_type: 'SUPPORTING_DOCUMENT' }, { client_id: 'another-client' }, { application_case_id: null, document_scope: 'CLIENT', document_name: 'Handgun competency motivation' }]) {
  rows.documents = [identity, { ...motivation, ...change }];
  assert.equal(requirement(await getClientApplicationReadiness('client'), 'MOTIVATION').state, 'MISSING');
}
rows.documents = [identity, { ...motivation, is_verified: false }];
assert.equal(requirement(await getClientApplicationReadiness('client'), 'MOTIVATION').state, 'UNVERIFIED');
rows.documents = [identity, { ...motivation, expiry_date: '2000-01-01' }];
assert.equal(requirement(await getClientApplicationReadiness('client'), 'MOTIVATION').state, 'EXPIRED');
rows.documents = [identity, motivation];
console.log('PASS: read-only ID/motivation reuse; wrong owner/type/category, expired and archived sources rejected; verification preserved');
const { buildApplicationAutofillPackage } = serviceLoad('src/services/applicationAutofillService.ts');
const autofill = await buildApplicationAutofillPackage('client', currentCase.id);
assert.equal(autofill.application.formLabel, 'SAPS 517 — Application for a competency certificate');
assert.equal(autofill.application.formCode, 'SAPS_517');
assert.equal(autofill.competency.category, 'HANDGUN');
assert.equal(autofill.canGenerate, true);
console.log('PASS: SAPS 517 label encoding, form choice, category and AutoFill readiness');

const uiMocks = {
  '../lib/supabase': { supabase: db },
  'react-native': nativeMock,
  'lucide-react-native': new Proxy({}, { get: (_, key) => String(key) }),
  '../components/Button': 'Button', '../components/Card': 'Card', '../components/Screen': 'Screen', '../components/TextField': 'TextField',
  '../components/intelligence/ReadOnlyIntelligencePanel': 'IntelligencePanel',
  '../context/AuthContext': { useAuth: () => ({ dealerProfile: { dealerId: 'dealer' }, user: { id: 'user' } }) },
  '../services/applicationCaseService': { updateApplicationSupplierDetails: noWrite, getApplicationCase: async () => currentCase },
  '../services/applicationOrchestratorService': { orchestrateApplicationPack: noWrite },
  '../services/applicationWorkspaceService': { getApplicationWorkspaceMeta: async () => ({ id: 'current', status: 'NOT_STARTED', progressPercent: 0, updatedAt: '2026-09-01' }), listApplicationWorkspaceEvents: async () => [], saveApplicationDraft: noWrite, recordApplicationWorkspaceEvent: noWrite },
};
const navigation = { addListener: () => () => {}, navigate: () => {} };
const route = { params: { clientId: 'client', applicationCaseId: 'current' } };
for (const mode of ['success', 'popup-blocked', 'render-error']) {
  const harness = hookHarness(), alerts = [], downloads = [], timers = [];
  let attached = false;
  const popup = { opener: {}, document: {}, location: {}, closed: false, close() { this.closed = true; } };
  globalThis.window = {
    open: () => mode === 'popup-blocked' ? null : popup,
    document: {
      body: { appendChild() { attached = true; } },
      createElement: () => ({ style: {}, click() { assert.equal(attached, true); downloads.push({ href: this.href, name: this.download }); }, remove() { attached = false; } }),
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
  };
  const screenLoad = loader({ ...uiMocks, react: harness.react,
    '../utils/userAlert': { userAlert: { alert: (...args) => alerts.push(args) } },
    '../services/applicationAutofillService': { buildApplicationAutofillPackage: async () => data },
    '../services/generatedApplicationDocumentService': {
      createReviewValues, generateOfficialApplicationPdf: async () => { if (mode === 'render-error') throw new Error('Template load failed'); return renderedBytes; },
      archiveOfficialApplicationPdf: noWrite, archiveCompletedApplication: noWrite,
    },
  });
  harness.mount(screenLoad('src/screens/ApplicationAutofillScreen.tsx').default, { navigation, route });
  await harness.settle();
  const button = nodes(harness.tree).find((node) => node.props?.title === 'Generate official PDF');
  assert.equal(button.props.disabled, false);
  button.props.onPress();
  await harness.settle();
  if (mode === 'render-error') {
    assert.equal(downloads.length, 0);
    assert.equal(popup.closed, true);
    assert.ok(alerts.some((args) => args[1] === 'Template load failed'));
    assert.ok(nodes(harness.tree).some((node) => node.props?.accessibilityRole === 'alert' && node.props.children === 'Template load failed'));
  } else {
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].name, 'SAPS_517_Applicant.pdf');
    const response = await nativeFetch(downloads[0].href);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), renderedBytes);
    assert.ok(nodes(harness.tree).some((node) => node.props?.title === 'Open generated PDF'));
    assert.ok(nodes(harness.tree).some((node) => node.props?.title === 'Download generated PDF'));
    if (mode === 'success') assert.match(popup.location.href, /^blob:/);
    assert.ok(timers.every((timer) => timer.ms >= 60_000));
    assert.equal(alerts.length, 0);
  }
  harness.unmount();
  timers.forEach((timer) => timer.fn());
  delete globalThis.window;
}
console.log('PASS: Generate button delivers real PDF bytes, opens viewer, retains controls when popups are blocked, and visibly reports errors; no archive/write');

for (const applicationType of ['COMPETENCY_FIRST_APPLICATION', 'COMPETENCY_ADDITIONAL_CATEGORY', 'COMPETENCY_RENEWAL', 'COMPETENCY_REAPPLICATION', 'FIREARM_LICENCE_FIRST_APPLICATION']) {
  const harness = hookHarness();
  const workspaceReadiness = { ...readiness, cases: [{ ...readiness.cases[0], applicationType }] };
  const screenLoad = loader({ ...uiMocks, react: harness.react,
    '../utils/userAlert': { userAlert: { alert: (...args) => { throw new Error(args.join(': ')); } } },
    '../services/applicationReadinessService': { getClientApplicationReadiness: async () => workspaceReadiness },
    '../services/documentService': { ...serviceLoad('src/services/documentService.ts'), listClientDocuments: async () => rows.documents },
    '../services/applicationDocumentSuggestionService': { suggestApplicationDocuments: async () => ({ suggestions: [] }) },
  });
  harness.mount(screenLoad('src/screens/ApplicationReadinessScreen.tsx').default, { navigation, route });
  await harness.settle();
  const workflowCard = nodes(harness.tree).find((node) => node.props?.title === 'Guided application workflow');
  assert.ok(workflowCard);
  const labels = nodes(workflowCard).map((node) => node.props?.children).filter((value) => typeof value === 'string');
  assert.equal(labels.includes('Firearm'), applicationType.startsWith('FIREARM_'));
  harness.unmount();
}
console.log('PASS: competency workflows omit firearm step; firearm applications retain it');

const packLoad = loader({ '../lib/supabase': { supabase: db },
  '../engines/docxPdfRenderer': {},
  './applicationReadinessService': { getClientApplicationReadiness: async () => readiness },
  './applicationCaseService': { getApplicationCase: async () => currentCase },
  './clientService': { getClient: async () => client },
  './documentService': { ...serviceLoad('src/services/documentService.ts'), listClientDocuments: async () => rows.documents },
});
const manifest = await packLoad('src/services/applicationPackService.ts').buildApplicationPackManifest('client', 'current');
assert.equal(manifest.items.find((item) => item.key === 'ID_COPY').document.id, identity.id);
assert.equal(manifest.items.find((item) => item.key === 'MOTIVATION').document.id, motivation.id);
assert.equal(JSON.stringify(rows), originalRows);
console.log('PASS: pack selection uses the same existing ID and motivation sources without copying or mutating them');
