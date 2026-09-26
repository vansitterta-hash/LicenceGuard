import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(p){const js=ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const m={exports:{}};new Function('exports','module',js)(m.exports,m);return m.exports;}
const policy=load('src/utils/unsupportedApplicationTypePolicy.ts');
for(const type of ['TEMPORARY_AUTHORISATION','APPEAL_OR_RECONSIDERATION']){assert.equal(policy.isApplicationTypeSupportedInBeta(type),false);assert.throws(()=>policy.assertApplicationTypeSupportedInBeta(type),new RegExp(policy.UNSUPPORTED_APPLICATION_TYPE_MESSAGE));}
assert.equal(policy.isApplicationTypeSupportedInBeta('COMPETENCY_FIRST_APPLICATION'),true);
const required=['src/services/applicationCaseService.ts','src/services/applicationAutofillService.ts','src/data/sapsTemplateRegistry.ts','src/services/applicationPackService.ts','src/services/applicationOrchestratorService.ts'];
for(const file of required)assert.match(readFileSync(file,'utf8'),/assertApplicationTypeSupportedInBeta/);
const screen=readFileSync('src/screens/ApplicationReadinessScreen.tsx','utf8');assert.match(screen,/unsupportedMessage/);assert.match(readFileSync('src/services/applicationReadinessService.ts','utf8'),/isApplicationTypeSupportedInBeta/);
assert.equal(policy.UNSUPPORTED_APPLICATION_TYPE_MESSAGE, 'This application type is not yet supported in the current LicenceGuard beta.');
console.log('R03 regression tests passed');