import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loader, nodes, nativeMock } from './beta-test-support.mjs';
import { complete517Profile } from './saps517-test-fixture.mjs';

// Synthetic records only; any persistence attempt fails immediately.
const profile = complete517Profile();
const client = { id: 'client', first_name: 'Example', surname: 'Applicant', id_number: '8001015009087', address_line_1: '1 Example Road, Cato Ridge', address_line_2: 'Cato Ridge', suburb: 'Cato Ridge', city: 'Cato Ridge', province: 'KwaZulu-Natal', postal_code: '3680', saps271_declarations: profile };
const application = { id: 'case', client_id: 'client', application_type: 'COMPETENCY_FIRST_APPLICATION', competency_category: 'SHOTGUN', status: 'NOT_STARTED', acquisition_source: 'NOT_APPLICABLE' };
const rows = { clients: [client], application_cases: [application], competencies: [], firearms: [], firearm_licences: [], documents: ['ID_COPY','PROOF_OF_RESIDENCE'].map((type) => ({ id: type, client_id: 'client', document_type: type, document_scope: 'CLIENT', lifecycle_status: 'ACTIVE', is_verified: true, metadata: {} })) };
rows.documents.push({ id: 'form', client_id: 'client', application_case_id: 'case', document_type: 'COMPETENCY_APPLICATION', document_scope: 'APPLICATION_CASE', lifecycle_status: 'ACTIVE', is_verified: true, metadata: {} });
const noWrite = () => { throw new Error('Unexpected database write'); };
const db = { from(table) {
  const filters = []; let single = false;
  const q = { select() { return q; }, order() { return q; }, eq(k,v) { filters.push(r => r[k] === v); return q; }, single() { single = true; return q; }, maybeSingle() { single = true; return q; }, insert: noWrite, update: noWrite, delete: noWrite, upsert: noWrite,
    then(resolve,reject) { const result = rows[table].filter(r => filters.every(f => f(r))); return Promise.resolve({ data: single ? result[0] : result, error: null }).then(resolve,reject); } };
  return q;
} };
const load = loader({ '../lib/supabase': { supabase: db } });
const policy = load('src/utils/saps517Applicant.ts');
const shared = load('src/utils/saps271Declarations.ts');
const { buildApplicationAutofillPackage } = load('src/services/applicationAutofillService.ts');
const { getClientApplicationReadiness } = load('src/services/applicationReadinessService.ts');
const service = load('src/services/generatedApplicationDocumentService.ts');
const layouts = load('src/data/documentLayoutDefinitions.ts').DOCUMENT_LAYOUT_DEFINITIONS;
const layout = layouts.find(l => l.templateCode === 'SAPS_517');
const original = JSON.stringify(rows);
const data = await buildApplicationAutofillPackage('client','case');
assert.equal(data.canGenerate, true);
assert.equal(data.competency.category, 'SHOTGUN');
assert.equal(data.saps517Applicant.trainingCategory.shotgun, 'X');
assert.equal(data.saps517Applicant.residentialAddress, '1 Example Road');
assert.equal(data.saps517Applicant.residentialLocality, 'Cato Ridge, KwaZulu-Natal');
assert.equal(data.saps517Applicant.postalAddress, '1 Example Road');
assert.equal(data.saps517Applicant.postalLocality, 'Cato Ridge, KwaZulu-Natal');
let ready = (await getClientApplicationReadiness('client')).cases[0];
assert.equal(ready.readyToGenerate, true);
assert.equal(ready.requirements.find(r => r.key === 'MOTIVATION').required, false);
assert.equal(ready.requirements.find(r => r.key === 'MOTIVATION').state, 'MISSING');
assert.ok(!ready.requirements.some(r => r.required && /signature|photo|fingerprint|police|interpreter|witness|interview|DFO/i.test(r.key)));
assert.equal(JSON.stringify(rows), original);
console.log('PASS: Shotgun case, structured addresses, adult readiness without motivation/signatures/police fields; read-only records');

for (const missing of [null, undefined, 'NOT_ANSWERED', '']) {
  for (const q of shared.DECLARATION_QUESTIONS) {
    const saved = profile.answers[q.key].answer;
    profile.answers[q.key].answer = missing;
    assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false, q.key);
    assert.equal((await getClientApplicationReadiness('client')).cases[0].readyToGenerate, false, q.key);
    profile.answers[q.key].answer = saved;
  }
  for (const q of policy.SAPS517_ADDITIONAL_DECLARATIONS) {
    profile.saps517.additionalDeclarations[q.key].answer = missing;
    assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false, q.key);
    assert.equal((await getClientApplicationReadiness('client')).cases[0].readyToGenerate, false, q.key);
    profile.saps517.additionalDeclarations[q.key].answer = 'NO';
  }
  for (const key of ['citizenshipChoice', 'maritalStatus', 'postalAddressSameAsResidential', 'knowledgeOfActTest', 'safeHandlingTrainingTest', 'spouseApplicable', 'employmentStatus']) {
    const saved = profile.saps517[key]; profile.saps517[key] = missing;
    assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false, key);
    assert.equal((await getClientApplicationReadiness('client')).cases[0].readyToGenerate, false, key);
    profile.saps517[key] = saved;
  }
}
for (const key of ['first_name','surname','id_number','address_line_1','city','province','postal_code']) {
  const saved = client[key]; client[key] = '';
  assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false, key);
  assert.equal((await getClientApplicationReadiness('client')).cases[0].readyToGenerate, false, key);
  client[key] = saved;
}
for (const key of ['occupation','residenceDescription']) {
  const saved = profile.saps517[key]; profile.saps517[key] = '';
  assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false, key);
  profile.saps517[key] = saved;
}
const saved517 = profile.saps517;
for (const partial of [null, {}, { accreditedTrainingCertificate: null, additionalDeclarations: null }, { accreditedTrainingCertificate: { answer: 'YES' }, additionalDeclarations: { protectionOrder: { answer: 'YES', details: null } } }]) {
  profile.saps517 = partial;
  assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
}
profile.saps517 = saved517;
console.log('PASS: H5-H16 and missing required particulars block both readiness and autofill; partial/NULL JSON remains unanswered');

profile.saps517.citizenshipChoice = 'PERMANENT_RESIDENT';
assert.equal((await buildApplicationAutofillPackage('client','case')).saps517Applicant.citizenship, 'PERMANENT_RESIDENT', 'explicit answer takes precedence over ID digit');
profile.saps517.citizenshipChoice = 'SA_CITIZEN';
profile.saps517.postalAddressSameAsResidential = 'NO';
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
Object.assign(profile.saps517, { postalAddress: 'PO Box 42', postalLocality: 'Durban', postalAddressPostalCode: '4000' });
const separate = await buildApplicationAutofillPackage('client','case');
assert.equal(separate.saps517Applicant.postalAddress, 'PO Box 42');
assert.equal(separate.saps517Applicant.postalLocality, 'Durban');
assert.equal(separate.saps517Applicant.postalAddressPostalCode, '4000');
profile.saps517.postalAddressSameAsResidential = 'YES';
console.log('PASS: persisted citizenship overrides ID inference; separate residential/postal addresses and codes');

for (const { key } of policy.SAPS517_ADDITIONAL_DECLARATIONS) {
  const response = profile.saps517.additionalDeclarations[key];
  response.answer = 'YES';
  assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
  response.details = 'Applicant supplied details';
  assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, true);
  response.answer = 'NO'; response.details = '';
}
profile.saps517.accreditedTrainingCertificate.answer = 'YES';
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
Object.assign(profile.saps517.accreditedTrainingCertificate, { institution: 'Example Training', serialNumber: 'CERT-42', dateIssued: '2026-02-30' });
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
profile.saps517.accreditedTrainingCertificate.dateIssued = '2026-02-28';
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, true);
profile.saps517.accreditedTrainingCertificate.answer = 'NO';
profile.saps517.maritalStatus = 'MARRIED';
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
Object.assign(profile.saps517, { spouseApplicable: 'YES', spouseIdType: 'SA_ID', spouseIdentityNumber: client.id_number });
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, true);
Object.assign(profile.saps517, { maritalStatus: 'SINGLE', spouseApplicable: 'NO' });
profile.saps517.employmentStatus = 'EMPLOYED';
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, false);
Object.assign(profile.saps517, { employerName: 'Example Company', businessAddress: '2 Example Road', businessPostalCode: '4000' });
assert.equal((await buildApplicationAutofillPackage('client','case')).canGenerate, true);
profile.saps517.employmentStatus = 'NOT_APPLICABLE';
// Generate a valid synthetic young applicant ID with a Luhn check digit.
const yy = String(new Date().getFullYear() - 19).slice(-2);
const youngId = Array.from({length:10},(_,digit)=>`${yy}0101500908${digit}`).find(id => load('src/utils/southAfricanId.ts').isValidSouthAfricanId(id));
assert.ok(policy.saps517ApplicantReadinessIssues(profile,youngId).some(issue=>issue.includes('under 21')));
profile.saps517.under21Reason = 'DEDICATED_HUNTER';
assert.ok(policy.saps517ApplicantReadinessIssues(profile,youngId).some(issue=>issue.includes('H17.2')));
profile.saps517.under21OtherDetails = 'Applicant supplied compelling reasons';
assert.deepEqual(policy.saps517ApplicantReadinessIssues(profile,youngId),[]);
assert.equal(policy.saps517ApplicantFields({profile,idNumber:youngId,competencyCategory:'SHOTGUN',residentialAddress:'Example',residentialPostalCode:'4000'}).under21Reason,'DEDICATED_HUNTER');
assert.equal((await buildApplicationAutofillPackage('client','case')).saps517Applicant.under21OtherDetails,'');
console.log('PASS: YES details, H1 certificate/date validation, applicable spouse/employment and under-21 reasons; adult H17 remains blank');

const draws = [];
const pdfMock = { PDFDocument: { async load() { return { async embedFont() { return { widthOfTextAtSize: s => s.length * 4 }; }, getPages() { return Array.from({length:11},(_,i)=>({ drawText(value,opts) { draws.push({page:i+1,value,...opts}); } })); }, setTitle() {}, setAuthor() {}, setSubject() {}, setProducer() {}, async save() { return new Uint8Array([1]); } }; } }, StandardFonts: { Helvetica: 'Helvetica' }, rgb() { return 0; } };
const renderer = loader({ 'pdf-lib': pdfMock, 'pdf-lib/cjs/index.js': pdfMock })('src/engines/pdfTemplateRenderer.ts');
const priorFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
async function render(d) { draws.length = 0; await renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_517' }, context: { data: d, reviewValues: service.createReviewValues(d) } }); }
try {
  for (const answer of ['YES','NO',null]) {
    const p = complete517Profile();
    for (const response of Object.values(p.answers)) response.answer = answer;
    for (const response of Object.values(p.saps517.additionalDeclarations)) response.answer = answer;
    p.saps517.knowledgeOfActTest = p.saps517.safeHandlingTrainingTest = p.saps517.accreditedTrainingCertificate.answer = answer;
    const d = { ...data, saps271Declarations: p, saps517Applicant: policy.saps517ApplicantFields({profile:p,idNumber:client.id_number,competencyCategory:'SHOTGUN',residentialAddress:'1 Example Road',residentialLocality:'Cato Ridge',residentialPostalCode:'3680'}) };
    await render(d);
    for (const element of layout.elements.filter(e => e.kind === 'CHECKBOX' && ['YES','NO'].includes(e.choiceValue))) {
      const marks = draws.filter(draw => draw.page === element.page && draw.x === element.x && draw.y === element.y && draw.value === 'X');
      assert.equal(marks.length, element.choiceValue === answer ? 1 : 0, `${element.id} ${answer}`);
    }
    assert.ok(draws.some(d => d.page === 2 && d.x === 386 && d.value === 'X'), 'D Shotgun box');
    assert.ok(draws.some(d => d.page === 3 && d.x === 551 && d.y === 436 && d.value === 'X'), 'G3 Shotgun box');
    assert.ok(!draws.some(d => d.page === 1 || (d.page === 3 && d.y > 550)), 'official administration and dealer-only Section F remain blank');
  }
  const g1 = layout.elements.find(e=>e.id==='s517-g1-act-test-yes');
  const g2 = layout.elements.find(e=>e.id==='s517-g2-training-test-yes');
  assert.equal(g1.y,517); assert.equal(g2.y,473);
  profile.saps517.maritalStatus = 'OTHER'; profile.saps517.otherMaritalStatus = 'Civil partnership';
  await render(await buildApplicationAutofillPackage('client','case'));
  assert.ok(draws.some(d=>d.page===2&&d.x===128&&d.y===208&&d.value==='X'));
  assert.ok(draws.some(d=>d.value==='Civil partnership'));
  profile.saps517.maritalStatus = 'SINGLE'; profile.saps517.otherMaritalStatus = '';
  const long = structuredClone(data);
  long.saps517Applicant.declarations.protectionOrder = { answer: 'YES', details: 'Long applicant explanation '.repeat(100) };
  await assert.rejects(render(long), /cannot be truncated/);
  console.log('PASS: G1/G2 in private-person Section G; H1 and H5-H16 YES/NO mark only the correct box; NULL marks neither; Shotgun X; Other marital status; no official-use overlay');
} finally { globalThis.fetch = priorFetch; }

const bad = structuredClone(data); bad.saps271Declarations.saps517.additionalDeclarations.protectionOrder.answer = null;
await assert.rejects(service.generateOfficialApplicationPdf(bad, service.createReviewValues(bad)), /Complete the required SAPS 517/);
assert.equal(createHash('sha256').update(readFileSync('public/saps-templates/SAPS_517_EN_OFFICIAL.pdf')).digest('hex'), '8066ff257c854c7d8c641369c0d4be976b596516bf744fd98701ba67bff8f378');
const componentLoad = loader({ 'react-native': nativeMock, '../Card': 'Card', '../TextField': 'TextField' });
let changed;
const tree = componentLoad('src/components/client/Saps517ApplicantSection.tsx').default({value:profile,idNumber:client.id_number,onChange:next=>changed=next});
const radios = nodes(tree).filter(n=>n.props?.accessibilityRole==='radio');
assert.ok(nodes(tree).some(n=>n.props?.children==='Type of citizenship'));
radios.find(n=>nodes(n).some(child=>child.props?.children==='Non-SA citizen with permanent residence')).props.onPress();
assert.equal(changed.citizenshipChoice,'PERMANENT_RESIDENT');
assert.equal(profile.saps517.citizenshipChoice,'SA_CITIZEN');
console.log('PASS: generation boundary rejects unanswered declaration; citizenship editor available for SA ID; pinned official template SHA-256 unchanged');

let renderedContext;
const reviewService = loader({ '../lib/supabase': { supabase: {} }, '../engines/pdfTemplateRenderer': { renderOfficialPdfTemplate: async ({context}) => { renderedContext = context; return new Uint8Array([1]); } } })('src/services/generatedApplicationDocumentService.ts');
const review = service.createReviewValues(data);
review.residentialAddress = '42 Changed Road, Cato Ridge';
review.postalCode = '3690';
await reviewService.generateOfficialApplicationPdf(data,review);
assert.equal(renderedContext.data.saps517Applicant.residentialAddress,'42 Changed Road');
assert.equal(renderedContext.data.saps517Applicant.postalAddress,'42 Changed Road');
assert.equal(renderedContext.data.saps517Applicant.postalAddressPostalCode,'3690');
assert.equal(data.saps517Applicant.residentialAddress,'1 Example Road');

let payload; const filters = [];
const saveDb = { from(table) { assert.equal(table,'clients'); const q = { update(value) { payload = structuredClone(value); return q; }, eq(k,v) { filters.push([k,v]); return q; }, select() { return q; }, single: async () => ({data:{...client,...payload},error:null}) }; return q; } };
const clients = loader({ '../lib/supabase': {supabase:saveDb}, '../services/safeDeletionService': {} })('src/services/clientService.ts');
const form = { firstName:'Example',surname:'Applicant',idNumber:client.id_number,cellphone:'',alternateCellphone:'',email:'',preferredContactChannel:'EMAIL',addressLine1:'1 Example Road',addressLine2:'',suburb:'Cato Ridge',city:'Cato Ridge',province:'KwaZulu-Natal',postalCode:'3680',notes:'',saps271Declarations:profile };
const saved = await clients.updateClient('client','dealer','user',form);
assert.deepEqual(saved.saps271_declarations,profile);
assert.deepEqual(payload.saps271_declarations.answers,profile.answers);
assert.deepEqual(filters.slice(0,4),[['id','client'],['dealer_id','dealer'],['id','client'],['dealer_id','dealer']]);
assert.equal(filters[4][0], 'saps271_declarations', 'Concurrent JSON edits must not be overwritten');
delete form.saps271Declarations;
await clients.updateClient('client','dealer','user',form);
assert.equal('saps271_declarations' in payload,false);
console.log('PASS: review address edits reach residential/postal PDF rows without mutating profile; existing JSON persistence preserves H5-H16 and scoped client updates');

// Exercise persisted JSON -> autofill -> generation -> real PDF operators, rather
// than relying only on mocks or on the layout's own coordinates as expectations.
const { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, StandardFonts } = await import('pdf-lib');
const pinnedBytes = readFileSync('public/saps-templates/SAPS_517_EN_OFFICIAL.pdf');
const pinned = await PDFDocument.load(pinnedBytes);
function streams(pdf, page) {
  const contents = pdf.getPages()[page - 1].node.Contents();
  return (contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents])
    .filter(s => s instanceof PDFRawStream)
    .map(s => Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'));
}
function overlay(pdf, page) {
  const originals = streams(pinned, page);
  const output = streams(pdf, page);
  for (const original of originals) assert.ok(output.includes(original), `official page ${page} artwork preserved`);
  return output.filter(s => !originals.includes(s)).join('\n');
}
function textDraws(content) {
  return [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\s*<([\da-f]+)> Tj/gi)]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]), value: Buffer.from(m[3], 'hex').toString('latin1') }));
}
// Cell borders are independently extracted from the pinned employer row paths.
const row = streams(pinned, 2).join('\n').replace(/\r/g, '').split('19.8000 385.3800 cm')[1].split('19.8000 367.2600 cm')[0];
const borders = [...row.matchAll(/([\d.]+) 0\.0000 m\n[\d.]+ 0\.0000 l\n[\d.]+ 18\.0000 l\n[\d.]+ 18\.0000 l/g)]
  .map(m => Number(m[1]) + 19.8).filter(x => x > 159);
assert.equal(borders.length, 22);
Object.assign(profile.saps517, { employmentStatus: 'EMPLOYED', employerName: 'Example & Co-12345678' });
Object.assign(profile.saps517.accreditedTrainingCertificate, { answer: 'YES', institution: 'Example Training', serialNumber: 'CERT-42', dateIssued: '2026-02-28' });
application.application_reference = 'MUST-NOT-PRINT';
application.police_station = 'OFFICIAL-ONLY';
application.opened_date = '2026-09-01';
const immutableProfile = JSON.stringify(profile);
const font = await pinned.embedFont(StandardFonts.Helvetica);
globalThis.fetch = async url => { assert.equal(url, '/saps-templates/SAPS_517_EN_OFFICIAL.pdf'); return new Response(pinnedBytes); };
try {
  for (const [g1, g2] of [['YES', 'NO'], ['NO', 'YES']]) {
    profile.saps517.knowledgeOfActTest = g1;
    profile.saps517.safeHandlingTrainingTest = g2;
    const d = await buildApplicationAutofillPackage('client', 'case');
    assert.equal(d.saps517Applicant.knowledgeOfActTest, g1);
    assert.equal(d.saps517Applicant.safeHandlingTrainingTest, g2);
    const pdf = await PDFDocument.load(await service.generateOfficialApplicationPdf(d, service.createReviewValues(d)));
    assert.equal(pdf.getPageCount(), 11);
    for (let page = 1; page <= 11; page++) overlay(pdf, page);
    assert.ok(!/\b(?:Tj|TJ)\b/.test(overlay(pdf, 1)), 'no Page 1 text, including SAPS 86 / NO / YEAR');
    for (const page of [7, 8, 9, 10, 11]) assert.ok(!/\b(?:Tj|TJ)\b/.test(overlay(pdf, page)));
    const employer = textDraws(overlay(pdf, 2)).filter(d => d.y === 372);
    assert.equal(employer.map(d => d.value).join(''), profile.saps517.employerName);
    assert.equal(employer.length, 21);
    employer.forEach((draw, i) => {
      assert.equal(draw.value.length, 1);
      const center = draw.x + font.widthOfTextAtSize(draw.value, 8) / 2;
      assert.ok(Math.abs(center - (borders[i] + borders[i + 1]) / 2) < 0.001, `employer cell ${i + 1} centered on actual PDF box`);
    });
    const page3 = textDraws(overlay(pdf, 3));
    for (const [answer, y] of [[g1, 517], [g2, 473]]) {
      assert.deepEqual(page3.filter(d => d.y === y), [{ x: answer === 'YES' ? 128 : 224, y, value: 'X' }]);
    }
    assert.ok(page3.some(d => d.x === 551 && d.y === 436 && d.value === 'X'));
    assert.ok(page3.some(d => d.value === 'Example Training'));
    assert.ok(page3.some(d => d.value === 'CERT-42'));
    assert.ok(page3.some(d => d.value === '2026-02-28'));
    assert.ok(textDraws(overlay(pdf, 2)).some(d => d.x === 386 && d.y === 693 && d.value === 'X'));
  }
  for (const answer of [null, undefined, '', 'NOT_ANSWERED']) {
    profile.saps517.knowledgeOfActTest = answer;
    profile.saps517.safeHandlingTrainingTest = answer;
    const d = await buildApplicationAutofillPackage('client', 'case');
    assert.equal(d.saps517Applicant.knowledgeOfActTest, '');
    assert.equal(d.saps517Applicant.safeHandlingTrainingTest, '');
    assert.equal(d.canGenerate, false, 'certificate does not imply Section G YES');
    await assert.rejects(service.generateOfficialApplicationPdf(d, service.createReviewValues(d)), /Complete the required SAPS 517/);
    await render(d);
    assert.ok(!draws.some(d => d.page === 3 && [517, 473].includes(d.y)), 'unknown marks neither YES nor NO');
  }
  profile.saps517.knowledgeOfActTest = profile.saps517.safeHandlingTrainingTest = 'YES';
  assert.equal(JSON.stringify(profile), immutableProfile, 'generation does not change stored employer or answers');
  const overflow = await buildApplicationAutofillPackage('client', 'case');
  overflow.saps271Declarations = structuredClone(profile);
  overflow.saps271Declarations.saps517.employerName = 'A'.repeat(22);
  await assert.rejects(service.generateOfficialApplicationPdf(overflow, service.createReviewValues(overflow)), /exceeds the 21 configured character boxes/);
} finally { globalThis.fetch = priorFetch; }
console.log('PASS: real 11-page PDF preserves artwork; Page 1 blank; 21 employer characters centered on template cells; stored mixed G1/G2 answers; unknown never inferred from H1; Shotgun and H1 preserved');
