import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import handler from '../api/saps-template.js';
import { loader } from './beta-test-support.mjs';

const expected = readFileSync('public/saps-templates/SAPS_271_EN_OFFICIAL.pdf');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(expected), '0d1a74484ab5831db8ebf4b0d11bf8b18e6c9e26b3e4c38631bfec6959e82bdd');
assert.equal(expected.subarray(0,5).toString(), '%PDF-');
assert.equal((await PDFDocument.load(expected)).getPageCount(),12);
assert.equal(JSON.parse(readFileSync('vercel.json','utf8')).functions['api/saps-template.js'].includeFiles,'public/saps-templates/SAPS_271_EN_OFFICIAL.pdf');
const response = () => ({ statusCode:200,headers:{},status(code){this.statusCode=code;return this;},setHeader(k,v){this.headers[k]=v;},send(bytes){this.body=bytes;return this;},json(body){this.body=body;return this;} });
const previousFetch=globalThis.fetch;
let requests=0;
globalThis.fetch=async()=>{requests++;throw Object.assign(new Error('fetch failed'),{cause:{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}});};
try {
  const result=response();
  await handler({query:{code:'SAPS_271'}},result);
  assert.equal(result.statusCode,200);
  assert.equal(result.headers['Content-Type'],'application/pdf');
  assert.equal(result.headers['Content-Disposition'],'inline; filename="SAPS_271.pdf"');
  assert.deepEqual(result.body,expected);
  assert.equal(requests,0,'SAPS 271 delivery must not depend on upstream TLS or network availability');
  const unknown=response();await handler({query:{code:'NOT_A_TEMPLATE'}},unknown);assert.equal(unknown.statusCode,404);assert.equal(requests,0);
  const other=response();await handler({query:{code:'SAPS_517'}},other);assert.equal(other.statusCode,502);assert.equal(requests,1,'Other template delivery paths unchanged');
} finally {globalThis.fetch=previousFetch;}
const load=loader({'../lib/supabase':{supabase:{}}});
const template=load('src/data/sapsTemplateRegistry.ts').getSapsTemplate('SAPS_271');
assert.equal(template.sourceUrl,'/saps-templates/SAPS_271_EN_OFFICIAL.pdf','Open official blank form uses the pinned file');
const renderer=load('src/engines/pdfTemplateRenderer.ts');
const requested=[];
globalThis.fetch=async url=>{requested.push(url);assert.equal(url,template.sourceUrl);return new Response(expected);};
try {
  const rendered=await renderer.renderOfficialPdfTemplate({template,context:{data:{application:{},applicant:{}},reviewValues:{}}});
  assert.equal((await PDFDocument.load(rendered)).getPageCount(),12);
  assert.deepEqual(requested,[template.sourceUrl],'Generation uses the same pinned file, never the external SAPS URL');
} finally {globalThis.fetch=previousFetch;}
console.log('PASS: exact 12-page official SAPS 271 SHA-256; bundled asset; API delivers unchanged PDF despite reproduced upstream TLS failure; unknown-code and other-template behaviour preserved.');
