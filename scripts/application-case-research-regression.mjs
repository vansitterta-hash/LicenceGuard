import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader } from './beta-test-support.mjs';

const writes = [];
const rows = {
  clients: [{ id: 'client-1', first_name: 'Test', surname: 'Applicant', id_number: '0000000000000' }],
  firearms: [{ id: 'firearm-1', client_id: 'client-1', make: 'Beretta', model: '1301', calibre: '12 gauge', serial_number: 'TEST', firearm_type: 'SHOTGUN', required_competency: 'SHOTGUN', is_active: true }],
  competencies: [],
  firearm_licences: [],
  application_cases: [],
  documents: [],
};
const db = {
  from(table) {
    let payload = null;
    let single = false;
    const query = {
      select() { return query; },
      eq() { return query; },
      order() { return query; },
      insert(value) { payload = value; writes.push({ table, payload }); return query; },
      update(value) { payload = value; writes.push({ table, payload }); return query; },
      not() { return query; },
      single() {
        single = true;
        if (payload) {
          const inserted = { ...payload, id: 'case-1', created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
          rows[table].push(inserted);
          return Promise.resolve({ data: inserted, error: null });
        }
        return Promise.resolve({ data: rows[table][0] ?? null, error: null });
      },
      then(resolve, reject) {
        const data = payload ? rows[table].map((row) => ({ ...row, ...payload })) : rows[table];
        return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  async rpc() { throw new Error('Unexpected RPC'); },
};
const service = loader({
  '../services/safeDeletionService': { removeSafeRecord: async () => true },
  '../utils/draftSaveQueue': { enqueueDraftSave: (_id, task) => task(), waitForDraftSave: async () => {} },
  '../lib/supabase': { supabase: db },
  '../utils/unsupportedApplicationTypePolicy': { assertApplicationTypeSupportedInBeta() {} },
})('src/services/applicationCaseService.ts');

const values = {
  applicationType: 'FIREARM_LICENCE_FIRST_APPLICATION', status: 'DOCUMENTS_INCOMPLETE',
  competencyCategory: 'SHOTGUN', competencyId: 'competency-1', firearmId: 'firearm-1', firearmLicenceId: '',
  licenceSection: '16', acquisitionSource: 'NOT_APPLICABLE', supplierName: '', supplierIdOrRegistration: '',
  supplierContact: '', supplierLicenceNumber: '', saleOrInvoiceReference: '', primaryPurpose: 'Dedicated sport shooting',
  sportDiscipline: 'Trap', sportAssociation: 'National Sporting Clays Association',
  motivationSummary: 'The applicant has participated in club events for five years.',
  openedDate: '2026-10-01', targetSubmissionDate: '', actualSubmissionDate: '', applicationReference: '',
  policeStation: '', outcomeDate: '', outcomeNotes: '', progressPercent: '20', dealerNotes: '', clientNotes: '',
};
await service.createApplicationCase('dealer-1', 'client-1', 'user-1', values);
const persisted = writes.find((write) => write.table === 'application_cases').payload;
assert.equal(persisted.primary_purpose, values.primaryPurpose);
assert.equal(persisted.sport_discipline, values.sportDiscipline);
assert.equal(persisted.sport_association, values.sportAssociation);
assert.equal(persisted.motivation_summary, values.motivationSummary);

const documentSuggestions = loader({
  '../lib/supabase': { supabase: db },
  './applicationResearchService': { buildApplicationResearchContext() { return {}; } },
  './referenceLibraryService': {},
})('src/services/applicationDocumentSuggestionService.ts');
const storedContext = await documentSuggestions.getApplicationDocumentContext('case-1');
assert.equal(storedContext.primaryPurpose, values.primaryPurpose);
assert.equal(storedContext.sportDiscipline, values.sportDiscipline);
assert.equal(storedContext.sportAssociation, values.sportAssociation);
assert.equal(storedContext.motivationSummary, values.motivationSummary);

rows.clients[0].saps271_declarations = null;
rows.application_cases.push({
  ...rows.application_cases[0],
  id: 'case-missing-discipline',
  sport_discipline: null,
});
const readiness = loader({ '../lib/supabase': { supabase: db } })('src/services/applicationReadinessService.ts');
const readinessResult = await readiness.getClientApplicationReadiness('client-1');
const incompleteSportCase = readinessResult.cases.find((item) => item.caseId === 'case-missing-discipline');
const disciplineRequirement = incompleteSportCase.requirements.find((item) => item.key === 'SPORT_DISCIPLINE');
assert.equal(disciplineRequirement.state, 'MISSING');
assert.equal(incompleteSportCase.readyToGenerate, false);

const migration = readFileSync('supabase/migrations/20261001_application_research_context.sql', 'utf8');
assert.match(migration, /add column if not exists primary_purpose text/i);
assert.match(migration, /add column if not exists sport_discipline text/i);
assert.match(migration, /add column if not exists sport_association text/i);
assert.match(migration, /set local lock_timeout = '5s'/i);
assert.doesNotMatch(migration, /\b(drop|delete|update|truncate|create policy|alter policy|disable row level security)\b/i);
console.log('Separate applicant purpose/discipline/association persistence and additive RLS-preserving migration checks passed.');
