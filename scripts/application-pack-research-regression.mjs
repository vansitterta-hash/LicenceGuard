import assert from 'node:assert/strict';
import { loader } from './beta-test-support.mjs';

const sourceDocument = {
  id: 'research-doc', dealer_id: 'dealer-1', client_id: 'client-1', competency_id: null,
  firearm_id: 'firearm-1', firearm_licence_id: null, application_case_id: 'case-1', parent_document_id: null,
  document_type: 'SUPPORTING_RESEARCH', document_scope: 'APPLICATION_CASE', lifecycle_status: 'ACTIVE',
  document_name: '20 gauge archive research', document_date: null, expiry_date: null, issued_by: null,
  reference_number: null, version_number: 1, storage_path: 'dealer/client/research.docx',
  file_name: 'research.docx', original_file_name: 'research.docx',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  file_size_bytes: 100, checksum_sha256: null, is_verified: false, is_generated: false,
  generated_from_template_id: null, archived_at: null, archived_by: null, archive_reason: null,
  notes: null, uploaded_by: 'user-1', verified_at: null, verified_by: null,
  created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z',
  metadata: {
    source: 'REFERENCE_LIBRARY',
    sourceTitle: 'Winchester Model 1912',
    sourcePublisher: 'Successful application archive',
    sourceUrl: '/Firearm%20and%20Calibre%20Research/20Ga/Winchester.docx',
    researchSource: {
      title: 'Winchester Model 1912', publisher: null,
      url: '/Firearm%20and%20Calibre%20Research/20Ga/Winchester.docx',
      retrievalDate: null, trustLevel: 'UNREVIEWED',
    },
    researchContext: {
      provider: 'LOCAL_REFERENCE_LIBRARY', discipline: 'trap',
      association: 'Sport Association', accessedAt: '2026-10-01T10:00:00.000Z',
      firearm: { make: 'Winchester', model: 'Model 1912', calibre: '20 gauge' },
    },
  },
};
const applicationCase = {
  id: 'case-1', client_id: 'client-1', application_type: 'FIREARM_LICENCE_FIRST_APPLICATION',
  status: 'READY_FOR_SUBMISSION', competency_id: null, firearm_id: 'firearm-1',
  firearm_licence_id: null, licence_section: '15', subjectDescription: 'Winchester 20 gauge',
};
const manifest = {
  generatedAt: '2026-10-01T10:00:00.000Z', clientId: 'client-1', clientName: 'Test Applicant',
  clientIdNumber: '0000000000000', applicationCaseId: 'case-1', applicationType: applicationCase.application_type,
  applicationTypeLabel: 'Firearm licence application', caseStatus: applicationCase.status,
  subject: applicationCase.subjectDescription, licenceSection: '15', packState: 'READY', readinessScore: 100,
  totalItems: 1, completeItems: 0, missingItems: 0, warningItems: 1, blockingReasons: [],
  items: [{ key: 'SUPPORTING_RESEARCH', order: 1, label: 'Firearm or calibre research',
    detail: 'Optional supporting research.', required: false, delivery: 'DIGITAL', state: 'UNVERIFIED',
    documentType: 'SUPPORTING_RESEARCH', document: sourceDocument }],
};
const storedDocuments = [];
const drawnText = [];
let sequence = 0;
const queryDb = {
  from(table) {
    let action = 'select';
    let payload = null;
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(record => record[key] === value); return query; },
      order() { return query; },
      limit() { return query; },
      insert(value) { action = 'insert'; payload = value; return query; },
      update(value) { action = 'update'; payload = value; return query; },
      single() {
        if (action === 'select') return Promise.resolve({ data: storedDocuments.find(record => filters.every(f => f(record))), error: null });
        const record = { ...payload, id: `generated-${++sequence}`, created_at: new Date().toISOString() };
        if (table === 'documents') storedDocuments.push(record);
        return Promise.resolve({ data: record, error: null });
      },
      then(resolve, reject) {
        if (action === 'insert' && table === 'documents') storedDocuments.push({ ...payload, id: `generated-${++sequence}`, created_at: new Date().toISOString() });
        const data = action === 'select' ? [] : payload;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
};
const pdfPage = {
  drawText(value) { drawnText.push(String(value)); },
  drawRectangle() {},
  drawImage() {},
};
const pdfLib = {
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
  rgb: () => ({}),
  PDFDocument: {
    async create() {
      return {
        async embedFont() { return { widthOfTextAtSize: (value) => value.length * 4 }; },
        async embedPng() { return { width: 100, height: 100 }; },
        addPage() { return pdfPage; },
        async copyPages() { return [pdfPage]; },
        async save() { return new TextEncoder().encode('%PDF-research-pack'); },
      };
    },
    async load() { return { getPageIndices: () => [0] }; },
  },
};
const loaded = loader({
  '../lib/supabase': { supabase: queryDb },
  '../utils/unsupportedApplicationTypePolicy': { assertApplicationTypeSupportedInBeta() {} },
  '../utils/applicationPackPolicy': { assertRequiredDigitalDocumentMerged() {} },
  './applicationReadinessService': { getClientApplicationReadiness: async () => ({ cases: [{
    caseId: 'case-1', applicationType: applicationCase.application_type, status: 'READY_FOR_SUBMISSION',
    subject: applicationCase.subjectDescription, score: 100, state: 'READY', requirements: [{
      key: 'SUPPORTING_RESEARCH', label: 'Firearm or calibre research', detail: 'Optional supporting research.',
      documentType: 'SUPPORTING_RESEARCH', required: false, delivery: 'DIGITAL', state: 'UNVERIFIED',
    }],
  }] }) },
  './applicationCaseService': { getApplicationCase: async () => applicationCase },
  './clientService': { getClient: async () => ({ first_name: 'Test', surname: 'Applicant', id_number: '0000000000000' }) },
  './documentService': {
    createDocumentSignedUrl: async () => 'https://files.test/research.docx',
    documentReferencesApplicationCase: () => true,
    listClientDocuments: async () => [sourceDocument],
  },
  '../engines/docxPdfRenderer': { renderDocxAsPdf: async () => new TextEncoder().encode('%PDF-source') },
  'pdf-lib': pdfLib,
  'pdf-lib/cjs/index.js': pdfLib,
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).startsWith('/branding/')) return { ok: false, status: 404 };
  return new Response(new TextEncoder().encode('%PDF-source'));
};
try {
  const result = await loaded('src/services/applicationPackService.ts').generateAndArchiveApplicationPack({
    dealerId: 'dealer-1', userId: 'user-1', clientId: 'client-1', applicationCaseId: 'case-1',
  });
  assert.ok(result.includedDocumentIds.includes('generated-1'), 'Converted research PDF is included in the final pack');
  assert.ok(drawnText.includes('RESEARCH SOURCE PROVENANCE'), 'Final PDF includes a readable source provenance page');
  assert.ok(drawnText.includes('Winchester Model 1912'), 'Provenance page includes the research source title');
  assert.ok(drawnText.includes('UNREVIEWED'), 'Provenance page labels local source trust accurately');
  assert.ok(drawnText.some((value) => value.includes('20 gauge')));
  assert.equal(storedDocuments.length, 2, 'A research PDF working copy and final pack are archived');
  assert.equal(storedDocuments[0].metadata.researchSource.trustLevel, 'UNREVIEWED');
  console.log('Research DOCX conversion, provenance appendix, and final-pack archival passed.');
} finally {
  globalThis.fetch = originalFetch;
}
