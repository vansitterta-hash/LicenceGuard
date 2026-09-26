// Run with the existing Expo web server on localhost:8081. No packages or live data required.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const origin = 'http://localhost:8081';
const browserPath = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(existsSync(browserPath), 'Set BROWSER_PATH to an installed Chromium/Edge executable');
const artifacts = mkdtempSync(join(tmpdir(), 'licenceguard-saps517-'));
const downloads = join(artifacts, 'downloads');
mkdirSync(downloads);
const profile = join(artifacts, 'profile');
console.log('Starting Edge/Metro regression; artifacts:', artifacts);
const browser = spawn(browserPath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserError = '';
browser.stderr.on('data', (data) => { browserError = (browserError + data.toString()).slice(-4000); });
browser.on('error', (error) => { console.error(error.message); });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, message, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await pause(250);
  }
  throw new Error(message);
}
async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const events = [];
  socket.onmessage = async ({ data }) => {
    const payload = typeof data === 'string'
      ? data
      : data instanceof Blob
        ? await data.text()
        : Buffer.from(data).toString();
    const message = JSON.parse(payload);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else events.push(message);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 240_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { socket, events, call };
}
let browserConnection;
let pageConnection;
let viewerConnection;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  await until(() => existsSync(portFile), 'Browser debugging endpoint did not start', 600_000).catch((error) => { throw new Error(error.message + '\n' + browserError); });
  console.log('Edge debugging endpoint ready');
  const [port, browserEndpoint] = await until(() => {
    try {
      const parts = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      return parts.length >= 2 ? parts : null;
    } catch (error) {
      if (error?.code === 'EBUSY' || error?.code === 'EACCES') return null;
      throw error;
    }
  }, 'Browser debugging endpoint file could not be read');
  browserConnection = await connectCdp(`ws://127.0.0.1:${port}${browserEndpoint}`);
  const { targetId } = await browserConnection.call('Target.createTarget', { url: 'about:blank' });
  const target = await until(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    return targets.find((item) => item.id === targetId);
  }, 'Browser page target did not become available');
  pageConnection = await connectCdp(target.webSocketDebuggerUrl);
  const call = pageConnection.call;
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*supabase.co*', '*supabase.in*'] });
  await call('Page.navigate', { url: origin });
  await until(async () => {
    try { return await evaluate("location.origin === 'http://localhost:8081' && document.readyState === 'complete'"); }
    catch { return false; }
  }, 'LicenceGuard page did not load', 240_000);
  console.log('LicenceGuard page loaded; loading real Metro PDF bundle');

  // Execute the Metro/browser build, NOT a Node-transpiled copy or mocked PDF library.
  const bundlePath = '/src/services/generatedApplicationDocumentService.bundle?platform=web&dev=true&minify=false&runModule=false&lazy=false';
  await evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(bundlePath)});
    if (!response.ok) throw new Error('Metro bundle HTTP ' + response.status);
    (0, eval)(await response.text());
  })()`);
  const pinned = readFileSync('public/saps-templates/SAPS_517_EN_OFFICIAL.pdf');
  assert.equal(createHash('sha256').update(pinned).digest('hex'), '8066ff257c854c7d8c641369c0d4be976b596516bf744fd98701ba67bff8f378');
  const result = await evaluate(`(async () => {
    const service = __r('src/services/generatedApplicationDocumentService.ts');
    const mapping = __r('src/engines/sapsFieldMappingEngine.ts');
    const data = {
      canGenerate: true, issues: [], generatedAt: new Date().toISOString(),
      saps271Declarations: { answers: {
        convictions: { answer: 'NO', incidents: [] }, pendingCases: { answer: 'NO', incidents: [] },
        lostStolen: { answer: 'NO', incidents: [] }, negligence: { answer: 'NO', incidents: [] },
        unfitness: { answer: 'NO', incidents: [] }, confiscation: { answer: 'NO', incidents: [] },
      } },
      applicant: { fullName: 'Example Applicant', firstName: 'Example', surname: 'Applicant', idNumber: '8001015009087', cellphone: '0123456789', alternateCellphone: '', email: 'example@example.test', residentialAddress: '1 Example Road', suburb: 'Example', city: 'Example City', province: 'Gauteng', postalCode: '0001' },
      application: { applicationCaseId: 'synthetic-saps517-browser-regression', applicationType: 'COMPETENCY_FIRST_APPLICATION', formCode: 'SAPS_517', formLabel: 'SAPS 517', policeStation: 'Example', applicationReference: 'BROWSER-REGRESSION', openedDate: '2026-09-01', motivationSummary: '' },
      firearm: null, supplier: null, competency: { category: 'HANDGUN', certificateNumber: '', issueDate: '', expiryDate: '' },
    };
    const values = service.createReviewValues(data);
    const mapped = mapping.mapApplicationToSapsTemplate(data, values);
    const bytes = await service.generateOfficialApplicationPdf(data, values);
    globalThis.saps517BrowserRegression = { bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) };
    return { missing: mapped.missingRequiredFieldCount, mapped: mapped.mappedFieldCount, signature: new TextDecoder().decode(bytes.slice(0, 5)), byteCount: bytes.length, caseId: data.application.applicationCaseId };
  })()`);
  assert.equal(result.missing, 0);
  assert.equal(result.signature, '%PDF-');
  assert.equal(result.caseId, 'synthetic-saps517-browser-regression');
  console.log('PASS: real Metro/browser SAPS 517 generation', JSON.stringify(result));

  await browserConnection.call('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, eventsEnabled: true });
  await evaluate("__r('src/engines/pdfTemplateRenderer.ts').downloadPdf(saps517BrowserRegression.bytes, 'SAPS_517_browser_regression.pdf')");
  const completed = await until(() => browserConnection.events.find((event) => event.method === 'Browser.downloadProgress' && event.params.state === 'completed'), 'Browser PDF download did not complete');
  const download = browserConnection.events.find((event) => event.method === 'Browser.downloadWillBegin' && event.params.guid === completed.params.guid);
  assert.equal(download.params.suggestedFilename, 'SAPS_517_browser_regression.pdf');
  const downloaded = readFileSync(join(downloads, completed.params.guid));
  assert.equal(downloaded.subarray(0, 5).toString(), '%PDF-');
  const { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } = createRequire(import.meta.url)('pdf-lib');
  const pdf = await PDFDocument.load(downloaded);
  assert.equal(pdf.getPageCount(), 11);
  let pageText = '';
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref)) : [contents];
    for (const stream of streams) if (stream instanceof PDFRawStream) {
      const content = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      for (const match of content.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) pageText += Buffer.from(match[1], 'hex').toString('latin1') + '\n';
    }
  }
  for (const value of ['EXAMPLE', 'APPLICANT', '8001015009087']) assert.ok(pageText.toUpperCase().includes(value), `Populated PDF field missing: ${value}`);
  const pdfPath = join(artifacts, 'SAPS_517_browser_regression.pdf');
  writeFileSync(pdfPath, downloaded);
  console.log('PASS: browser download contains an 11-page PDF with populated applicant fields');

  const blobUrl = await evaluate('saps517BrowserRegression.url');
  const viewer = await browserConnection.call('Target.createTarget', { url: blobUrl });
  const viewerTarget = await until(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    return targets.find((item) => item.id === viewer.targetId);
  }, 'Browser PDF viewer target did not become available');
  viewerConnection = await connectCdp(viewerTarget.webSocketDebuggerUrl);
  const viewerEvaluate = async (expression) => {
    const result = await viewerConnection.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await until(async () => {
    try { return await viewerEvaluate("document.readyState === 'complete' && Boolean(document.querySelector('embed[type=\"application/pdf\"]'))"); }
    catch { return false; }
  }, 'Browser PDF viewer did not open');
  const screenshot = await viewerConnection.call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(artifacts, 'SAPS_517_viewer.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('PASS: generated PDF opened in the browser PDF viewer');
  console.log('Artifacts:', artifacts);
  await browserConnection.call('Browser.close');
} finally {
  viewerConnection?.socket.close();
  pageConnection?.socket.close();
  browserConnection?.socket.close();
  browser.kill();
}
