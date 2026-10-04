import { complete517Data } from './saps517-test-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loader } from './beta-test-support.mjs';

const completeDeclarations = () => ({
  confirmedAt: '2026-09-10T10:00:00.000Z',
  answers: {
    convictions: { answer: 'YES', incidents: [{ policeStation: 'Camperdown', caseNumber: 'CAS-1', charge: 'Example charge', outcome: 'Finalised' }] },
    pendingCases: { answer: 'NO', incidents: [] },
    lostStolen: { answer: 'NO', incidents: [] },
    negligence: { answer: 'NO', incidents: [] },
    unfitness: { answer: 'NO', incidents: [] },
    confiscation: { answer: 'NO', incidents: [] },
  },
});

const applicationTypeFor = (formCode) => ({
  SAPS_517: 'COMPETENCY_FIRST_APPLICATION',
  SAPS_517_A: 'COMPETENCY_ADDITIONAL_CATEGORY',
  SAPS_517_G: 'COMPETENCY_RENEWAL',
  SAPS_518_A: 'FIREARM_LICENCE_RENEWAL',
}[formCode]);

const dataFor = (formCode = 'SAPS_517') => ({
  saps271Declarations: completeDeclarations(),
  generatedAt: '2026-09-19T10:00:00.000Z',
  canGenerate: true,
  issues: [],
  blockingIssueCount: 0,
  warningCount: 0,
  applicant: {
    fullName: 'André van Sittert', firstName: 'André', surname: 'van Sittert',
    idNumber: '8001015009087', cellphone: '0123456789', alternateCellphone: '',
    email: 'andre@example.test', residentialAddress: '1 Example Road', suburb: 'Example',
    city: 'Example City', province: 'KwaZulu-Natal', postalCode: '0001',
  },
  application: {
    applicationCaseId: 'synthetic-spatial-regression',
    applicationType: applicationTypeFor(formCode),
    applicationTypeLabel: 'Competency', formCode, formLabel: formCode,
    policeStation: 'Camperdown', applicationReference: 'INTERNAL-REFERENCE',
    openedDate: '2026-09-13', targetSubmissionDate: '', motivationSummary: '',
  },
  firearm: formCode === 'SAPS_518_A' ? {
    make: 'Example Make', model: 'Example Model', calibre: '9mm', serialNumber: 'SERIAL-1',
    licenceSection: '13', licenceNumber: 'LICENCE-1', licenceIssueDate: '2021-02-03', licenceExpiryDate: '2026-02-03',
  } : null,
  supplier: null,
  competency: { category: 'HANDGUN', certificateNumber: 'CERT-1', issueDate: '2020-01-02', expiryDate: '2030-01-02' },
});

const reviewValues = (data) => ({
  policeStation: data.application.policeStation,
  applicationReference: data.application.applicationReference,
  motivationSummary: '', firstName: data.applicant.firstName, surname: data.applicant.surname,
  idNumber: data.applicant.idNumber, cellphone: data.applicant.cellphone, alternateCellphone: '',
  email: data.applicant.email, residentialAddress: data.applicant.residentialAddress,
  suburb: data.applicant.suburb, city: data.applicant.city, province: data.applicant.province,
  postalCode: data.applicant.postalCode, firearmMake: '', firearmModel: '', calibre: '',
  serialNumber: '', licenceSection: '', licenceNumber: '', competencyCategory: data.competency.category,
  competencyCertificateNumber: data.competency.certificateNumber, supplierName: '', supplierIdOrRegistration: '',
  supplierContact: '', supplierLicenceNumber: '', saleOrInvoiceReference: '',
});

const draws = [];
const pdfLibMock = {
  PDFDocument: { async load() { return {
    async embedFont() { return { widthOfTextAtSize: (value) => Array.from(value).length * 4 }; },
    getPages() { return Array.from({ length: 12 }, (_, page) => ({ drawText(value, options) { draws.push({ page: page + 1, value, ...options }); } })); },
    setTitle() {}, setAuthor() {}, setSubject() {}, setProducer() {}, async save() { return new Uint8Array([1]); },
  }; } },
  StandardFonts: { Helvetica: 'Helvetica' },
  rgb: () => 0,
};
const load = loader({ 'pdf-lib': pdfLibMock, 'pdf-lib/cjs/index.js': pdfLibMock });
const renderer = load('src/engines/pdfTemplateRenderer.ts');
const layouts = load('src/data/documentLayoutDefinitions.ts').DOCUMENT_LAYOUT_DEFINITIONS;
const { validateDocumentLayout } = load('src/engines/documentLayoutEngine.ts');
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });

try {
  for (const layout of layouts) assert.deepEqual(validateDocumentLayout(layout).issues, []);
  const data = dataFor();
  await renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_517' }, context: { data, reviewValues: reviewValues(data) } });

  const idDigits = draws.filter((draw) => draw.page === 2 && draw.y === 590);
  assert.equal(idDigits.length, 13);
  assert.equal(idDigits.map((draw) => draw.value).join(''), data.applicant.idNumber);
  assert.ok(idDigits.every((draw) => draw.value.length === 1));
  assert.ok(idDigits[6].x - idDigits[5].x > idDigits[5].x - idDigits[4].x, 'printed ID separator must remain unused');
  assert.ok(idDigits[10].x - idDigits[9].x > idDigits[9].x - idDigits[8].x, 'second printed ID separator must remain unused');
  assert.ok(idDigits[12].x - idDigits[11].x > idDigits[11].x - idDigits[10].x, 'third printed ID separator must remain unused');

  const postalDigits = draws.filter((draw) => draw.page === 2 && draw.y === 482 && draw.x >= 483.6);
  assert.equal(postalDigits.map((draw) => draw.value).join(''), '0001');
  assert.ok(postalDigits.every((draw) => draw.value.length === 1));

  assert.ok(!draws.some((draw) => ['INTERNAL-REFERENCE', '2026-09-13'].includes(draw.value)), 'protected official-use values must not render');
  assert.ok(!draws.some((draw) => draw.page === 1 && ['KwaZulu-Natal', 'Camperdown'].includes(draw.value)), 'SAPS-only routing fields must stay blank');
  assert.ok(!layouts.find((layout) => layout.templateCode === 'SAPS_517').elements.some((element) => /saps.?86|register-reference|date-received/i.test(`${element.id} ${element.fieldId}`)));
  const s517OfficialRouting = layouts.find((layout) => layout.templateCode === 'SAPS_517').elements.filter((element) => ['s517-province', 's517-police-station'].includes(element.id));
  assert.equal(s517OfficialRouting.length, 0, 'official-use mappings removed entirely');
  assert.ok(draws.some((draw) => draw.page === 2 && draw.value === 'andre@example.test' && draw.x >= 162));
  assert.ok(draws.some((draw) => draw.page === 6 && draw.value === 'ANDRÉ VAN SITTERT' && draw.x >= 46 && draw.x + 17 * 4 <= 217));
  assert.ok(draws.some((draw) => draw.page === 2 && draw.value === 'X' && draw.x === 184), 'Handgun mapping must remain intact');

  assert.ok(draws.some((draw) => draw.page === 3 && draw.value === 'X' && draw.x === 128 && draw.y === 234), 'stored YES must mark YES');
  assert.ok(draws.some((draw) => draw.page === 4 && draw.value === 'X' && draw.x === 224 && draw.y === 780), 'stored NO must mark NO');
  assert.ok(draws.some((draw) => draw.page === 3 && draw.value === 'CAS-1'));
  assert.ok(!draws.some((draw) => draw.value === 'undefined'));

  for (const [category, x] of [['RIFLE', 292], ['SHOTGUN', 386]]) {
    draws.length = 0;
    const categoryData = dataFor();
    categoryData.competency.category = category;
    await renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_517' }, context: { data: categoryData, reviewValues: reviewValues(categoryData) } });
    assert.ok(draws.some((draw) => draw.page === 2 && draw.value === 'X' && draw.x === x), `${category} mapping must remain intact`);
  }

  draws.length = 0;
  const unanswered = dataFor();
  unanswered.saps271Declarations.answers.pendingCases.answer = 'NOT_ANSWERED';
  await renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_517' }, context: { data: unanswered, reviewValues: reviewValues(unanswered) } });
  assert.ok(!draws.some((draw) => draw.page === 4 && draw.value === 'X' && draw.y === 780), 'unanswered must mark neither option');

  draws.length = 0;
  const additional = dataFor('SAPS_517_A');
  await renderer.renderOfficialPdfTemplate({ template: { code: 'SAPS_517_A' }, context: { data: additional, reviewValues: reviewValues(additional) } });
  const issueDate = draws.filter((draw) => draw.page === 2 && draw.y === 177 && draw.x < 350);
  const expiryDate = draws.filter((draw) => draw.page === 2 && draw.y === 177 && draw.x > 350);
  assert.equal(issueDate.map((draw) => draw.value).join(''), '20200102');
  assert.equal(expiryDate.map((draw) => draw.value).join(''), '20300102');
  assert.ok(draws.some((draw) => draw.page === 2 && draw.value === '0123456789' && draw.y === 416));
  assert.ok(draws.some((draw) => draw.page === 2 && draw.value === 'andre@example.test' && draw.y === 398));
  assert.ok(draws.some((draw) => draw.page === 2 && draw.value === 'HANDGUN' && draw.y === 213));
  assert.ok(draws.some((draw) => draw.page === 2 && draw.value === 'CERT-1' && draw.y === 195));
  assert.ok(draws.some((draw) => draw.page === 3 && draw.value === 'X' && draw.x === 128 && draw.y === 744));

  for (const code of ['SAPS_517', 'SAPS_517_A', 'SAPS_517_G', 'SAPS_518_A']) {
    const layout = layouts.find((item) => item.templateCode === code);
    if (code === 'SAPS_517') {
      assert.ok(!layout.elements.some((item) => item.page === 1), 'SAPS 517 official-use page has no mappings');
      continue;
    }
    assert.ok(layout.elements.find((item) => item.id.endsWith('application-reference'))?.autofillPolicy === 'PROTECTED_OFFICIAL');
    assert.ok(layout.elements.find((item) => item.id.endsWith('opened-date'))?.autofillPolicy === 'PROTECTED_OFFICIAL');
    const province = layout.elements.find((item) => item.id.endsWith('province'));
    const station = layout.elements.find((item) => item.id.endsWith('police-station'));
    if (code === 'SAPS_517') {
      assert.equal(province?.autofillPolicy, 'PROTECTED_OFFICIAL');
      assert.equal(station?.autofillPolicy, 'PROTECTED_OFFICIAL');
    } else {
      assert.equal(province?.autofillPolicy, 'ROUTING');
      assert.equal(station?.autofillPolicy, 'ROUTING');
    }
  }
  assert.ok(!layouts.some((layout) => layout.elements.some((element) => /saps.?86|register-reference|date-received/i.test(element.id))));
} finally {
  globalThis.fetch = previousFetch;
}

const artifactDirectory = mkdtempSync(join(tmpdir(), 'licenceguard-saps-autofill-'));
const realLoad = loader({ '../lib/supabase': { supabase: {} } });
const service = realLoad('src/services/generatedApplicationDocumentService.ts');
globalThis.fetch = async (url) => new Response(readFileSync(`public${url}`), { headers: { 'content-type': 'application/pdf' } });
try {
  for (const code of ['SAPS_517', 'SAPS_517_A', 'SAPS_517_G', 'SAPS_518_A']) {
    const data = dataFor(code);
    if (code === 'SAPS_517') complete517Data(data);
    const bytes = await service.generateOfficialApplicationPdf(data, service.createReviewValues(data));
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
    writeFileSync(join(artifactDirectory, `${code}_spatial_regression.pdf`), bytes);
  }
} finally {
  globalThis.fetch = previousFetch;
}

console.log(`PASS: boxed IDs/postal codes/dates, email and block-name geometry, questionnaire tri-state mapping, protected official fields, and routing fields. Artifacts: ${artifactDirectory}`);
