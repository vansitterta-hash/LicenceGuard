import assert from 'node:assert/strict';
import { loader } from './beta-test-support.mjs';

const captured = [];
const db = {
  from() {
    const query = {
      select() { return query; },
      eq() { return Promise.resolve({ data: [], error: null }); },
    };
    return query;
  },
};
const suggestionService = loader({
  '../lib/supabase': { supabase: db },
  './referenceLibraryService': {
    addReferenceDocumentToClient: async (input) => captured.push(input),
  },
})('src/services/applicationDocumentSuggestionService.ts');

const researchContext = {
  provider: 'LOCAL_REFERENCE_LIBRARY',
  discipline: 'trap',
  association: 'National Sporting Clays Association',
  firearm: { make: 'Winchester', model: 'Model 1912', calibre: '20 gauge', firearmType: 'SHOTGUN' },
  generatedAt: '2026-10-01T12:00:00.000Z',
  findings: [{ subject: 'CALIBRE', summary: 'Applicant-reviewed 20 gauge archive reference.', sourceId: 'reference-1', sourceTitle: 'Winchester Model 1912', sourceUrl: '/research/winchester.docx' }],
};
const context = {
  applicationType: 'FIREARM_LICENCE_FIRST_APPLICATION',
  licenceSection: '16',
  motivationSummary: 'Dedicated sport shooting',
  client: { id: 'client-1', firstName: 'Test', surname: 'Applicant' },
  firearm: { id: 'firearm-1', make: 'Winchester', model: 'Model 1912', calibre: '20 gauge', serialNumber: 'TEST', firearmType: 'SHOTGUN' },
};
const item = {
  id: 'reference-1', title: 'Winchester Model 1912', fileName: 'Winchester Model 1912.docx',
  category: 'Firearm and Calibre Research', documentType: 'SUPPORTING_RESEARCH',
  applicationFolder: '20Ga Wichester Pump Action', relativePath: 'reference-library/research/winchester.docx',
  extension: 'DOCX', sizeBytes: 100, tags: ['20 gauge'], source: 'Successful application archive', status: 'REFERENCE',
};

await suggestionService.prepareSuggestedApplicationDocuments({
  dealerId: 'dealer-1', userId: 'user-1', clientId: 'client-1', applicationCaseId: 'case-1',
  suggestions: [{ item, score: 70, reason: 'Exact calibre match', kind: 'FIREARM_INFORMATION' }],
  context, researchContext,
});

assert.equal(captured.length, 1);
assert.equal(captured[0].firearmId, 'firearm-1');
assert.equal(captured[0].personalisation.motivationSummary, 'Dedicated sport shooting');
assert.equal(captured[0].researchContext.discipline, 'trap');
assert.equal(captured[0].researchContext.association, 'National Sporting Clays Association');
assert.equal(captured[0].researchContext.findings[0].sourceUrl, '/research/winchester.docx');

const stored = [];
const supabase = {
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  from: () => ({
    insert: (record) => {
      stored.push(record);
      return Promise.resolve({ error: null });
    },
    select: () => { const q = { eq: () => q, single: async () => ({ data: { ...stored.at(-1), id: 'document-1' }, error: null }) }; return q; },
  }),
};
const documentService = loader({
  'react-native': { Platform: { OS: 'web' } },
  '../lib/supabase': { supabase },
})('src/services/referenceLibraryService.ts');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(new Blob(['source document']));
try {
  await documentService.addReferenceDocumentToClient({
    dealerId: 'dealer-1', userId: 'user-1', clientId: 'client-1', applicationCaseId: 'case-1',
    firearmId: captured[0].firearmId, item, personalisation: captured[0].personalisation,
    researchContext: captured[0].researchContext,
  });
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(stored[0].firearm_id, 'firearm-1');
assert.equal(stored[0].metadata.researchSource.title, 'Winchester Model 1912');
assert.equal(stored[0].metadata.researchSource.trustLevel, 'UNREVIEWED');
assert.equal(stored[0].metadata.researchSource.retrievalDate, null);
assert.equal(stored[0].metadata.researchContext.discipline, 'trap');
console.log('Research context, motivation metadata, firearm linkage, and source provenance passed.');
