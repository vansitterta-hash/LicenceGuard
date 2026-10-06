import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pdfLib from 'pdf-lib/cjs/index.js';
import { loader } from './beta-test-support.mjs';

const path = 'public/saps-templates/SAPS_271_EN_OFFICIAL.pdf';
const pinned = readFileSync(path);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(pinned), '0d1a74484ab5831db8ebf4b0d11bf8b18e6c9e26b3e4c38631bfec6959e82bdd');
let draws = [];
const wrapped = { ...pdfLib, PDFDocument: { async load(bytes) {
  const pdf = await pdfLib.PDFDocument.load(bytes);
  pdf.getPages().forEach((page, index) => {
    const original = page.drawText.bind(page);
    page.drawText = (value, options) => { draws.push({page:index+1,value,x:options.x,y:options.y}); original(value, options); };
  });
  return pdf;
} } };
const load = loader({'pdf-lib/cjs/index.js':wrapped, '../lib/supabase':{supabase:{}}});
const renderer = load('src/engines/pdfTemplateRenderer.ts');
const service = load('src/services/generatedApplicationDocumentService.ts');
const policy = load('src/utils/saps271Declarations.ts');
const profile = policy.emptySaps271Declarations();
const formPolicy = load('src/utils/applicationFormAnswers.ts');
const caseRecord = {id:'synthetic-test',application_type:'FIREARM_LICENCE_FIRST_APPLICATION',firearm_id:'test-firearm',licence_section:'16',primary_purpose:'Dedicated sport shooting',sport_discipline:'Skeet and bird hunting',sport_association:'South African Hunters and Game Conservation Association'};
const firearmRecord = {id:'test-firearm',model:'Stored model',serial_number:'1165306'};
const explicitAnswers = {saps271Firearm:{firearmId:'test-firearm',action:'MANUAL',receiverSerial:'1165306',barrelSerial:'TEST-BARREL',frameSerial:'TEST-FRAME'},associationMember:'YES',associationFar:'TEST123',associationNumber:'MEM123',associationJoined:'2020-01-02',associationExpiry:'2027-01-02',prescribedSafe:'YES',safeType:'RIFLE',safeDetails:'Steel rifle safe',safeMounted:'YES',safeMountings:['WALL','FLOOR']};
profile.applications = {[caseRecord.id]:explicitAnswers};
const evaluate = (answers=explicitAnswers, app=caseRecord, firearm=firearmRecord) => formPolicy.evaluateApplicationForm({application:app,firearm,competencies:[],profile:{...profile,applications:{[app.id]:answers}}});
assert.deepEqual(evaluate().issues,[]);
for (const [component,key] of [['RECEIVER','ReceiverSerial'],['BARREL','BarrelSerial'],['FRAME','FrameSerial']]) {
  const result=evaluate({...explicitAnswers,saps271Firearm:{firearmId:'test-firearm',action:'MANUAL',serialComponent:component}});
  assert.deepEqual(result.issues,[]);
  for(const candidate of ['BarrelSerial','FrameSerial','ReceiverSerial']) assert.equal(result.fields[`saps271${candidate}`],candidate===key?'1165306':'');
}
assert.ok(evaluate({...explicitAnswers,saps271Firearm:{firearmId:'test-firearm',action:'MANUAL'}}).issues.length,'Missing classification blocks; never guess');
for (const answer of Object.values(profile.answers)) answer.answer = 'NO';
profile.answers.convictions = {answer:'YES',incidents:[{policeStation:'Test station',caseNumber:'TEST-1',charge:'Test charge',outcome:'Test outcome'}]};
profile.saps517 = {...load('src/utils/saps517Applicant.ts').emptySaps517ApplicantData(),citizenshipChoice:'SA_CITIZEN',postalAddressSameAsResidential:'NO',postalAddress:'PO Box 123',postalLocality:'Test Town',postalAddressPostalCode:'0002',maritalStatus:'SINGLE',residenceDescription:'House',occupation:'Engineer',employmentStatus:'EMPLOYED',employerName:'Test Engineering',businessAddress:'2 Test Road',businessPostalCode:'0003',workTelephone:'0123456789',faxNumber:'0123456780'};
const data = {
  saps271Declarations:profile,formFields:evaluate().fields,
  applicant:{firstName:'Test Applicant',surname:'Example',fullName:'Test Applicant Example',idNumber:'8001015009087',cellphone:'0821234567',email:'example@example.test',residentialAddress:'1 Test Street',suburb:'Test Suburb',city:'Test City',province:'Gauteng',postalCode:'0001'},
  application:{formCode:'SAPS_271',applicationType:'FIREARM_LICENCE_NEW',applicationCaseId:'synthetic-test',policeStation:'Test station',applicationReference:'TEST',openedDate:'2026-10-05'},
  firearm:{firearmType:'SHOTGUN',make:'CZ',model:'Stored model',calibre:'12 bore',serialNumber:'1165306',licenceSection:'16'},
  competency:{category:'SHOTGUN',certificateNumber:'TEST-COMP-123',issueDate:'2020-02-03',expiryDate:'2030-02-03'},supplier:null,
};
const oldFetch = globalThis.fetch;
globalThis.fetch = async url => {assert.equal(url,'/saps-templates/SAPS_271_EN_OFFICIAL.pdf');return {ok:true,arrayBuffer:async()=>pinned};};
async function render(input=data, edits={}) {
  draws=[];
  return renderer.renderOfficialPdfTemplate({template:{code:'SAPS_271'},context:{data:input,reviewValues:{...service.createReviewValues(input),...edits}}});
}
const at = (page,x,y,value) => assert.ok(draws.some(d=>d.page===page&&d.x===x&&d.y===y&&d.value===value),JSON.stringify({page,x,y,value}));
try {
  const bytes = await render(data,{supplierName:'N/A',supplierIdOrRegistration:'N/A',supplierContact:'N/A',supplierLicenceNumber:'N/A'});
  assert.equal((await pdfLib.PDFDocument.load(bytes)).getPageCount(),12);
  at(2,538,674.28,'X'); at(2,278,446,'X');
  at(2,199,272.1,'12 bore');at(2,199,253.98,'CZ');at(2,199,235.86,'Stored model');
  assert.ok(!draws.some(d=>d.value==='SHOTGUN'||d.value==='N/A'));
  assert.ok(!draws.some(d=>d.page===3),'Existing firearm has no transaction overlay');
  at(2,548,354,'X');at(2,199,163.38,'1165306');at(2,199,199.62,'TEST-BARREL');at(2,199,181.5,'TEST-FRAME');
  at(7,337,223.02,'X');at(7,202,204.9,caseRecord.sport_association);at(7,145,168.66,'MEM123');
  at(7,48,105,'Dedicated sport shooting; Skeet and bird hunting');
  assert.equal(draws.filter(d=>d.page===7&&d.y===186.78).map(d=>d.value).join(''),'TEST123');
  assert.equal(draws.filter(d=>d.page===7&&d.y===168.66&&d.x>369).map(d=>d.value).join(''),'20200102');
  assert.equal(draws.filter(d=>d.page===7&&d.y===150.54).map(d=>d.value).join(''),'20270102');
  at(9,126,738.48,'X');at(9,336,701.88,'X');at(9,351,701.88,'Steel rifle safe');
  at(9,126,629.04,'X');at(9,126,592.08,'X');at(9,224,592.08,'X');
  at(5,383,435.6,'X');at(5,383,417.54,'X');at(5,182,399.42,'TEST-COMP-123');
  assert.equal(draws.filter(d=>d.page===5&&d.y===381.3&&d.x<300).map(d=>d.value).join(''),'20200203');
  assert.equal(draws.filter(d=>d.page===5&&d.y===381.3&&d.x>369).map(d=>d.value).join(''),'20300203');
  at(6,125,468.84,'X');at(6,125,432.6,'EXAMPLE');at(6,125,414.54,'Test Applicant');
  at(6,142,378.3,'1 Test Street');at(6,48,360.18,'Test Suburb, Test City, Gauteng');
  at(6,142,342.06,'PO Box 123');at(6,166,269.58,'Test Engineering');
  at(6,465,215.22,'0123456789');at(6,465,197.1,'0123456780');
  assert.equal(draws.filter(d=>d.page===6&&d.y===450.72).map(d=>d.value).join(''),'8001015009087');
  assert.ok(draws.filter(d=>d.page===6).every(d=>d.y<482.34),'No applicant values in possession table');
  assert.ok(draws.every(d=>[2,5,6,7,8,9].includes(d.page)),'Official pages stay blank');
  assert.ok(draws.filter(d=>d.page===9).every(d=>d.y>=592.08),'Signature/photo area stays blank');
  const declarationElements=load('src/data/saps271DeclarationMapping.ts').SAPS271_DECLARATION_ELEMENTS;
  const layout=load('src/data/documentLayoutDefinitions.ts').DOCUMENT_LAYOUT_DEFINITIONS.find(l=>l.templateCode==='SAPS_271');
  assert.deepEqual(layout.elements.filter(e=>e.fieldId.startsWith('applicant.declarations.')),declarationElements);
  assert.ok(draws.some(d=>d.page===8&&d.value==='X'));
  mkdirSync('.tmp',{recursive:true});writeFileSync('.tmp/saps271-physical-output-test.pdf',bytes);
  writeFileSync('.tmp/saps271-physical-output-draws.json',JSON.stringify(draws,null,2));
  for (const [section,y] of [['13',726.48],['14',709.08],['15',691.68],['16',674.28],['17',656.88],['19',639.48]]) {
    await render(data,{licenceSection:section});at(2,538,y,'X');
    assert.equal(draws.filter(d=>d.page===2&&d.x===538).length,1);
  }
  for (const source of ['DEALER','PRIVATE_SELLER']) {
    await render({...data,supplier:{acquisitionSource:source,name:'Real supplier',idOrRegistration:'8001015009087',contact:'0123456789'}});
    at(3,source==='DEALER'?182:125,source==='DEALER'?502.32:748.56,'Real supplier');
  }
  await render({...data,firearm:{...data.firearm,model:'',firearmType:'BOLT_ACTION_RIFLE'}},{competencyCategory:'HANDGUN'});
  at(2,160,446,'X');at(2,548,354,'X');at(5,181,417.54,'X');
  assert.ok(!draws.some(d=>d.page===2&&d.y===235.86),'No invented model');
  assert.ok(!draws.some(d=>d.page===5&&d.x===383&&d.y===417.54),'Competency category is independent of firearm type');
  const unknown=structuredClone(data);unknown.saps271Declarations=policy.emptySaps271Declarations();unknown.applicant.idNumber='';unknown.competency=null;
  unknown.formFields=evaluate({}).fields;
  await render(unknown);
  assert.ok(!draws.some(d=>[5,8,9].includes(d.page)),'Unknown declarations and competency stay blank');
  assert.ok(!draws.some(d=>d.page===6&&[468.84,450.72,396.42,123.9].includes(d.y)),'Unknown identity/citizenship/marital status stay blank');
  assert.ok(!draws.some(d=>d.page===2&&[354,199.62,181.5,163.38].includes(d.y)),'Unknown action/component serials are never inferred');
  for (const patch of [{saps271Firearm:undefined},{associationMember:null},{associationFar:''},{associationJoined:''},{prescribedSafe:null},{safeDetails:''},{safeMounted:null},{safeMountings:[]}]) assert.ok(evaluate({...explicitAnswers,...patch}).issues.length,JSON.stringify(patch));
  assert.ok(evaluate(explicitAnswers,{...caseRecord,primary_purpose:null,sport_discipline:null}).issues.length);
  assert.ok(evaluate(explicitAnswers,caseRecord,{...firearmRecord,model:''}).issues.length);
  assert.ok(evaluate(explicitAnswers,{...caseRecord,firearm_id:'different'}).issues.length,'Changing firearm invalidates supplemental facts');
  assert.deepEqual(evaluate({...explicitAnswers,saps271Firearm:{...explicitAnswers.saps271Firearm,modelNotMarked:true}},caseRecord,{...firearmRecord,model:''}).issues,[]);
  const no = evaluate({...explicitAnswers,prescribedSafe:'NO',safeMounted:'NO',associationMember:'NO'});
  assert.deepEqual(no.issues,[]);await render({...data,formFields:no.fields});at(9,223,738.48,'X');at(9,223,629.04,'X');at(7,394,223.02,'X');
  assert.ok(!draws.some(d=>d.page===9&&[701.88,683.76,665.64,592.08].includes(d.y)),'NO hides stale conditional details');
  assert.equal(digest(readFileSync(path)),digest(pinned));
  console.log('PASS: SAPS 271 pinned 12-page real PDF, measured sections/firearm/competency/applicant geometry, acquisition isolation, unknown values, unchanged declarations and protected pages. Artifact: .tmp/saps271-physical-output-test.pdf');
} finally {globalThis.fetch=oldFetch;}
