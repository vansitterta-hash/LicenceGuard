import assert from 'node:assert/strict';
import { loader } from './beta-test-support.mjs';
import { complete517Profile } from './saps517-test-fixture.mjs';

// Synthetic, read-only records. Every database mutation and network request fails.
const profile = complete517Profile();
profile.saps517.accreditedTrainingCertificate = { answer: 'YES', institution: 'Synthetic Training Provider', serialNumber: 'TRAINING-42', dateIssued: '2025-03-04' };
const client = { id: 'client', first_name: 'Example', surname: 'Applicant', id_number: '8001015009087', address_line_1: '1 Example Road', city: 'Durban', province: 'KwaZulu-Natal', postal_code: '4000', saps271_declarations: profile };
const application = { id: 'case', client_id: 'client', application_type: 'COMPETENCY_FIRST_APPLICATION', competency_category: 'SHOTGUN', competency_id: null, status: 'NOT_STARTED', acquisition_source: 'NOT_APPLICABLE', certificate_number: null, issue_date: null };
const competency = { id: 'competency', client_id: 'client', category: 'SHOTGUN', certificate_number: 'SAPS-99', issue_date: '2020-01-02', expiry_date: '2030-01-02', verified: true };
const rows = {
  clients: [client], application_cases: [application], competencies: [competency], firearms: [], firearm_licences: [],
  documents: ['ID_COPY', 'PROOF_OF_RESIDENCE', 'COMPETENCY_APPLICATION'].map(document_type => ({ id: document_type, client_id: 'client', application_case_id: 'case', document_type, document_scope: 'CLIENT', lifecycle_status: 'ACTIVE', is_verified: true })),
};
const queries = [];
const denyWrite = () => { throw Error('Unexpected database mutation'); };
const db = { from(table) {
  let single = false;
  const filters = [];
  const q = { select() { return q; }, order() { return q; }, eq(k,v) { filters.push([k,v]); return q; }, single() { single = true; return q; }, maybeSingle() { single = true; return q; },
    insert: denyWrite, update: denyWrite, upsert: denyWrite, delete: denyWrite,
    then(resolve,reject) {
      queries.push({table,filters});
      const result = rows[table].filter(row => filters.every(([key,value]) => row[key] === value));
      return Promise.resolve({data: structuredClone(single ? result[0] ?? null : result), error: null}).then(resolve,reject);
    },
  }; return q;
} };
const load = loader({ '../lib/supabase': { supabase: db } });
const { buildApplicationAutofillPackage: build } = load('src/services/applicationAutofillService.ts');
const { getClientApplicationReadiness: readiness } = load('src/services/applicationReadinessService.ts');
const { resolveReusableCompetency: choose } = load('src/utils/reusableCompetency.ts');
const { createReviewValues } = load('src/services/generatedApplicationDocumentService.ts');
const { mapApplicationToSapsTemplate } = load('src/engines/sapsFieldMappingEngine.ts');
const original = JSON.stringify(rows);
let data = await build('client','case');
assert.equal(data.competency.category, 'SHOTGUN');
assert.equal(data.competency.certificateNumber, 'SAPS-99');
assert.equal(data.competency.issueDate, '2020-01-02');
assert.equal(data.saps517Applicant.trainingCategory.shotgun, 'X');
assert.equal(data.saps517Applicant.trainingInstitution, 'Synthetic Training Provider');
assert.equal(data.saps517Applicant.trainingCertificateSerial, 'TRAINING-42');
assert.equal(data.saps517Applicant.trainingCertificateIssueDate, '2025-03-04');
assert.equal(data.canGenerate, true);
const mapped = mapApplicationToSapsTemplate(data, createReviewValues(data)).sections.flatMap(s=>s.fields);
for (const [key, value] of [['trainingInstitution','Synthetic Training Provider'],['trainingCertificateSerial','TRAINING-42'],['trainingCertificateIssueDate','2025-03-04']]) {
  assert.equal(mapped.find(f=>f.key===`applicant.saps517.${key}`).value, value);
}
assert.equal((await readiness('client')).cases[0].requirements.find(r=>r.key==='SAPS517_APPLICANT_DATA').state, 'SATISFIED');
assert.equal(JSON.stringify(rows), original);
console.log('PASS: unlinked matching SAPS competency reused; saved H1 training facts and Shotgun reach SAPS mapping; blank case data cannot erase facts; no writes.');

const draws = [];
const pdfMock = { PDFDocument: { async load() { return { async embedFont() { return { widthOfTextAtSize: s=>s.length*4 }; }, getPages() { return Array.from({length:11},(_,i)=>({drawText(value,options){draws.push({page:i+1,value,...options});}})); }, setTitle(){},setAuthor(){},setSubject(){},setProducer(){},async save(){return new Uint8Array([1]);} }; } }, StandardFonts:{Helvetica:'Helvetica'},rgb(){return 0;} };
const renderer = loader({'pdf-lib':pdfMock,'pdf-lib/cjs/index.js':pdfMock})('src/engines/pdfTemplateRenderer.ts');
const originalFetch = globalThis.fetch;
globalThis.fetch = async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
try {
  await renderer.renderOfficialPdfTemplate({template:{code:'SAPS_517'},context:{data,reviewValues:createReviewValues(data)}});
  for(const value of ['Synthetic Training Provider','TRAINING-42','2025-03-04']) assert.ok(draws.some(d=>d.value===value), value);
  assert.ok(!draws.some(d=>d.page===1 || d.value==='SAPS-99' || d.value==='2020-01-02'));
  const layout=load('src/data/documentLayoutDefinitions.ts').DOCUMENT_LAYOUT_DEFINITIONS.find(l=>l.templateCode==='SAPS_517');
  assert.ok(!layout.elements.some(e=>/signature(?!-name)|signed-(date|place)|signing|applicant-(date|place)$/i.test(e.id) && !e.officialUse && e.autofillPolicy!=='PROTECTED_OFFICIAL'));
} finally {globalThis.fetch=originalFetch;}
console.log('PASS: training facts reach PDF draw operations; SAPS certificate is never substituted; official-use and physical signing fields remain blank.');

Object.assign(profile.saps517.accreditedTrainingCertificate,{serialNumber:'',dateIssued:''});
data=await build('client','case');
assert.equal(data.saps517Applicant.trainingCertificateSerial,'');
assert.equal(data.saps517Applicant.trainingCertificateIssueDate,'');
assert.equal(data.canGenerate,false);
let ready=(await readiness('client')).cases[0];
let requirement=ready.requirements.find(r=>r.key==='SAPS517_APPLICANT_DATA');
assert.equal(requirement.detail,'Enter the training certificate serial number. Enter a valid training certificate issue date.');
assert.equal(ready.missingCount,1);
assert.equal(requirement.detail,data.issues.filter(i=>i.key.startsWith('saps517Applicant.')).map(i=>i.message).join(' '));
rows.documents.push({id:'evidence',client_id:'client',document_type:'COMPETENCY_CERTIFICATE',document_scope:'CLIENT',lifecycle_status:'ACTIVE',is_verified:true,issued_by:'Evidence issuer',reference_number:'EVIDENCE-123',document_date:'2024-01-01'});
assert.equal((await build('client','case')).saps517Applicant.trainingCertificateSerial,'');
for(const answer of [null,undefined,'NOT_ANSWERED']) {
  profile.saps517.accreditedTrainingCertificate.answer=answer;
  data=await build('client','case');
  assert.equal(data.saps517Applicant.trainingCertificate,'');
  assert.ok(data.issues.some(i=>i.message.includes('Section H1')));
}
profile.saps517.accreditedTrainingCertificate.answer='YES';
console.log('PASS: real-field-test-shaped missing training number/date still block; document metadata and SAPS competency do not invent training facts; unknown never becomes NO.');

const wrong={...competency,id:'wrong',category:'HANDGUN'};
assert.equal(choose([competency,wrong],'SHOTGUN','wrong'),null);
assert.equal(choose([competency],'SHOTGUN','missing'),null);
assert.equal(choose([competency,{...competency,id:'duplicate'}],'SHOTGUN',null),null);
assert.equal(choose([competency,{...competency,id:'duplicate'}],'SHOTGUN','competency'),competency);
assert.equal(choose([competency],'SHOTGUN',null,true),null);
assert.equal(choose([wrong],'SHOTGUN','wrong',true),wrong);
rows.competencies=[{...competency,client_id:'another-client'}];
assert.equal((await build('client','case')).competency.certificateNumber,'');
application.competency_id='competency';
assert.ok((await build('client','case')).issues.some(i=>i.key==='competencyRecord'&&i.severity==='BLOCKING'));
assert.equal((await readiness('client')).cases[0].requirements.find(r=>r.key==='COMPETENCY_RECORD').state,'MISSING');
rows.competencies=[competency];application.competency_id=null;
application.application_type='COMPETENCY_RENEWAL';
data=await build('client','case');
assert.equal(data.application.formCode,'SAPS_517_G');
assert.equal(data.competency.certificateNumber,'SAPS-99');
assert.ok(!data.issues.some(i=>i.key==='competency'));
assert.equal((await readiness('client')).cases[0].requirements.find(r=>r.key==='COMPETENCY_CERTIFICATE').state,'SATISFIED');
const renewal=mapApplicationToSapsTemplate(data,createReviewValues(data)).sections.flatMap(s=>s.fields);
assert.equal(renewal.find(f=>f.key==='competency.certificateNumber').value,'SAPS-99');
rows.firearms=[{id:'firearm',client_id:'client',is_active:true,make:'Example',calibre:'12 gauge',serial_number:'SYNTHETIC',required_competency:'SHOTGUN'}];
application.application_type='FIREARM_LICENCE_FIRST_APPLICATION';application.firearm_id='firearm';application.competency_category=null;application.licence_section='16';
data=await build('client','case');
assert.equal(data.application.formCode,'SAPS_271');
assert.equal(data.competency.category,'SHOTGUN');
assert.equal(data.competency.certificateNumber,'SAPS-99');
assert.ok(queries.filter(q=>q.table==='competencies').every(q=>q.filters.some(([k,v])=>k==='client_id'&&v==='client')));
console.log('PASS: explicit links, ambiguity, mismatched categories and cross-client records handled safely; 517(g)/271 reuse only actual competency facts; every competency query client-scoped.');
