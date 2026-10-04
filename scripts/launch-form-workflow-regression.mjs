import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader, hookHarness, nodes, nativeMock } from './beta-test-support.mjs';
import { complete517Profile } from './saps517-test-fixture.mjs';

// Synthetic, RLS-shaped storage only. No credentials or live data.
const clone = value => structuredClone(value);
const profile = complete517Profile();
profile.confirmedAt = new Date().toISOString();
const client = { id: 'client', dealer_id: 'dealer', owner_user_id: 'owner', first_name: 'Test', surname: 'Applicant', id_number: '8001015009087', cellphone: '0123456789', address_line_1: '1 Test Road', city: 'Durban', province: 'KwaZulu-Natal', postal_code: '4000', saps271_declarations: profile };
const application = { id: 'case', dealer_id: 'dealer', client_id: 'client', owner_user_id: 'owner', status: 'NOT_STARTED', application_type: 'COMPETENCY_ADDITIONAL_CATEGORY', competency_category: 'RIFLE', competency_id: null, acquisition_source: 'NOT_APPLICABLE', created_at: '2026-01-01', primary_purpose: 'Sport shooting', sport_discipline: 'Trap', sport_association: 'Applicant association', motivation_summary: 'Existing applicant purpose' };
const competency = { id: 'previous', client_id: 'client', category: 'HANDGUN', certificate_number: 'CERT-EXISTING', issue_date: '2020-01-02', expiry_date: '2030-01-02', verified: true };
const licence = { id: 'licence', client_id: 'client', firearm_id: 'firearm', licence_section: '13', licence_number: 'LIC-1', issue_date: '2020-01-01', expiry_date: '2026-01-01' };
const proof = { id: 'proof', client_id: 'client', competency_id: 'previous', document_type: 'COMPETENCY_CERTIFICATE', document_scope: 'COMPETENCY', lifecycle_status: 'ACTIVE', is_verified: true };
const rows = { clients: [client], application_cases: [application], competencies: [competency], firearm_licences: [licence], firearms: [{ id: 'firearm', client_id: 'client', is_active: true, make: 'Example', model: 'Example', calibre: '9mm', serial_number: 'TEST', required_competency: 'HANDGUN', firearm_type: 'PISTOL' }], documents: [proof] };
let actor = 'owner', failWrite = false, concurrent = false, writes = 0;
const db = {
  auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
  from(table) {
    let payload, single = false; const filters = [];
    const q = {
      select() { return q; }, order() { return q; },
      eq(k,v) { filters.push(r => k === 'saps271_declarations' ? JSON.stringify(r[k]) === v : r[k] === v); return q; },
      is(k,v) { filters.push(r => r[k] == v); return q; },
      single() { single = true; return q; }, maybeSingle() { single = true; return q; },
      update(value) { payload = clone(value); return q; },
      then(resolve,reject) {
        if (payload && concurrent) { client.saps271_declarations = { ...client.saps271_declarations, confirmedAt: '2026-01-03' }; concurrent = false; }
        const selected = rows[table].filter(r => (!r.owner_user_id || r.owner_user_id === actor) && filters.every(f => f(r)));
        if (payload && (failWrite || !selected.length)) return Promise.resolve({ data: null, error: { message: 'Write denied or stale' } }).then(resolve,reject);
        if (payload) { selected.forEach(r => Object.assign(r, payload)); writes++; }
        return Promise.resolve({ data: clone(single ? selected[0] ?? null : selected), error: null }).then(resolve,reject);
      },
    }; return q;
  },
};
const load = loader({ '../lib/supabase': { supabase: db } });
const policy = load('src/utils/applicationFormAnswers.ts');
const service = load('src/services/applicationFormAnswerService.ts');
const autofill = load('src/services/applicationAutofillService.ts');
const readiness = load('src/services/applicationReadinessService.ts');
const generated = load('src/services/generatedApplicationDocumentService.ts');
const mapping = load('src/engines/sapsFieldMappingEngine.ts');
const save = answers => service.saveApplicationFormAnswers({ dealerId: 'dealer', clientId: 'client', caseId: 'case', userId: 'owner', answers });
const evaluate = () => policy.evaluateApplicationForm({ application, profile: client.saps271_declarations, idNumber: client.id_number, competencies: rows.competencies, competency, licence });
const formRequirement = async () => (await readiness.getClientApplicationReadiness('client')).cases[0].requirements.find(r => r.key === 'APPLICATION_FORM_ANSWERS');
const applicantFacts = clone(profile.answers);
await save({ furtherCategories: ['RIFLE','SHOTGUN'], previousCompetencyIds: ['previous'], associationMember: 'NO' });
assert.deepEqual(evaluate().issues, []);
assert.deepEqual(client.saps271_declarations.answers, applicantFacts);
assert.equal(evaluate().fields.previousCategory, 'HANDGUN');
assert.equal(evaluate().fields.previousNumber, 'CERT-EXISTING');
assert.equal(evaluate().fields.furtherHANDGUN, '');
assert.equal(evaluate().fields.furtherRIFLE, 'X');
assert.equal(evaluate().fields.furtherSHOTGUN, 'X');
assert.equal((await formRequirement()).state, 'SATISFIED');
let ready = (await readiness.getClientApplicationReadiness('client')).cases[0];
assert.equal(ready.requirements.find(r => r.key === 'MOTIVATION').required, false);
assert.equal(ready.requirements.find(r => r.key === 'COMPETENCY_CERTIFICATE').documentId, 'proof');
let data = await autofill.buildApplicationAutofillPackage('client','case');
assert.equal(data.canGenerate, true);
assert.equal(mapping.mapApplicationToSapsTemplate(data, generated.createReviewValues(data)).missingRequiredFieldCount, 0);
assert.equal(data.formFields.identificationType, 'SA_ID');
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => new Response(readFileSync('public' + url));
try { assert.ok((await generated.generateOfficialApplicationPdf(data, generated.createReviewValues(data))).length > 1000); }
finally { globalThis.fetch = originalFetch; }
await save({ furtherCategories: ['RIFLE','SHOTGUN'], associationMember: null });
assert.equal(evaluate().fields.associationMember, '');
assert.equal((await formRequirement()).state, 'MISSING');
await save({ furtherCategories: ['RIFLE'], associationMember: 'YES' });
assert.ok(evaluate().issues.some(s => s.includes('association name')));
await save({ furtherCategories: [], associationMember: 'NO' });
assert.ok(evaluate().issues.some(s => s.includes('categories')));
console.log('PASS 517(a): multi-category JSON reload, prior certificate, existing proof ID reuse, SA ID, NULL/YES details, readiness, no generic motivation and real pinned PDF render');

application.application_type = 'COMPETENCY_RENEWAL'; application.competency_category = 'HANDGUN';
application.target_submission_date = '2029-01-01';
await save({});
assert.equal(evaluate().fields.before90, '');
assert.equal(evaluate().fields.afterExpiry, '');
assert.equal((await formRequirement()).state, 'MISSING');
data = await autofill.buildApplicationAutofillPackage('client','case');
assert.ok(mapping.mapApplicationToSapsTemplate(data,generated.createReviewValues(data)).missingRequiredFieldCount >= 2);
await assert.rejects(generated.generateOfficialApplicationPdf(data, generated.createReviewValues(data)), /Complete and save/);
const expiryDay = policy.dateDay(competency.expiry_date);
const at = offset => new Date((expiryDay + offset) * 86400000).toISOString().slice(0,10);
for (const [offset,before90,afterExpiry] of [[-91,'YES','NO'],[-90,'YES','NO'],[-89,'NO','NO'],[0,'NO','NO'],[1,'NO','YES']]) {
  await save({ submissionDate: at(offset), submissionKind: 'INTENDED' });
  assert.equal(evaluate().fields.before90,before90); assert.equal(evaluate().fields.afterExpiry,afterExpiry);
  if (before90 === 'NO') assert.ok(evaluate().issues.some(s => s.includes('reason')));
  await save({ submissionDate: at(offset), submissionKind: 'INTENDED', before90Reason: 'Applicant supplied late-hand-in reason', afterExpiryReason: 'Applicant supplied expiry reason' });
  assert.deepEqual(evaluate().issues, []);
}
assert.equal((await formRequirement()).state,'SATISFIED');
application.actual_submission_date = at(-90);
assert.equal(evaluate().fields.before90,'', 'Conflicting actual hand-in must be reconfirmed');
await save({ submissionDate: at(-90), submissionKind: 'ACTUAL' });
assert.equal(evaluate().fields.before90,'YES');
for (const date of [null,'','2030-02-30']) assert.equal(policy.renewalTiming(date,at(-90)).before90,'');
data = await autofill.buildApplicationAutofillPackage('client','case');
assert.equal(data.canGenerate,true);
globalThis.fetch = async url => new Response(readFileSync('public' + url));
try { assert.ok((await generated.generateOfficialApplicationPdf(data,generated.createReviewValues(data))).length > 1000); }
finally { globalThis.fetch = originalFetch; }
console.log('PASS 517(g): exact 90-day/expiry boundaries, explicit intended/actual confirmation, required reasons, unknown blockers, missing-field count, preserved certificate and pinned PDF render');

const draws = [];
const render = loader({ '../lib/supabase': { supabase: db }, 'pdf-lib/cjs/index.js': {
  PDFDocument: { load: async () => ({ embedFont: async () => ({ widthOfTextAtSize: s => s.length * 4 }), getPages: () => Array.from({length:6},(_,page) => ({ drawText: (value,options) => draws.push({page:page+1,value,...options}) })), setTitle(){},setAuthor(){},setSubject(){},setProducer(){},save:async()=>new Uint8Array([1]) }) },
  StandardFonts: { Helvetica:'Helvetica' }, rgb:()=>({}),
} })('src/engines/pdfTemplateRenderer.ts');
globalThis.fetch = async url => new Response(readFileSync('public' + url));
try {
  for (const [before90,afterExpiry] of [['YES','NO'],['NO','YES'],['','']]) {
    draws.length = 0;
    const mapped = { ...data, formFields: { ...data.formFields,before90,afterExpiry,before90Reason:before90 === 'NO' ? 'Applicant reason' : '',afterExpiryReason:afterExpiry === 'YES' ? 'Applicant expiry reason' : '' } };
    await render.renderOfficialPdfTemplate({ template:{code:'SAPS_517_G'},context:{data:mapped,reviewValues:generated.createReviewValues(mapped)} });
    for (const [answer,y] of [[before90,691],[afterExpiry,591]]) {
      const marks = draws.filter(d => d.page === 3 && d.y === y && d.value === 'X');
      assert.deepEqual(marks.map(d=>d.x),answer ? [answer === 'YES' ? 128 : 224] : []);
    }
    assert.ok(draws.some(d=>d.page===2 && d.y===230 && d.x===126 && d.value==='X'));
    assert.ok(!draws.some(d=>d.page===1),'Official-use page remains untouched');
    if (before90==='NO') assert.ok(draws.some(d=>d.page===3 && d.y===673 && d.value==='Applicant reason'));
    if (afterExpiry==='YES') assert.ok(draws.some(d=>d.page===3 && d.y===573 && d.value==='Applicant expiry reason'));
  }
} finally { globalThis.fetch=originalFetch; }
console.log('PASS 517(g) draw operations: exact Q15/Q16 YES/NO boxes, unknown marks neither, supplied reasons, SA ID marker, official-use page blank');

delete application.actual_submission_date;
application.application_type = 'FIREARM_LICENCE_FIRST_APPLICATION';
Object.assign(application,{ acquisition_source: 'EXISTING_FIREARM', firearm_id: 'firearm', firearm_licence_id: 'licence', licence_section: '16' });
await save({});
assert.ok(evaluate().issues.some(s => s.includes('licence term')));
await save({ licenceTermConfirmed: policy.licenceTermKey(licence) });
assert.equal((await formRequirement()).state,'SATISFIED');
data = await autofill.buildApplicationAutofillPackage('client','case');
assert.equal(data.supplier,null);
assert.equal(data.canGenerate,true);
assert.equal(mapping.mapApplicationToSapsTemplate(data,generated.createReviewValues(data)).missingRequiredFieldCount,0);
ready = (await readiness.getClientApplicationReadiness('client')).cases[0];
assert.ok(!ready.requirements.some(r => r.key.startsWith('ACQUISITION_')));
assert.equal(application.primary_purpose,'Sport shooting'); assert.equal(application.sport_discipline,'Trap');
const expiryBefore = licence.expiry_date; licence.expiry_date = '2027-01-01';
assert.ok(evaluate().issues.some(s => s.includes('licence term'))); licence.expiry_date = expiryBefore;
console.log('PASS 271: existing firearm has no seller/evidence demand, exact licence-term confirmation persists and invalidates on change, Section 16 purpose retained');

application.application_type = 'FIREARM_LICENCE_RENEWAL';
await save({ submissionDate: '2025-12-01', submissionKind: 'INTENDED', before90Reason: 'Applicant reason', beforeExpiryReason: 'Applicant reason', licenceTermConfirmed: policy.licenceTermKey(licence) });
assert.equal(evaluate().fields.beforeExpiry,'YES'); assert.deepEqual(evaluate().issues,[]);
assert.equal((await formRequirement()).state,'SATISFIED');
console.log('PASS 518(a): shared timing/conditional-reason state remains application-specific');

const beforeDenied = clone(client);
actor = 'other-same-dealer';
await assert.rejects(save({}),/Sign in/);
await assert.rejects(service.saveApplicationFormAnswers({ dealerId:'dealer',clientId:'client',caseId:'case',userId:actor,answers:{} }),/not available/);
assert.deepEqual(client,beforeDenied); actor='owner';
concurrent = true; await assert.rejects(save({}),/not saved/);
assert.equal(client.saps271_declarations.confirmedAt,'2026-01-03');
assert.ok(writes > 0);

const harness = hookHarness(); const saveRef = { current:null }; let attempts=0;
const Section = loader({ react:harness.react, 'react-native':nativeMock, '../Card':'Card','../Button':'Button','../TextField':'TextField', '../../services/applicationFormAnswerService': { saveApplicationFormAnswers:async () => { attempts++; throw Error('Persistence failed'); } } })('src/components/client/ApplicationFormQuestions.tsx').default;
harness.mount(Section,{ application, profile:client.saps271_declarations,idNumber:client.id_number,competencies:[competency],competency,licence,dealerId:'dealer',clientId:'client',userId:'owner',onSaved:()=>{},saveRef });
await harness.settle();
const dateField = nodes(harness.tree).find(n => n.props?.label === 'SAPS hand-in date (YYYY-MM-DD)');
dateField.props.onChangeText('2026-01-02'); await harness.settle();
await assert.rejects(saveRef.current(),/Persistence failed/); await harness.settle();
assert.equal(typeof saveRef.current,'function','Continue must retry unsaved answers after failure');
await assert.rejects(saveRef.current(),/Persistence failed/); assert.equal(attempts,2);
harness.unmount();
console.log('PASS persistence: owner-scoped case/JSON writes, same-dealer denial, optimistic conflict protection, failed editor save stays retryable');
