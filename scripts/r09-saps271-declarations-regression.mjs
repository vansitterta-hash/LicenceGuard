import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader, hookHarness, nativeMock, nodes } from './beta-test-support.mjs';

const load = loader();
const policy = load('src/utils/saps271Declarations.ts');
const createdAt = '2026-01-01T00:00:00.000Z';
const confirmedAt = new Date(Date.now() - 1000).toISOString();
const complete = () => {
  const value = policy.emptySaps271Declarations();
  for (const question of policy.DECLARATION_QUESTIONS) value.answers[question.key].answer = 'NO';
  value.confirmedAt = confirmedAt;
  return value;
};
assert.equal(policy.declarationDataIssues(undefined).length, 6);
assert.equal(policy.saps271DeclarationFields(undefined)['applicant.declarations.convictions.answer'], '');
assert.deepEqual(policy.declarationReadinessIssues(complete(), createdAt), []);
assert.ok(policy.declarationReadinessIssues({ ...complete(), confirmedAt: null }, createdAt).length);
assert.ok(policy.declarationReadinessIssues(complete(), new Date().toISOString()).length, 'A new case needs a new review');
assert.ok(policy.declarationReadinessIssues({ ...complete(), confirmedAt: '2099-01-01' }, createdAt).length);

const yes = complete();
for (const question of policy.DECLARATION_QUESTIONS) {
  yes.answers[question.key] = { answer: 'YES', incidents: [0, 1].map((i) => Object.fromEntries(question.details.map((field) => [field, field === 'dateFrom' ? '2025-01-02' : `${question.number}-${i}-${field}`]))) };
}
assert.deepEqual(policy.declarationReadinessIssues(yes, createdAt), []);
for (const question of policy.DECLARATION_QUESTIONS) for (const field of question.details) {
  const missing = structuredClone(yes);
  missing.answers[question.key].incidents[0][field] = ' ';
  assert.ok(policy.declarationDataIssues(missing).some((issue) => issue.startsWith(`G${question.number}`)), `${question.key}.${field} must be required`);
}
const invalidDate = structuredClone(yes);
invalidDate.answers.unfitness.incidents[0].dateFrom = '2025-02-30';
assert.ok(policy.declarationDataIssues(invalidDate).length);

const writes = [];
const client = { id: 'client-test', first_name: 'Test', surname: 'Client', id_number: '8001015009087', address_line_1: '1 Test Street', city: 'Test', province: 'Gauteng' };
const applicationCase = { id: 'case-test', client_id: client.id, application_type: 'FIREARM_LICENCE_FIRST_APPLICATION', status: 'NOT_STARTED', created_at: createdAt, opened_date: '2026-01-01', competency_category: 'SHOTGUN', acquisition_source: 'NOT_APPLICABLE' };
const rows = { clients: client, application_cases: [applicationCase], competencies: [], firearms: [], firearm_licences: [], documents: [{ id: 'reusable-id', document_type: 'ID_COPY', document_scope: 'CLIENT', lifecycle_status: 'ACTIVE', is_verified: true, created_at: createdAt, metadata: {} }] };
const db = { from(table) {
  let single = false, payload;
  const q = {
    select() { return q; }, eq() { return q; }, is() { return q; }, not() { return q; }, order() { return q; },
    single() { single = true; return q; }, maybeSingle() { single = true; return q; },
    insert(value) { writes.push(['insert', table, structuredClone(value)]); payload = value; return q; },
    update(value) { writes.push(['update', table, structuredClone(value)]); payload = value; return q; },
    upsert() { writes.push(['upsert', table]); throw new Error('Unexpected upsert'); },
    delete() { writes.push(['delete', table]); throw new Error('Unexpected delete'); },
    then(resolve, reject) { let data = payload ? { ...client, ...payload } : rows[table]; if (single && Array.isArray(data)) data = data[0] ?? null; return Promise.resolve({ data, error: null }).then(resolve, reject); },
  }; return q;
} };
const serviceLoad = loader({ '../lib/supabase': { supabase: db }, '../services/safeDeletionService': {}, './documentService': { documentReferencesApplicationCase: () => false, isReusableClientIdentification: (document) => document.document_type === 'ID_COPY' && document.lifecycle_status === 'ACTIVE' } });
const clients = serviceLoad('src/services/clientService.ts');
const form = { firstName: 'Test', surname: 'Client', idNumber: client.id_number, cellphone: '', alternateCellphone: '', email: '', preferredContactChannel: 'EMAIL', addressLine1: '', addressLine2: '', suburb: '', city: '', province: '', postalCode: '', notes: '' };
await clients.updateClient(client.id, 'dealer-test', 'user-test', form);
assert.equal('saps271_declarations' in writes.at(-1)[2], false, 'Existing profile updates preserve absent declaration data');
for (const declarations of [policy.emptySaps271Declarations(), complete(), yes]) {
  const saved = await clients.updateClient(client.id, 'dealer-test', 'user-test', { ...form, saps271Declarations: declarations });
  assert.deepEqual(saved.saps271_declarations, declarations);
  assert.deepEqual(writes.at(-1)[2].saps271_declarations, declarations);
}
const newClient = await clients.createClient('dealer-test', 'user-test', { ...form, saps271Declarations: yes });
assert.deepEqual(newClient.saps271_declarations, yes);
writes.length = 0;

const readiness = serviceLoad('src/services/applicationReadinessService.ts');
const autofill = serviceLoad('src/services/applicationAutofillService.ts');
for (const declarations of [undefined, { ...complete(), confirmedAt: null }, { ...complete(), answers: { ...complete().answers, convictions: { answer: 'YES', incidents: [{}] } } }, complete(), yes]) {
  client.saps271_declarations = declarations;
  const first = await readiness.getClientApplicationReadiness(client.id);
  const second = await readiness.getClientApplicationReadiness(client.id);
  assert.deepEqual(first, second);
  const requirement = first.cases[0].requirements.find((item) => item.key === 'SAPS271_DECLARATIONS');
  assert.equal(requirement.state, policy.declarationReadinessIssues(declarations, createdAt).length ? 'MISSING' : 'SATISFIED');
  if (requirement.state === 'MISSING') assert.equal(first.cases[0].readyToGenerate, false);
  assert.ok(first.cases[0].requirements.some((item) => item.documentType === 'ID_COPY' && item.state === 'SATISFIED'), 'Reusable discovery remains intact');
  const data = await autofill.buildApplicationAutofillPackage(client.id, applicationCase.id);
  assert.deepEqual(data.saps271Declarations, declarations ?? null);
  assert.equal(data.issues.some((item) => item.key.startsWith('saps271Declaration.')), requirement.state === 'MISSING');
}
for (const type of ['COMPETENCY_FIRST_APPLICATION', 'COMPETENCY_ADDITIONAL_CATEGORY', 'COMPETENCY_RENEWAL', 'COMPETENCY_REAPPLICATION', 'FIREARM_LICENCE_RENEWAL', 'FIREARM_LICENCE_REAPPLICATION']) {
  applicationCase.application_type = type;
  client.saps271_declarations = undefined;
  const result = await readiness.getClientApplicationReadiness(client.id);
  assert.ok(!result.cases[0].requirements.some((item) => item.key === 'SAPS271_DECLARATIONS'));
  const data = await autofill.buildApplicationAutofillPackage(client.id, applicationCase.id);
  assert.ok(!data.issues.some((item) => item.key.startsWith('saps271Declaration.')));
  const sharesBackgroundQuestions = ['COMPETENCY_FIRST_APPLICATION', 'COMPETENCY_ADDITIONAL_CATEGORY', 'COMPETENCY_REAPPLICATION'].includes(type);
  assert.equal(data.issues.some((item) => item.key.startsWith('backgroundQuestionnaire.')), sharesBackgroundQuestions);
  assert.equal(data.saps271Declarations, sharesBackgroundQuestions ? null : undefined);
}
assert.deepEqual(writes, [], 'Readiness and AutoFill perform zero writes');

applicationCase.application_type = 'FIREARM_LICENCE_FIRST_APPLICATION';
client.saps271_declarations = yes;
const data = await autofill.buildApplicationAutofillPackage(client.id, applicationCase.id);
const mapping = load('src/engines/sapsFieldMappingEngine.ts');
const review = Object.fromEntries(['licenceSection', 'firstName', 'surname', 'idNumber', 'residentialAddress', 'suburb', 'city', 'province', 'postalCode', 'cellphone', 'alternateCellphone', 'email', 'firearmMake', 'firearmModel', 'calibre', 'serialNumber', 'licenceNumber', 'competencyCategory', 'competencyCertificateNumber', 'supplierName', 'supplierIdOrRegistration', 'supplierContact', 'supplierLicenceNumber', 'saleOrInvoiceReference', 'policeStation', 'applicationReference', 'motivationSummary'].map((key) => [key, '']));
const mapped = mapping.mapApplicationToSapsTemplate(data, review).sections.flatMap((section) => section.fields);
for (const [key, value] of Object.entries(policy.saps271DeclarationFields(yes))) assert.equal(mapped.find((field) => field.key === key)?.value, value);
const layouts = load('src/data/documentLayoutDefinitions.ts').DOCUMENT_LAYOUT_DEFINITIONS;
assert.equal(layouts.find((layout) => layout.templateCode === 'SAPS_271').pageCount, 12);
for (const layout of layouts) {
  const sharesBackgroundQuestions = ['SAPS_271', 'SAPS_517', 'SAPS_517_A'].includes(layout.templateCode);
  assert.equal(layout.elements.some((element) => element.fieldId.startsWith('applicant.declarations.')), sharesBackgroundQuestions);
}

const draws = [];
const pdfLibMock = { PDFDocument: { async load() { return {
  async embedFont() { return { widthOfTextAtSize: (value) => value.length * 4 }; },
  getPages() { return Array.from({ length: 12 }, (_, page) => ({ drawText(value, options) { draws.push({ page: page + 1, value, ...options }); } })); },
  setTitle() {}, setAuthor() {}, setSubject() {}, setProducer() {}, async save() { return new Uint8Array([1]); },
}; } }, StandardFonts: { Helvetica: 'Helvetica' }, rgb: () => 0 };
const renderer = loader({ 'pdf-lib': pdfLibMock, 'pdf-lib/cjs/index.js': pdfLibMock })('src/engines/pdfTemplateRenderer.ts');
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
try {
  for (const declarations of [undefined, complete(), yes]) {
    draws.length = 0;
    await renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_271' }, context: { data: { ...data, saps271Declarations: declarations }, reviewValues: review } });
    const marks = draws.filter((draw) => draw.page === 8 && draw.value === 'X');
    assert.equal(marks.length, declarations ? 6 : 0);
    if (declarations) assert.ok(marks.every((mark) => mark.x === (declarations === yes ? 128 : 224)));
    if (declarations === yes) assert.ok(draws.some((draw) => draw.page === 9 && draw.value === '67-1-caseNumber'));
    else assert.ok(!draws.some((draw) => draw.page === 9));
  }
  const long = structuredClone(yes);
  long.answers.convictions.incidents[0].caseNumber = 'x'.repeat(200);
  await assert.rejects(() => renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_271' }, context: { data: { ...data, saps271Declarations: long }, reviewValues: review } }), /cannot be truncated/);
} finally { globalThis.fetch = previousFetch; }

const harness = hookHarness();
let edited = complete();
const componentLoad = loader({ react: harness.react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, 'react-native': nativeMock, '../Card': { default: 'Card' }, '../Button': { default: 'Button' }, '../TextField': { default: 'TextField' } });
const Section = componentLoad('src/components/client/Saps271DeclarationsSection.tsx').default;
harness.mount(() => Section({ value: edited, onChange: (value) => { edited = value; harness.invalidate(); } }), {});
await harness.settle();
nodes(harness.tree).find((node) => node.props?.title === 'Review declarations').props.onPress();
await harness.settle();
nodes(harness.tree).find((node) => node.props?.accessibilityRole === 'radio').props.onPress();
await harness.settle();
assert.equal(edited.answers.convictions.answer, 'NOT_ANSWERED');
assert.equal(edited.confirmedAt, null);
assert.equal(nodes(harness.tree).find((node) => node.props?.title === 'Confirm declarations reviewed now').props.disabled, true);
const sql = readFileSync('supabase/migrations/20260913_client_saps271_declarations.sql', 'utf8');
assert.match(sql, /add column if not exists saps271_declarations jsonb/);
assert.doesNotMatch(sql, /\b(update|delete|insert|create policy|drop policy)\b/i);
console.log('R09 passed: existing profiles, persistence, tri-state answers, YES details, confirmation/new-case review, SAPS 271 mappings and checkbox rendering, overflow blocking, zero-write readiness, reusable documents, and unrelated application types.');
