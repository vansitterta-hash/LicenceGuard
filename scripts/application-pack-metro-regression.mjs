// Execute the real Expo/Metro WEB module graph, not TypeScript's Node/CJS output.
// Requires the existing localhost:8081 Metro server. All data/storage are synthetic.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const url = 'http://localhost:8081/src/services/applicationPackService.bundle?platform=web&dev=true&minify=false&runModule=false&lazy=false';
const response = await fetch(url);
assert.equal(response.ok, true);
const source = await response.text();
const context = vm.createContext({ console, setTimeout, clearTimeout, setImmediate, clearImmediate, URL, URLSearchParams, TextEncoder, TextDecoder, performance, Blob, Response, process: { env: { NODE_ENV: 'development' } } });
vm.runInContext('global = globalThis; self = globalThis;', context);
vm.runInContext(source, context, { filename: 'Metro-application-pack.bundle' });
const modules = context.__r.getModules();
const find = path => {
  const entry = [...modules].find(([, m]) => m.verboseName === path);
  assert.ok(entry, `Metro module exists: ${path}`);
  return entry;
};
const replace = (path, exports) => {
  const [, module] = find(path);
  module.isInitialized = true;
  module.publicModule.exports = exports;
};
if (process.argv.includes('--expect-import-failure')) {
  const [id] = find('node_modules/pdf-lib/es/index.js');
  assert.throws(() => context.__r(id), /Cannot destructure property '__extends' of 'tslib.default' as it is undefined/);
  console.log('REPRODUCED: pdf-lib ES -> nested tslib/modules/index.js default interop fails in real Metro WEB bundle');
  process.exit(0);
}

const documents = [
  { id: 'saved-saps', document_type: 'COMPETENCY_APPLICATION', document_name: 'Saved SAPS 517', storage_path: 'synthetic/saved-form.pdf' },
  { id: 'existing-id', document_type: 'ID_COPY', document_name: 'Existing identification', storage_path: 'synthetic/id.pdf' },
].map(d => ({ ...d, client_id: 'client', application_case_id: 'case', document_scope: 'APPLICATION_CASE', lifecycle_status: 'ACTIVE', is_verified: true, mime_type: 'application/pdf', file_name: `${d.id}.pdf`, metadata: {} }));
let ready = true, failDownload = false;
const inserted = [], uploaded = [], statuses = [];
const db = {
  from(table) {
    let payload, updating = false;
    const filters = [];
    const q = {
      insert(value) { payload = value; return q; }, update(value) { updating = true; payload = value; return q; },
      select() { assert.equal(payload, undefined, 'pack insert must not request RETURNING'); return q; }, eq(k,v) { filters.push(record => record[k] === v); return q; },
      async single() { assert.equal(table, 'documents'); return { data: inserted.find(record => filters.every(f => f(record))), error: null }; },
      then(resolve) {
        if (updating) { assert.equal(table, 'application_cases'); statuses.push(payload); }
        else { assert.equal(table, 'documents'); assert.equal(payload.owner_user_id, 'user'); assert.equal(payload.record_scope, 'PRIVATE'); inserted.push({ ...payload, id: 'pack' }); }
        return Promise.resolve({ error: null }).then(resolve);
      },
    }; return q;
  },
  storage: { from() { return {
    async upload(path, blob) { uploaded.push({ path, bytes: new Uint8Array(await blob.arrayBuffer()) }); return { error: null }; },
    remove() { throw Error('Unexpected cleanup'); },
  }; } },
};
replace('src/lib/supabase.ts', { supabase: db });
replace('src/services/clientService.ts', { getClient: async () => ({ first_name: 'Synthetic', surname: 'Applicant', id_number: '8001015009087' }) });
replace('src/services/applicationCaseService.ts', { getApplicationCase: async () => ({ id: 'case', client_id: 'client', application_type: 'COMPETENCY_FIRST_APPLICATION', status: 'NOT_STARTED', subjectDescription: 'Shotgun competency', licence_section: null }) });
replace('src/services/applicationReadinessService.ts', { getClientApplicationReadiness: async () => ({ cases: [{ caseId: 'case', state: ready ? 'READY' : 'ACTION_REQUIRED', score: ready ? 100 : 67, requirements: documents.map(d => ({ key: d.document_type, label: d.document_name, detail: 'Synthetic verified document', required: true, delivery: 'DIGITAL', state: ready ? 'SATISFIED' : 'UNVERIFIED', documentType: d.document_type, documentId: d.id })) }] }) });
replace('src/services/documentService.ts', { listClientDocuments: async () => documents, createDocumentSignedUrl: async path => path, documentReferencesApplicationCase: (d, id) => d.application_case_id === id });
const support = await PDFDocument.create(); support.addPage();
const files = new Map([['synthetic/saved-form.pdf', readFileSync('public/saps-templates/SAPS_517_EN_OFFICIAL.pdf')], ['synthetic/id.pdf', await support.save()]]);
context.fetch = async path => {
  assert.ok(files.has(path), 'network limited to synthetic document bytes');
  return failDownload ? new Response('', { status: 503 }) : new Response(files.get(path));
};
const compiler = context.__r(find('src/services/applicationPackService.ts')[0]);
const input = { dealerId: 'dealer', clientId: 'client', userId: 'user', applicationCaseId: 'case' };
const result = await compiler.generateAndArchiveApplicationPack(input);
const pdf = await PDFDocument.load(Uint8Array.from(result.bytes));
assert.equal(pdf.getPageCount(), 14, 'cover + checklist + saved 11-page SAPS form + existing ID');
assert.deepEqual(Array.from(result.includedDocumentIds).sort(), ['existing-id', 'saved-saps']);
assert.equal(uploaded.length, 1);
assert.deepEqual(uploaded[0].bytes, Uint8Array.from(result.bytes));
assert.equal(inserted.length, 1);
assert.equal(statuses[0].status, 'READY_FOR_SUBMISSION');
ready = false;
await assert.rejects(compiler.generateAndArchiveApplicationPack(input), /cannot be generated yet/);
ready = true; failDownload = true;
await assert.rejects(compiler.generateAndArchiveApplicationPack(input), /Download failed|could not be included|could not be merged/);
assert.equal(uploaded.length, 1, 'failed compile cannot upload an incomplete pack');
assert.equal(inserted.length, 1);
assert.equal(statuses.length, 1);
// Both pack PDF creation and optional DOCX conversion must use the compatible entry.
for (const path of ['src/services/applicationPackService.ts', 'src/engines/docxPdfRenderer.ts']) {
  assert.match(readFileSync(path, 'utf8'), /await import\('pdf-lib\/cjs\/index\.js'\)|import\('pdf-lib\/cjs\/index\.js'\),/);
}
console.log('PASS: real Metro WEB compiler loads pdf-lib without tslib.default/__extends failure, merges saved SAPS 517 and ID into 14-page pack, and preserves readiness/download failure gates');
