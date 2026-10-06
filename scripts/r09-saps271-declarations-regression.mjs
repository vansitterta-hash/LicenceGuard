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
// Existing application editor -> canonical JSON save -> fresh readiness/AutoFill.
applicationCase.application_type = 'FIREARM_LICENCE_FIRST_APPLICATION';
const physicalAnswers = {saps271Firearm:{firearmId:'owned',action:'MANUAL',receiverSerial:'TEST'},associationMember:'YES',associationName:'Test Association',associationFar:'123',associationNumber:'MEM',associationJoined:'2020-01-01',associationNoExpiry:true,prescribedSafe:'YES',safeType:'RIFLE',safeDetails:'Steel safe',safeMounted:'YES',safeMountings:['WALL']};
Object.assign(applicationCase, { primary_purpose:'Sport shooting', sport_discipline:'Trap', dealer_id: 'dealer-test', status: 'NOT_STARTED', firearm_id: 'owned', licence_section: '13', acquisition_source: 'EXISTING_FIREARM' });
Object.assign(client, { dealer_id: 'dealer-test', saps271_declarations: { ...yes, confirmedAt: null, applications: { [applicationCase.id]:physicalAnswers, other: { licenceTermConfirmed: 'preserve' } } } });
rows.firearms = [{ id:'owned',client_id:client.id,is_active:true,make:'Example',model:'Stored model',calibre:'12 gauge',serial_number:'TEST',required_competency:'SHOTGUN',firearm_type:'SHOTGUN' }];
rows.competencies = [{id:'competency',client_id:client.id,category:'SHOTGUN',certificate_number:'CERT',issue_date:'2020-01-01',verified:true}];
const persistDb = { auth: { getUser:async()=>({data:{user:{id:'user-test'}},error:null}) }, from(table) {
  let payload, inserted, single=false;const filters=[];
  const q={select(){return q;},order(){return q;},not(){return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},
    eq(k,v){filters.push(r=>k==='saps271_declarations'?JSON.stringify(r[k])===v:r[k]===v);return q;},
    is(k,v){filters.push(r=>r[k]==v);return q;},update(value){payload=value;return q;},insert(value){inserted=value;return q;},
    then(resolve,reject){if(inserted){rows[table].push({id:`generated-${rows[table].length}`,created_at:new Date().toISOString(),...structuredClone(inserted)});return Promise.resolve({error:null}).then(resolve,reject);}const source=Array.isArray(rows[table])?rows[table]:[rows[table]];const selected=source.filter(r=>filters.every(f=>f(r)));if(payload)selected.forEach(r=>Object.assign(r,structuredClone(payload)));return Promise.resolve({data:structuredClone(single?selected[0]:selected),error:null}).then(resolve,reject);},
  };return q;
} };
const persistedLoad=loader({'../lib/supabase':{supabase:persistDb}});
const answerService=persistedLoad('src/services/applicationFormAnswerService.ts');
const editorHarness=hookHarness();
const Editor=loader({react:editorHarness.react,'react-native':nativeMock,'../Card':'Card','../Button':'Button','../TextField':'TextField','./Saps271DeclarationsSection':'Declarations','../../services/applicationFormAnswerService':answerService})('src/components/client/ApplicationFormQuestions.tsx').default;
editorHarness.mount(Editor,{application:applicationCase,profile:client.saps271_declarations,idNumber:client.id_number,competencies:rows.competencies,firearm:rows.firearms[0],dealerId:'dealer-test',clientId:client.id,userId:'user-test',onSaved:()=>{}});
await editorHarness.settle();
const declarationEditor=nodes(editorHarness.tree).find(n=>n.type==='Declarations');
assert.ok(!nodes(editorHarness.tree).some(n=>/^(barrel|frame|receiver) serial number$/.test(n.props?.label ?? '')),'Known serial is not a text-entry prompt');
assert.ok(nodes(editorHarness.tree).some(n=>n.props?.title==='BARREL'),'Component classification is offered');
assert.ok(declarationEditor,'The source application editor must expose the actual 271 declaration review');
declarationEditor.props.onConfirm({...client.saps271_declarations,confirmedAt:new Date().toISOString()});
await editorHarness.settle();
assert.deepEqual(client.saps271_declarations.answers,yes.answers,'YES details survive the actual application answer service');
assert.equal(client.saps271_declarations.applications.other.licenceTermConfirmed,'preserve');
const reloadedReadiness=await persistedLoad('src/services/applicationReadinessService.ts').getClientApplicationReadiness(client.id);
assert.equal(reloadedReadiness.cases[0].requirements.find(r=>r.key==='SAPS271_DECLARATIONS').state,'SATISFIED');
const reloadedAutofill=await persistedLoad('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage(client.id,applicationCase.id);
assert.equal(reloadedAutofill.issues.some(i=>i.key.startsWith('saps271Declaration.')),false);
assert.equal(reloadedAutofill.canGenerate,true);
assert.equal(reloadedAutofill.formFields.saps271Action,'MANUAL');
assert.equal(reloadedAutofill.formFields.saps271ReceiverSerial,'TEST');
assert.equal(reloadedAutofill.formFields.saps271SafeDetails,'Steel safe');
assert.equal(reloadedAutofill.formFields.saps271Purpose,'Sport shooting; Trap');
assert.deepEqual(client.saps271_declarations.applications[applicationCase.id],physicalAnswers,'New explicit answers survive the actual editor/service save');
for (const patch of [{prescribedSafe:null},{safeMounted:null},{saps271Firearm:{firearmId:'owned',action:'MANUAL'}},{saps271Firearm:{firearmId:'different',action:'MANUAL',receiverSerial:'TEST'}}]) {
  await answerService.saveApplicationFormAnswers({dealerId:'dealer-test',clientId:client.id,caseId:applicationCase.id,userId:'user-test',answers:{...physicalAnswers,...patch}});
  const fresh = await persistedLoad('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage(client.id,applicationCase.id);
  const readiness = (await persistedLoad('src/services/applicationReadinessService.ts').getClientApplicationReadiness(client.id)).cases[0];
  assert.equal(fresh.canGenerate,false,'Missing/stale firearm and safe answers block generation after reload');
  assert.equal(readiness.requirements.find(r=>r.key==='APPLICATION_FORM_ANSWERS').state,'MISSING');
  assert.equal(readiness.readyToGenerate,false);
  if ('prescribedSafe' in patch) assert.equal(fresh.formFields.saps271PrescribedSafe,'','NULL never becomes NO');
}
await answerService.saveApplicationFormAnswers({dealerId:'dealer-test',clientId:client.id,caseId:applicationCase.id,userId:'user-test',answers:physicalAnswers});
const savedPurpose = { primary_purpose:'Dedicated sport shooting', sport_discipline:'Trap', licence_section:'16' };
Object.assign(applicationCase,savedPurpose);
for (const context of ['PRIVATE_SELLER','DEALER','EXISTING_FIREARM']) {
  applicationCase.acquisition_source=context;
  const result=await persistedLoad('src/services/applicationReadinessService.ts').getClientApplicationReadiness(client.id);
  const evidence=result.cases[0].requirements.find(r=>r.key==='ACQUISITION_EVIDENCE');
  if(context==='EXISTING_FIREARM')assert.equal(evidence,undefined);
  else {assert.equal(evidence.required,true);assert.equal(evidence.state,'MISSING');}
  const filled=await persistedLoad('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage(client.id,applicationCase.id);
  assert.equal(filled.supplier===null,context==='EXISTING_FIREARM');
  for(const [key,value] of Object.entries(savedPurpose))assert.equal(applicationCase[key],value);
}
const licence={id:'existing-licence',client_id:client.id,firearm_id:'owned',licence_section:'13',licence_number:'TEST',issue_date:'2020-01-01',expiry_date:'2026-01-01'};
rows.firearm_licences=[licence];applicationCase.firearm_licence_id=licence.id;
const termKey=persistedLoad('src/utils/applicationFormAnswers.ts').licenceTermKey(licence);
await answerService.saveApplicationFormAnswers({dealerId:'dealer-test',clientId:client.id,caseId:applicationCase.id,userId:'user-test',answers:{...physicalAnswers,licenceTermConfirmed:termKey}});
assert.equal(client.saps271_declarations.applications[applicationCase.id].licenceTermConfirmed,termKey);
assert.equal((await persistedLoad('src/services/applicationReadinessService.ts').getClientApplicationReadiness(client.id)).cases[0].requirements.find(r=>r.key==='APPLICATION_FORM_ANSWERS').state,'SATISFIED');
assert.equal((await persistedLoad('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage(client.id,applicationCase.id)).canGenerate,true);
const missing=structuredClone(client.saps271_declarations);missing.answers.convictions.answer=null;
await assert.rejects(answerService.saveApplicationFormAnswers({dealerId:'dealer-test',clientId:client.id,caseId:applicationCase.id,userId:'user-test',answers:{},declarations:missing}),/Answer the declaration/);
await answerService.saveApplicationFormAnswers({dealerId:'dealer-test',clientId:client.id,caseId:applicationCase.id,userId:'user-test',answers:{},declarations:{...missing,confirmedAt:null}});
assert.equal(client.saps271_declarations.answers.convictions.answer,null);
assert.equal((await persistedLoad('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage(client.id,applicationCase.id)).canGenerate,false);
editorHarness.unmount();
// Actual generated-document registration -> reload -> stale -> regeneration -> confirmation.
await answerService.saveApplicationFormAnswers({dealerId:'dealer-test',clientId:client.id,caseId:applicationCase.id,userId:'user-test',answers:{...physicalAnswers,licenceTermConfirmed:termKey,saps271Firearm:{firearmId:'owned',action:'MANUAL',serialComponent:'RECEIVER'}},declarations:yes});
persistDb.storage={from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})};
const generation=persistedLoad('src/services/generatedApplicationDocumentService.ts');
const docs=persistedLoad('src/services/documentService.ts');
const freshData=()=>persistedLoad('src/services/applicationAutofillService.ts').buildApplicationAutofillPackage(client.id,applicationCase.id);
const readCase=async()=>(await persistedLoad('src/services/applicationReadinessService.ts').getClientApplicationReadiness(client.id)).cases[0];
const requirement=async()=>(await readCase()).requirements.find(r=>r.documentType==='FIREARM_LICENCE_APPLICATION_FORM');
const register=async()=>{const data=await freshData();return generation.archiveOfficialApplicationPdf({dealerId:'dealer-test',clientId:client.id,userId:'user-test',data,values:generation.createReviewValues(data),bytes:new Uint8Array([37,80,68,70])});};
assert.equal((await requirement()).generatedFormState,'NOT_GENERATED');
const first=await register();
assert.equal(first.owner_user_id,'user-test');assert.equal(first.record_scope,'PRIVATE');
assert.equal((await requirement()).generatedFormState,'AWAITING_REVIEW');
assert.equal((await requirement()).state,'UNVERIFIED');
assert.equal((await readCase()).status,'IN_PROGRESS');
assert.equal((await register()).id,first.id,'Accidental repeat registration reuses current source version');
await docs.setDocumentVerified(first.id,true,'user-test');
assert.equal((await requirement()).generatedFormState,'CONFIRMED');
assert.equal((await requirement()).state,'SATISFIED');
client.address_line_1='2 Corrected Street';
assert.equal((await requirement()).generatedFormState,'OUTDATED');
assert.equal((await requirement()).state,'PENDING_GENERATION');
await assert.rejects(docs.setDocumentVerified(first.id,true,'user-test'),/outdated|superseded/);
const second=await register();
assert.notEqual(first.id,second.id);assert.equal(second.parent_document_id,first.id);assert.equal(second.version_number,2);
assert.equal(second.application_case_id,applicationCase.id);assert.equal(rows.application_cases.length,1);
assert.equal(second.is_verified,false);assert.equal((await requirement()).documentId,second.id);
assert.equal((await requirement()).generatedFormState,'AWAITING_REVIEW');
await assert.rejects(docs.setDocumentVerified(first.id,true,'user-test'),/outdated|superseded/);
await docs.setDocumentVerified(second.id,true,'user-test');
assert.equal((await requirement()).generatedFormState,'CONFIRMED');
assert.equal(rows.documents.find(d=>d.id===first.id).is_verified,true,'Historical review record retained');
const statePolicy=persistedLoad('src/utils/saps271GeneratedState.ts');
assert.equal(statePolicy.saps271FormAction('OUTDATED'),'Regenerate SAPS 271');
assert.equal(statePolicy.saps271FormAction('AWAITING_REVIEW'),'Preview / Review SAPS 271');
const finalRequirements=(await readCase()).requirements;
for(const key of ['DEDICATED_STATUS','MEMBERSHIP_CERTIFICATE','MOTIVATION','SAFE_PHOTOS','SAFE_SECURING_PHOTOS']) assert.equal(finalRequirements.find(r=>r.key===key)?.required,true,key);
for (const type of ['MEMBERSHIP_CERTIFICATE','DEDICATED_STATUS']) {
  const evidence={id:`proof-${type}`,client_id:client.id,document_type:type,document_scope:'CLIENT',lifecycle_status:'ACTIVE',is_verified:true,metadata:{},created_at:new Date().toISOString()};
  rows.documents.push(evidence);
  assert.equal((await readCase()).requirements.find(r=>r.key===type).state,'UNVERIFIED','Unknown validity cannot satisfy current evidence');
  evidence.expiry_date='2000-01-01';assert.equal((await readCase()).requirements.find(r=>r.key===type).state,'EXPIRED');
  evidence.expiry_date='2099-01-01';assert.equal((await readCase()).requirements.find(r=>r.key===type).state,'SATISFIED');
}
console.log('PASS: SAPS 271 canonical serial classification, private same-case regeneration/history, stale confirmation denied, fresh review required, source reload and current Section 16 evidence requirements.');
// Exercise the existing screen against each generated-form requirement state.
for (const [generatedFormState,state] of [['NOT_GENERATED','PENDING_GENERATION'],['AWAITING_REVIEW','UNVERIFIED'],['OUTDATED','PENDING_GENERATION'],['CONFIRMED','SATISFIED']]) {
  const viewCase={...(await readCase()),readyToGenerate:state==='SATISFIED',requirements:[{...(await requirement()),state,generatedFormState,documentId:generatedFormState==='NOT_GENERATED'?undefined:second.id}]};
  const h=hookHarness(), navigations=[];
  const screenLoad=loader({'../lib/supabase':{supabase:persistDb},react:h.react,'react-native':nativeMock,
    'lucide-react-native':new Proxy({},{get:(_,key)=>String(key)}),
    '../components/Button':'Button','../components/Card':'Card','../components/Screen':'Screen','../components/TextField':'TextField','../components/intelligence/ReadOnlyIntelligencePanel':'IntelligencePanel',
    '../context/AuthContext':{useAuth:()=>({dealerProfile:{dealerId:'dealer-test'},user:{id:'user-test'}})},
    '../services/applicationReadinessService':{getClientApplicationReadiness:async()=>({clientId:client.id,cases:[viewCase]})},
    '../services/documentService':{...docs,listClientDocuments:async()=>generatedFormState==='NOT_GENERATED'?[]:structuredClone(rows.documents)},
    '../services/applicationCaseService':{getApplicationCase:async()=>applicationCase},
    '../services/applicationDocumentSuggestionService':{suggestApplicationDocuments:async()=>({suggestions:[]})},
    '../services/applicationWorkspaceService':{getApplicationWorkspaceMeta:async()=>({status:'NOT_STARTED',progressPercent:0}),listApplicationWorkspaceEvents:async()=>[]},
  });
  h.mount(screenLoad('src/screens/ApplicationReadinessScreen.tsx').default,{navigation:{addListener:()=>()=>{},navigate:(...args)=>navigations.push(args)},route:{params:{clientId:client.id,applicationCaseId:applicationCase.id}}});
  await h.settle();
  const labels=node=>nodes(node).map(n=>n.props?.children).filter(v=>typeof v==='string');
  const workflow=nodes(h.tree).find(n=>n.props?.title==='Guided application workflow');
  const step=nodes(workflow).find(n=>n.type==='Pressable'&&labels(n).includes('SAPS forms'));
  assert.ok(step);assert.equal(labels(step).includes('Complete'),state==='SATISFIED','Only confirmed current 271 completes SAPS Forms');
  const action=nodes(h.tree).find(n=>n.type==='Button'&&n.props?.title===statePolicy.saps271FormAction(generatedFormState));
  assert.ok(action,generatedFormState);action.props.onPress();
  assert.equal(navigations.at(-1)[0],state==='PENDING_GENERATION'?'ApplicationAutofill':'DocumentLibrary');
  if(state!=='PENDING_GENERATION')assert.equal(navigations.at(-1)[1].openUpload,false);
  assert.ok(!nodes(h.tree).some(n=>n.type==='Button'&&n.props?.title==='Upload or replace'));
  assert.ok(labels(h.tree).includes('IN PROGRESS'));
  h.unmount();
}
console.log('PASS: generated SAPS 271 UI Generate/Review/Regenerate/Confirmed states, no Upload-or-replace primary action, truthful progress status.');
console.log('R09 passed: existing application editor confirmation persists canonical answers and YES details; fresh readiness and AutoFill clear the blocker and allow generation; unknowns stay blocked; existing declaration/mapping regressions pass.');
