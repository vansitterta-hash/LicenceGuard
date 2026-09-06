import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(path) { const out=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText; const m={exports:{}}; new Function('exports','module',out)(m.exports,m); return m.exports; }
const formats=load('src/utils/documentFormatPolicy.ts');
const pack=load('src/utils/applicationPackPolicy.ts');
for(const f of [{name:'a.pdf',mimeType:'application/pdf'},{name:'a.jpg',mimeType:'image/jpeg'},{name:'a.jpeg',mimeType:'image/jpeg'},{name:'a.png',mimeType:'image/png'}]) assert.equal(formats.isSupportedSafeEvidenceFormat(f),true);
for(const f of [{name:'a.webp',mimeType:'image/webp'},{name:'a.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},{name:'a.txt',mimeType:'text/plain'}]) assert.equal(formats.isSupportedSafeEvidenceFormat(f),false);
assert.throws(()=>pack.assertRequiredDigitalDocumentMerged({required:true,label:'Safe photographs',documentName:'a.webp',reason:'Unsupported format'}),/could not be included/);
assert.doesNotThrow(()=>pack.assertRequiredDigitalDocumentMerged({required:false,label:'Optional',documentName:'a.docx'}));
assert.match(readFileSync('src/services/applicationPackService.ts','utf8'),/assertRequiredDigitalDocumentMerged/);
console.log('R01 regression tests passed');