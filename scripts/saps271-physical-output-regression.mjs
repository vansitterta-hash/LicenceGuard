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
for (const answer of Object.values(profile.answers)) answer.answer = 'NO';
profile.answers.convictions = {answer:'YES',incidents:[{policeStation:'Test station',caseNumber:'TEST-1',charge:'Test charge',outcome:'Test outcome'}]};
profile.saps517 = {...load('src/utils/saps517Applicant.ts').emptySaps517ApplicantData(),citizenshipChoice:'SA_CITIZEN',postalAddressSameAsResidential:'NO',postalAddress:'PO Box 123',postalLocality:'Test Town',postalAddressPostalCode:'0002',maritalStatus:'SINGLE',residenceDescription:'House',occupation:'Engineer',employmentStatus:'EMPLOYED',employerName:'Test Engineering',businessAddress:'2 Test Road',businessPostalCode:'0003',workTelephone:'0123456789',faxNumber:'0123456780'};
const data = {
  saps271Declarations:profile,formFields:{},
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
  assert.ok(!draws.some(d=>d.page===2&&d.y===354),'Unknown shotgun action is blank');
  assert.ok(!draws.some(d=>d.value==='1165306'),'Generic serial must not be assigned to an unknown component');
  at(5,383,435.6,'X');at(5,383,417.54,'X');at(5,182,399.42,'TEST-COMP-123');
  assert.equal(draws.filter(d=>d.page===5&&d.y===381.3&&d.x<300).map(d=>d.value).join(''),'20200203');
  assert.equal(draws.filter(d=>d.page===5&&d.y===381.3&&d.x>369).map(d=>d.value).join(''),'20300203');
  at(6,125,468.84,'X');at(6,125,432.6,'EXAMPLE');at(6,125,414.54,'Test Applicant');
  at(6,142,378.3,'1 Test Street');at(6,48,360.18,'Test Suburb, Test City, Gauteng');
  at(6,142,342.06,'PO Box 123');at(6,166,269.58,'Test Engineering');
  at(6,465,215.22,'0123456789');at(6,465,197.1,'0123456780');
  assert.equal(draws.filter(d=>d.page===6&&d.y===450.72).map(d=>d.value).join(''),'8001015009087');
  assert.ok(draws.filter(d=>d.page===6).every(d=>d.y<482.34),'No applicant values in possession table');
  assert.ok(draws.every(d=>[2,5,6,8,9].includes(d.page)),'Official/signature pages stay blank');
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
  await render(unknown);
  assert.ok(!draws.some(d=>[5,8,9].includes(d.page)),'Unknown declarations and competency stay blank');
  assert.ok(!draws.some(d=>d.page===6&&[468.84,450.72,396.42,123.9].includes(d.y)),'Unknown identity/citizenship/marital status stay blank');
  assert.equal(digest(readFileSync(path)),digest(pinned));
  console.log('PASS: SAPS 271 pinned 12-page real PDF, measured sections/firearm/competency/applicant geometry, acquisition isolation, unknown values, unchanged declarations and protected pages. Artifact: .tmp/saps271-physical-output-test.pdf');
} finally {globalThis.fetch=oldFetch;}
