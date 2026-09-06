import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const writes = [];
const rows = { clients: { first_name: 'Test', surname: 'Client' }, application_cases: [], competencies: [], firearms: [], firearm_licences: [], documents: [] };
const db = { from(table) { const q = { select() { return q; }, eq() { return q; }, not() { return q; }, order() { return q; }, single() { return q; }, update() { writes.push(['update', table]); throw new Error('readiness attempted update'); }, insert() { writes.push(['insert', table]); throw new Error('readiness attempted insert'); }, delete() { writes.push(['delete', table]); throw new Error('readiness attempted delete'); }, upsert() { writes.push(['upsert', table]); throw new Error('readiness attempted upsert'); }, then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject); } }; return q; } };
const source = readFileSync('src/services/applicationReadinessService.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
const requireForReadiness = (id) => {
  if (id === '../lib/supabase') return { supabase: db };
  if (id === './documentService') return { documentReferencesApplicationCase: () => false };
  if (id === '../utils/applicationBetaPolicy') return { isApplicationTypeSupportedInBeta: () => true, UNSUPPORTED_APPLICATION_TYPE_MESSAGE: 'unused' };
  throw new Error(`Unexpected dependency: ${id}`);
};
new Function('exports', 'require', 'module', js)(module.exports, requireForReadiness, module);
await module.exports.getClientApplicationReadiness('client-1');
await module.exports.getClientApplicationReadiness('client-1');
assert.deepEqual(writes, []);
const screen = readFileSync('src/screens/ApplicationReadinessScreen.tsx', 'utf8');
assert.doesNotMatch(screen, /await\s+linkReusableClientDocumentsToApplicationCase/);
console.log('R02 repeated readiness no-write regression passed');