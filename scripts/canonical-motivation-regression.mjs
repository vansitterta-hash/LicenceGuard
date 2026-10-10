// Synthetic local fixtures exercise implementation only; never physical acceptance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { PDFDocument } from 'pdf-lib';
import { loader, hookHarness, nodes, nativeMock } from './beta-test-support.mjs';

const master = new Uint8Array(readFileSync('docs/LicenceGuard-Master-Motivation-Canonical.docx'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedHash = 'd87785faa295333f7b1b9bbc4b0107effe54759160d71cb28ce77665c26c0bb2';
assert.equal(hash(master), expectedHash);
assert.equal(hash(readFileSync('public/templates/LicenceGuard-Master-Motivation-Canonical.docx')), expectedHash);
const engine = loader()('src/engines/canonicalMotivationEngine.ts');
const state = loader()('src/utils/motivationGeneratedState.ts');
const identity = { userId: 'owner', dealerId: 'dealer', clientId: 'client', applicationCaseId: 'case' };
const privacy = { dealer_id: 'dealer', owner_user_id: 'owner', record_scope: 'PRIVATE' };
const client = { ...privacy, id: 'client', first_name: 'Test', surname: 'Applicant', id_number: '0000000000000', address_line_1: 'Test street', city: 'Test town', saps271_declarations: {
  answers: { convictions: { answer: 'NO' }, unfitness: { answer: 'NO' } }, confirmedAt: '2026-10-10',
  saps517: { citizenshipChoice: 'SA_CITIZEN', accreditedTrainingCertificate: { answer: 'YES', institution: 'Test training provider' } },
  applications: { case: { prescribedSafe: 'YES', safeMounted: 'YES', safeMountings: ['WALL', 'FLOOR'], saps271Firearm: { firearmId: 'firearm', receiverSerial: '1165306', action: 'MANUAL' } } },
} };
const application = { ...privacy, id: 'case', client_id: 'client', firearm_id: 'firearm', competency_id: 'competency', firearm_licence_id: null, application_type: 'FIREARM_LICENCE_ADDITIONAL_APPLICATION', licence_section: '16', primary_purpose: 'Dedicated sport shooting', sport_discipline: 'Trap', sport_association: 'Test association', motivation_summary: 'I intend to participate in my recorded trap discipline.' };
const firearm = { ...privacy, id: 'firearm', client_id: 'client', is_active: true, make: 'CZ', model: 'Test model', calibre: '12 BR SHOTGUN', serial_number: '1165306', firearm_type: 'SHOTGUN', required_competency: 'SHOTGUN' };
const competency = { ...privacy, id: 'competency', client_id: 'client', category: 'SHOTGUN', certificate_number: 'TEST-COMP', verified: true, expiry_date: '2099-12-31' };
const evidence = (id, type, extra = {}) => ({ ...privacy, id, client_id: 'client', firearm_id: null, application_case_id: 'case', competency_id: null, firearm_licence_id: null, document_name: id, document_type: type, metadata: {}, file_name: id + '.pdf', mime_type: 'application/pdf', storage_path: 'dealer/client/' + id + '.pdf', lifecycle_status: 'ACTIVE', is_verified: true, version_number: 1, created_at: '2026-10-10T00:00:00Z', ...extra });
const documents = [evidence('id-proof', 'ID_COPY'), evidence('membership', 'MEMBERSHIP_CERTIFICATE'), evidence('dedicated', 'DEDICATED_STATUS'), evidence('unverified', 'SUPPORTING_DOCUMENT', { is_verified: false }), evidence('official-form', 'FIREARM_LICENCE_APPLICATION_FORM'), evidence('foreign', 'SUPPORTING_DOCUMENT', { firearm_id: 'different-firearm' }), evidence('research', 'SUPPORTING_RESEARCH', { firearm_id: 'firearm', is_verified: false, metadata: { researchSources: [{ id: 'source', title: 'Test manufacturer specification', publisher: 'Test manufacturer', url: 'https://example.test/cz', summary: 'A source-supported test characteristic.' }] } })];
const sources = { client, application, firearm, competency, documents };
const review = engine.defaultMotivationReview(sources);
review.background = 'Applicant-supplied test background.';
review.assertions = Object.fromEntries(Object.keys(engine.MASTER_ASSERTIONS).map(key => [key, true]));
assert.deepEqual(engine.motivationReleaseIssues(sources, review), []);
assert.deepEqual(review.evidenceIds, ['dedicated', 'id-proof', 'membership']);
const xmlOf = async bytes => (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
const textOf = async bytes => new DOMParser().parseFromString(await xmlOf(bytes), 'application/xml').documentElement.textContent;
const generated = await engine.populateCanonicalMotivation(master, sources, review, '2026-10-10');
const text = await textOf(generated);
for (const term of ['Test Applicant', 'CZ', '12 BR SHOTGUN', 'RECEIVER serial: 1165306', 'Section 16', 'Dedicated sport shooting', 'Applicant-supplied test background.', 'Annexure A', 'Annexure B', 'Annexure C']) assert.ok(text.includes(term), term);
assert.doesNotMatch(text, /8x68S|Mauser|34853|COLLECTOR|Section 17|collecting theme/i);
assert.doesNotMatch(text, /source-supported test characteristic/);
assert.match(text, /Annexure A: dedicated/); assert.match(text, /Annexure B: id-proof/); assert.match(text, /Annexure C: membership/);
assert.match(text, /Verified identity supporting document: Annexure B/);
const originalZip = await JSZip.loadAsync(master), outputZip = await JSZip.loadAsync(generated);
for (const [name, entry] of Object.entries(originalZip.files)) if (!entry.dir && name !== 'word/document.xml') assert.deepEqual(await outputZip.file(name).async('uint8array'), await entry.async('uint8array'), name + ' preserved');
const indexDoc = new DOMParser().parseFromString(await xmlOf(generated), 'application/xml');
const indexRows = Array.from(indexDoc.getElementsByTagName('w:tbl')[0].getElementsByTagName('w:tr')).slice(1);
for (const row of indexRows) assert.equal(row.getElementsByTagName('w:tc')[2].textContent, '', 'No invented index page numbers');

for (const section of ['13', '15', '16', '17']) {
  const s = structuredClone(sources); s.application.licence_section = section; s.application.primary_purpose = `Applicant-selected purpose ${section}`;
  const r = engine.defaultMotivationReview(s); r.background = review.background;
  const output = await textOf(await engine.populateCanonicalMotivation(master, s, r, '2026-10-10'));
  assert.match(output, new RegExp(`Section ${section} Licence`)); assert.ok(output.includes(`Applicant-selected purpose ${section}`));
  assert.equal(output.includes('COLLECTOR-SPECIFIC MOTIVATION'), section === '17');
  if (section === '17') { assert.match(output, /REQUIRES CONFIRMATION/); assert.doesNotMatch(output, /Rarity \/ Scarcity|Investment Significance/); }
}
const unknown = structuredClone(sources); unknown.client.saps271_declarations = null;
const unknownReview = engine.defaultMotivationReview(unknown);
const unknownText = await textOf(await engine.populateCanonicalMotivation(master, unknown, unknownReview, '2026-10-10'));
const unknownParagraphs = new DOMParser().parseFromString(await xmlOf(await engine.populateCanonicalMotivation(master, unknown, unknownReview, '2026-10-10')), 'application/xml').getElementsByTagName('w:p');
assert.equal(Array.from(unknownParagraphs).some(p => /^(I have no criminal record|I am not inclined to violence|I am a mentally stable person)/.test(p.textContent)), false);
assert.match(unknownText, /APPLICANT CONFIRMATION REQUIRED/);
assert.ok(engine.motivationReleaseIssues(unknown, unknownReview).length > 0);
const changedFirearmAnswers = structuredClone(sources);
changedFirearmAnswers.client.saps271_declarations.applications.case.saps271Firearm = { firearmId: 'old-firearm', receiverSerial: '34853', barrelSerial: 'OLD-BARREL', action: 'AUTOMATIC' };
const changedFirearmText = await textOf(await engine.populateCanonicalMotivation(master, changedFirearmAnswers, review, '2026-10-10'));
assert.doesNotMatch(changedFirearmText, /34853|OLD-BARREL/);
assert.ok(engine.motivationReleaseIssues(changedFirearmAnswers, review).some(issue => issue.includes('serial component')));
await assert.rejects(engine.populateCanonicalMotivation(new Uint8Array([1, 2]), sources, review, '2026-10-10'), /Master changed/);
assert.throws(() => engine.motivationAnnexures(sources, { ...review, evidenceIds: ['unverified'] }), /verified supporting/);
assert.throws(() => engine.motivationAnnexures(sources, { ...review, evidenceIds: ['official-form'] }), /verified supporting/);
assert.throws(() => engine.motivationAnnexures(sources, { ...review, evidenceIds: ['foreign'] }), /verified supporting/);
const claim = { documentId: 'research', sourceId: 'source', text: 'A source-supported test characteristic.', section: 'Firearm relevance', reviewed: true };
claim.sourceSnapshot = state.stableMotivationJson(engine.motivationResearchSources(sources)[0]);
const researched = { ...review, claims: [claim] };
assert.match(await textOf(await engine.populateCanonicalMotivation(master, sources, researched, '2026-10-10')), /source-supported test characteristic.*Test manufacturer specification/s);
assert.throws(() => engine.reviewedMotivationClaims(sources, { ...review, claims: [{ ...claim, sourceId: 'invented' }] }), /Research source/);
assert.throws(() => engine.reviewedMotivationClaims(sources, { ...review, claims: [{ ...claim, section: 'Rarity / Scarcity' }] }), /non-Section-17/);
const changedResearch = structuredClone(sources); changedResearch.documents.at(-1).metadata.researchSources[0].summary = 'Changed source excerpt';
assert.throws(() => engine.reviewedMotivationClaims(changedResearch, researched), /Review the original source again/);
const oldContext = structuredClone(sources); oldContext.documents.at(-1).metadata.researchContext = { firearm: { make: 'Mauser', calibre: '8x68S' } };
assert.equal(engine.motivationResearchSources(oldContext).length, 0, 'research from old firearm context is excluded');
const collectorSources = structuredClone(sources); collectorSources.application.licence_section = '17'; collectorSources.application.primary_purpose = 'Private collection';
collectorSources.documents.push(evidence('association-approval', 'ENDORSEMENT'), evidence('actual-photograph', 'SUPPORTING_DOCUMENT'));
const collectorReview = engine.defaultMotivationReview(collectorSources);
Object.assign(collectorReview, { background: review.background, narrative: 'Applicant explanation of approved collection fit.', assertions: review.assertions, claims: [{ ...claim, section: 'Historical Value' }] });
Object.assign(collectorReview.collector, { category: 'Applicant-confirmed test category', field: 'Documented test collecting field', theme: 'Documented test theme', membership: 'Applicant-confirmed test standing', approvalDocumentId: 'association-approval', photographDocumentId: 'actual-photograph', themeFit: 'Applicant-confirmed test theme fit', points: 'Applicant-confirmed specific observations', regulation15: 'Applicant-reviewed applicability and independent requirements; test only.', confirmed: true, legalReviewed: true });
assert.deepEqual(engine.motivationReleaseIssues(collectorSources, collectorReview), []);
const collectorText = await textOf(await engine.populateCanonicalMotivation(master, collectorSources, collectorReview, '2026-10-10'));
assert.match(collectorText, /Independent association-issued approval: Annexure/);
assert.match(collectorText, /Documented test theme/); assert.match(collectorText, /Historical Value/);
assert.doesNotMatch(collectorText, /Rarity \/ Scarcity|Investment Significance|Annexure [A-Z]: dedicated/);
const snapshot = engine.motivationSourceSnapshot(sources, review);
for (const change of [s => { s.firearm.serial_number = 'changed'; }, s => { s.application.primary_purpose = 'changed'; }, s => { s.documents[0].storage_path = 'changed'; }, s => { s.client.first_name = 'changed'; }]) {
  const s = structuredClone(sources); change(s); assert.notEqual(engine.motivationSourceSnapshot(s, review), snapshot);
}

// Exercise the real registration helper and Motivation lifecycle against an offline RLS model.
const tables = { clients: [structuredClone(client)], application_cases: [structuredClone(application)], firearms: [structuredClone(firearm)], firearm_licences: [], competencies: [structuredClone(competency)], documents: structuredClone(documents) };
const storedFiles = new Map(); let currentUser = 'owner', seq = 0;
// Explicit offline RLS grants model already-authorized legacy records. NULL
// ownership alone never makes a row visible to the authenticated caller.
const legacySourceGrants = new Set();
const smallPdf = await PDFDocument.create(); smallPdf.addPage(); const pdfBytes = await smallPdf.save();
for (const d of documents) storedFiles.set(d.storage_path, pdfBytes);
const db = {
  auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } }, error: null }) },
  from(table) {
    const filters = []; let payload, mode = 'select', single = false, returning = false;
    const q = {
      select() { if (mode === 'insert') returning = true; return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      order() { return q; },
      single() { single = true; return q; },
      insert(value) { payload = value; mode = 'insert'; return q; },
      update(value) { payload = value; mode = 'update'; return q; },
      async then(resolve) {
        const visible = tables[table].filter(row => (row.owner_user_id === currentUser || legacySourceGrants.has(`${currentUser}:${table}:${row.id}`)) && filters.every(f => f(row)));
        if (mode === 'insert') {
          assert.equal(returning, false, 'secure registration avoids INSERT RETURNING');
          if (payload.owner_user_id !== currentUser || payload.record_scope !== 'PRIVATE') return resolve({ error: { message: 'RLS' } });
          tables[table].push({ id: `generated-${++seq}`, created_at: new Date().toISOString(), ...structuredClone(payload) });
        } else if (mode === 'update') visible.forEach(row => Object.assign(row, structuredClone(payload)));
        return resolve({ data: single ? visible[0] : visible, error: null });
      },
    }; return q;
  },
  storage: { from: () => ({ upload: async (path, blob) => { assert.equal(storedFiles.has(path), false); storedFiles.set(path, new Uint8Array(await blob.arrayBuffer())); return { error: null }; }, remove: async paths => { paths.forEach(path => storedFiles.delete(path)); return { error: null }; }, createSignedUrl: async path => ({ data: { signedUrl: 'mock:' + path }, error: null }) }) },
};
let renderedDocx;
const load = loader({ '../lib/supabase': { supabase: db }, '../engines/docxPdfRenderer': { renderDocxAsPdf: async bytes => { renderedDocx = bytes; return pdfBytes; } } });
const service = load('src/services/motivationService.ts');
const readinessService = loader({ '../lib/supabase': { supabase: db }, './motivationService': service })('src/services/applicationReadinessService.ts');
const motivationRequirement = async () => (await readinessService.getClientApplicationReadiness('client')).cases[0].requirements.find(r => r.documentType === 'MOTIVATION');
service.assertMotivationLinkage(sources, identity);
for (const change of [s => { s.application.client_id = 'foreign'; }, s => { s.firearm.client_id = 'foreign'; }, s => { s.firearm.owner_user_id = 'other'; }, s => { s.competency.id = 'foreign'; }]) { const s = structuredClone(sources); change(s); assert.throws(() => service.assertMotivationLinkage(s, identity), /inconsistent|owner/); }
const originalFetch = globalThis.fetch;

// Reproduce physical defect 01: RLS-visible PRIVATE client/firearm with NULL owners.
tables.clients[0].owner_user_id = null; tables.firearms[0].owner_user_id = null;
legacySourceGrants.add('owner:clients:client'); legacySourceGrants.add('owner:firearms:firearm');
const legacySources = await service.loadMotivationSources(identity);
assert.equal(legacySources.client.owner_user_id, null);
assert.equal(legacySources.firearm.owner_user_id, null);
assert.equal((await service.getMotivationWorkspace(identity)).state, 'NOT_GENERATED');
for (const key of ['owner:clients:client', 'owner:firearms:firearm']) {
  legacySourceGrants.delete(key);
  await assert.rejects(service.loadMotivationSources(identity), /authorized Motivation source/);
  legacySourceGrants.add(key);
}
for (const [record, field, value] of [
  [tables.clients[0], 'dealer_id', 'foreign'],
  [tables.firearms[0], 'client_id', 'foreign'],
  [tables.firearms[0], 'dealer_id', 'foreign'],
  [tables.firearms[0], 'is_active', false],
  [tables.clients[0], 'record_scope', 'SHARED'],
]) {
  const before = record[field]; record[field] = value;
  await assert.rejects(service.loadMotivationSources(identity), /authorized Motivation source/);
  record[field] = before;
}
currentUser = 'other';
await assert.rejects(service.loadMotivationSources(identity), /Sign in/);
await assert.rejects(service.loadMotivationSources({ ...identity, userId: 'other' }), /authorized application/);
currentUser = 'owner';
const savedCompetencies = tables.competencies, savedDocuments = tables.documents;
tables.competencies = []; tables.documents = [];
const missingOptional = await service.loadMotivationSources(identity);
assert.equal(missingOptional.competency, null); assert.deepEqual(missingOptional.documents, []);
assert.ok(engine.motivationReleaseIssues(missingOptional, engine.defaultMotivationReview(missingOptional)).length > 0);
tables.competencies = savedCompetencies; tables.documents = savedDocuments;
// Keep legacy ownership through the lifecycle below: outputs must still be owner-private.
globalThis.fetch = async url => String(url).startsWith('/templates/') ? new Response(master) : String(url).startsWith('mock:') && storedFiles.has(String(url).slice(5)) ? new Response(storedFiles.get(String(url).slice(5))) : new Response('', { status: 404 });
try {
  const first = await service.generateMotivation(identity, review);
  assert.equal(first.owner_user_id, 'owner'); assert.equal(first.record_scope, 'PRIVATE'); assert.equal(first.application_case_id, 'case'); assert.equal(first.firearm_id, 'firearm');
  assert.equal(first.is_verified, false); assert.equal(first.version_number, 1); assert.equal(first.metadata.motivationSourceSnapshot, snapshot);
  assert.doesNotMatch(await textOf(renderedDocx), /8x68S|Mauser|34853/);
  assert.equal((await PDFDocument.load(storedFiles.get(first.storage_path))).getPageCount(), 7, '3 actual annexures with marker pages embedded');
  await assert.rejects(service.confirmMotivation(identity, first.id), /Review and regenerate/);
  await service.markMotivationReviewed(identity, first.id); await service.confirmMotivation(identity, first.id);
  await service.assertCurrentMotivationReleased(identity, first.id);
  assert.equal((await motivationRequirement()).documentId, first.id);
  assert.equal((await motivationRequirement()).state, 'SATISFIED');
  tables.application_cases[0].primary_purpose = 'Corrected dedicated sport purpose';
  assert.equal((await service.getMotivationWorkspace(identity)).state, 'OUTDATED');
  assert.equal((await motivationRequirement()).state, 'PENDING_GENERATION');
  await assert.rejects(service.assertCurrentMotivationReleased(identity, first.id), /current Motivation/);
  await assert.rejects(service.confirmMotivation(identity, first.id), /Review and regenerate/);
  const corrected = { ...review, narrative: 'Corrected applicant explanation.' };
  const second = await service.generateMotivation(identity, corrected);
  assert.equal(second.version_number, 2); assert.equal(second.parent_document_id, first.id); assert.equal(second.is_verified, false);
  assert.ok(tables.documents.some(d => d.id === first.id)); assert.ok(storedFiles.has(first.storage_path), 'history PDF retained');
  assert.equal(state.currentMotivation(tables.documents, 'case').id, second.id, 'older verified version never wins');
  assert.equal((await motivationRequirement()).documentId, second.id);
  assert.equal((await motivationRequirement()).state, 'UNVERIFIED');
  await assert.rejects(service.assertCurrentMotivationReleased(identity, first.id), /current Motivation/);
  await assert.rejects(service.assertCurrentMotivationReleased(identity, second.id), /current Motivation/);
  await service.markMotivationReviewed(identity, second.id); await service.confirmMotivation(identity, second.id);
  await service.assertCurrentMotivationReleased(identity, second.id);
  await assert.rejects(load('src/services/documentService.ts').setDocumentVerified(second.id, true, 'owner'), /application workspace/, 'generic verification cannot bypass Motivation review');
  // Execute pack selection/assembly with the actual Motivation release guards.
  let packMotivationId = second.id;
  const packService = loader({
    '../lib/supabase': { supabase: db },
    './applicationCaseService': { getApplicationCase: async () => ({ ...tables.application_cases[0], subjectDescription: 'CZ test shotgun' }) },
    './clientService': { getClient: async () => tables.clients[0] },
    './applicationReadinessService': { getClientApplicationReadiness: async () => ({ cases: [{ caseId: 'case', state: 'READY', score: 100, requirements: [{ key: 'MOTIVATION', documentType: 'MOTIVATION', documentId: packMotivationId, label: 'Motivation', required: true, state: 'SATISFIED', delivery: 'DIGITAL' }] }] }) },
    './documentService': { listClientDocuments: async () => tables.documents, documentReferencesApplicationCase: (d, id) => d.application_case_id === id, createDocumentSignedUrl: async path => 'mock:' + path },
    './motivationService': service,
  })('src/services/applicationPackService.ts');
  const manifest = await packService.buildApplicationPackManifest('client', 'case');
  assert.equal(manifest.items[0].document.id, second.id);
  const pack = await packService.generateAndArchiveApplicationPack(identity);
  assert.ok(pack.includedDocumentIds.includes(second.id)); assert.ok(!pack.includedDocumentIds.includes(first.id));
  packMotivationId = first.id;
  await assert.rejects(packService.generateAndArchiveApplicationPack(identity), /current Motivation/);
  packMotivationId = second.id;
  const beforeConcurrentPack = tables.documents.length;
  const priorPurpose = tables.application_cases[0].primary_purpose;
  const fetchBeforeRace = globalThis.fetch;
  globalThis.fetch = async url => {
    const result = await fetchBeforeRace(url);
    if (String(url) === 'mock:' + second.storage_path) tables.application_cases[0].primary_purpose = 'Changed while assembling the pack';
    return result;
  };
  await assert.rejects(packService.generateAndArchiveApplicationPack(identity), /current Motivation/, 'freshness rechecked after merge');
  assert.equal(tables.documents.length, beforeConcurrentPack, 'stale merged pack is not registered');
  globalThis.fetch = fetchBeforeRace; tables.application_cases[0].primary_purpose = priorPurpose;
  await service.saveMotivationCorrections(identity, second.id, { ...corrected, background: 'Changed background.' });
  assert.equal((await service.getMotivationWorkspace(identity)).state, 'OUTDATED');
  await assert.rejects(service.confirmMotivation(identity, second.id), /Review and regenerate/);
  await assert.rejects(packService.generateAndArchiveApplicationPack(identity), /current Motivation/);
  tables.documents.find(d => d.id === second.id).lifecycle_status = 'ARCHIVED';
  assert.equal(state.currentMotivation(tables.documents, 'case'), undefined, 'archiving latest cannot resurrect previous approval');
  await assert.rejects(service.assertCurrentMotivationReleased(identity, first.id), /current Motivation/);
  const third = await service.generateMotivation(identity, corrected);
  assert.equal(third.version_number, 3); assert.equal(third.parent_document_id, second.id);
  currentUser = 'other'; await assert.rejects(service.loadMotivationSources(identity), /owner/);
  await assert.rejects(service.loadMotivationSources({ ...identity, userId: 'other' }), /authorized application/); currentUser = 'owner';
  storedFiles.delete('dealer/client/id-proof.pdf');
  await assert.rejects(service.generateMotivation(identity, review), /unavailable/);
} finally { globalThis.fetch = originalFetch; }

// Bounded UI flow: preview + explicit confirmation, edits force regeneration.
const harness = hookHarness(); let uiGenerated = 0, uiConfirmed = 0, uiPreviewed = 0;
let uiWorkspace = { sources, review: structuredClone(review), current: evidence('ui-current', 'MOTIVATION', { version_number: 1 }), state: 'AWAITING_REVIEW', issues: [], history: [] };
const panel = loader({
  react: harness.react, 'react-native': nativeMock,
  '../Button': { default: 'Button', __esModule: true }, '../Card': { default: 'Card', __esModule: true }, '../TextField': { default: 'TextField', __esModule: true },
  '../../utils/userAlert': { userAlert: { alert: (_title, message) => { throw new Error(message); } } },
  '../../utils/openExternalDocument': { openExternalDocument: async resolve => { await resolve(); uiPreviewed++; } },
  '../../services/documentService': { createDocumentSignedUrl: async () => 'mock:preview' },
  '../../services/motivationService': {
    getMotivationWorkspace: async () => structuredClone(uiWorkspace),
    markMotivationReviewed: async () => {},
    generateMotivation: async (_id, r) => { uiGenerated++; uiWorkspace = { ...uiWorkspace, review: structuredClone(r), state: 'AWAITING_REVIEW', current: { ...uiWorkspace.current, version_number: 2 } }; },
    saveMotivationCorrections: async (_id, _doc, r) => { uiWorkspace = { ...uiWorkspace, review: structuredClone(r), state: 'OUTDATED' }; },
    confirmMotivation: async () => { uiConfirmed++; uiWorkspace = { ...uiWorkspace, state: 'CONFIRMED' }; },
    assertCurrentMotivationReleased: async () => {},
  },
})('src/components/application/MotivationReviewPanel.tsx').default;
harness.mount(panel, { identity, onChanged: async () => {} }); await harness.settle();
const button = title => nodes(harness.tree).find(n => n.type === 'Button' && n.props.title === title);
assert.equal(button('Confirm current Motivation').props.disabled, true);
button('Open generated Motivation for review').props.onPress(); await harness.settle(); assert.equal(uiPreviewed, 1);
const confirmation = nodes(harness.tree).find(n => n.type === 'Button' && n.props.title.startsWith('I reviewed this generated version'));
confirmation.props.onPress(); await harness.settle(); assert.equal(button('Confirm current Motivation').props.disabled, false);
button('Confirm current Motivation').props.onPress(); await harness.settle(); assert.equal(uiConfirmed, 1);
assert.equal(button('Release confirmed PDF').props.disabled, false);
nodes(harness.tree).find(n => n.type === 'TextField' && n.props.label.startsWith('Application-specific')).props.onChangeText('Corrected UI narrative.'); await harness.settle();
assert.equal(button('Release confirmed PDF').props.disabled, true); assert.equal(button('Confirm current Motivation').props.disabled, true);
button('Save corrections').props.onPress(); await harness.settle(); assert.equal(button('Confirm current Motivation').props.disabled, true);
button('Regenerate Motivation from corrections').props.onPress(); await harness.settle(); assert.equal(uiGenerated, 1); assert.equal(button('Confirm current Motivation').props.disabled, true);
harness.unmount();
assert.equal(hash(readFileSync('docs/LicenceGuard-Master-Motivation-Canonical.docx')), expectedHash);
console.log('PASS: canonical integrity/format preservation, real DOCX population, all section branches, contamination, unknown declarations, reviewed-source claims, verified/embedded annexures, private registration, link guards, freshness, regenerated history, renewed confirmation and current-version release checks. Browser rendering and production acceptance remain manual.');
