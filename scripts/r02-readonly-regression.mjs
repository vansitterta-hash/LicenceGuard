import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loader } from './beta-test-support.mjs';

const writes = [];
const rows = { clients: { first_name: 'Test', surname: 'Client' }, application_cases: [], competencies: [], firearms: [], firearm_licences: [], documents: [] };
const db = { from(table) { const q = { select() { return q; }, eq() { return q; }, not() { return q; }, order() { return q; }, single() { return q; }, update() { writes.push(['update', table]); throw new Error('readiness attempted update'); }, insert() { writes.push(['insert', table]); throw new Error('readiness attempted insert'); }, delete() { writes.push(['delete', table]); throw new Error('readiness attempted delete'); }, upsert() { writes.push(['upsert', table]); throw new Error('readiness attempted upsert'); }, then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject); } }; return q; } };
const source = readFileSync('src/services/applicationReadinessService.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
const requireForReadiness = (id) => {
  if (id === '../lib/supabase') return { supabase: db };
  if (id === './documentService') return loader({ '../lib/supabase': { supabase: db } })('src/services/documentService.ts');
  if (id === '../utils/unsupportedApplicationTypePolicy') return loader()('src/utils/unsupportedApplicationTypePolicy.ts');
  if (id === '../utils/saps271Declarations') return loader()('src/utils/saps271Declarations.ts');
  if (id === '../utils/saps517Applicant') return loader()('src/utils/saps517Applicant.ts');
  if (id === '../utils/reusableCompetency') return loader()('src/utils/reusableCompetency.ts');
  if (id === '../types/applicationCase') return loader()('src/types/applicationCase.ts');
  throw new Error(`Unexpected dependency: ${id}`);
};
new Function('exports', 'require', 'module', js)(module.exports, requireForReadiness, module);
await module.exports.getClientApplicationReadiness('client-1');
await module.exports.getClientApplicationReadiness('client-1');
rows.application_cases = ['COMPETENCY_FIRST_APPLICATION', 'COMPETENCY_ADDITIONAL_CATEGORY', 'COMPETENCY_RENEWAL', 'COMPETENCY_REAPPLICATION',
  'FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_ADDITIONAL_APPLICATION', 'FIREARM_LICENCE_RENEWAL', 'FIREARM_LICENCE_REAPPLICATION',
  'TEMPORARY_AUTHORISATION', 'APPEAL_OR_RECONSIDERATION'].map((application_type, i) => ({
    id: `case-${i}`, application_type, status: 'NOT_STARTED', competency_category: 'SHOTGUN',
  }));
rows.documents = [{ id: 'reusable-id', document_type: 'ID_COPY', document_scope: 'CLIENT', lifecycle_status: 'ACTIVE', is_verified: true, created_at: '2026-09-01', metadata: {} }];
const first = await module.exports.getClientApplicationReadiness('client-1');
const second = await module.exports.getClientApplicationReadiness('client-1');
assert.deepEqual(first.cases, second.cases);
assert.equal(first.cases.length, 10);
for (const item of first.cases.slice(0,8)) assert.ok(item.requirements.some((r) => r.documentType === 'ID_COPY' && r.state === 'SATISFIED'));
for (const item of first.cases.slice(8)) { assert.equal(item.readyToGenerate, false); assert.equal(item.state, 'BLOCKED'); assert.equal(item.unsupportedMessage, 'This application type is not yet supported in the current LicenceGuard beta.'); }
assert.deepEqual(writes, []);
const screen = readFileSync('src/screens/ApplicationReadinessScreen.tsx', 'utf8');
assert.doesNotMatch(screen, /await\s+linkReusableClientDocumentsToApplicationCase/);
console.log('R02 repeated readiness no-write regression passed');
