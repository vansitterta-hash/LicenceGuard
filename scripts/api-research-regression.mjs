import assert from 'node:assert/strict';
import handler from '../api/application-research.js';

const previousFetch = globalThis.fetch;
const previousValues = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  tavilyKey: process.env.TAVILY_API_KEY,
};
const providerRequests = [];
let sessionValid = true;
let resultOverrides = null;
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://supabase.test';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    json(value) { this.body = value; return this; },
  };
}

const request = (body, authorization = 'Bearer session-token') => ({
  method: 'POST',
  headers: { authorization, 'content-length': '400' },
  body,
});

try {
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return { ok: sessionValid, json: async () => ({ id: 'user-1' }) };
    }
    if (url === 'https://api.tavily.com/search') {
      providerRequests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          usage: { credits: 1 },
          results: resultOverrides?.[JSON.parse(options.body).country ? 1 : 0] ?? [
            { id: 'result-1', title: 'CZ 12 gauge shotgun specifications and skeet rules', url: 'https://example.test/firearm', content: 'The CZ 12 gauge shotgun has interchangeable chokes for skeet sporting use.', published_date: '2026-08-01' },
            ...Array.from({ length: 6 }, (_, i) => ({ id: `result-${i}`, title: JSON.parse(options.body).country ? 'Skeet shotgun competition rules' : 'CZ 12 gauge shotgun technical specifications', url: `https://example.test/${JSON.parse(options.body).country ? 'sport' : 'technical'}/${i}`, content: 'The CZ 12 gauge shotgun uses interchangeable chokes for skeet competition targets.' })),
            { id: 'bad-url', title: 'Ignored scheme', url: 'javascript:alert(1)', content: 'Invalid URL result.' },
            { id: 'empty', title: 'Missing content', url: 'https://example.test/empty', content: '' },
          ],
        }),
      };
    }
    throw new Error(`Unexpected fetch target: ${url}`);
  };

  delete process.env.TAVILY_API_KEY;
  const unauthenticated = createResponse();
  await handler(request({ firearm: { calibre: '20 gauge' } }, ''), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);

  const missingKey = createResponse();
  await handler(request({ firearm: { calibre: '20 gauge' } }), missingKey);
  assert.equal(missingKey.statusCode, 503);
  assert.match(missingKey.body.error, /TAVILY_API_KEY/);

  process.env.TAVILY_API_KEY = 'server-only-test-key';
  const invalidPersonalData = createResponse();
  await handler(request({ firearm: { calibre: '20 gauge' }, purpose: 'ID 8001015009087' }), invalidPersonalData);
  assert.equal(invalidPersonalData.statusCode, 400);
  assert.equal(providerRequests.length, 0);
  sessionValid = false;
  const expired = createResponse();
  await handler(request({ firearm: { calibre: '12 bore' } }), expired);
  assert.equal(expired.statusCode, 401);
  assert.equal(providerRequests.length, 0);
  sessionValid = true;

  const response = createResponse();
  await handler(request({
    applicationType: 'FIREARM_LICENCE_FIRST_APPLICATION',
    licenceSection: '16',
    purpose: 'Dedicated sport shooting',
    discipline: 'Skeet',
    association: 'Sport Association',
    firearm: { make: 'CZ', model: null, calibre: '12 BR SHOTGUN', firearmType: 'SHOTGUN', serialNumber: '1165306' },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(providerRequests.length, 2);
  assert.equal(providerRequests[0].options.headers.Authorization, 'Bearer server-only-test-key');
  assert.equal(providerRequests[0].options.body.includes('server-only-test-key'), false);
  const payload = JSON.parse(providerRequests[0].options.body);
  assert.equal(payload.search_depth, 'basic');
  assert.equal(payload.max_results, 6);
  assert.equal(payload.include_answer, false);
  const purposePayload = JSON.parse(providerRequests[1].options.body);
  assert.match(payload.query, /CZ.*12 BR SHOTGUN.*SHOTGUN.*12 bore 12 gauge/);
  assert.doesNotMatch(payload.query, /skeet|Section 16|Sport Association|Dedicated sport|1165306|Beretta|1301|South Africa/);
  assert.equal(Object.hasOwn(payload, 'country'), false);
  assert.match(purposePayload.query, /Section 16.*FIREARM_LICENCE_FIRST_APPLICATION.*Dedicated sport shooting.*skeet.*Sport Association.*SHOTGUN/);
  assert.equal(purposePayload.country, 'south africa');
  assert.doesNotMatch(purposePayload.query, /1165306/);
  assert.equal(response.body.firearm.model, null);
  assert.equal(response.body.sourceCount, 6);
  assert.equal(new Set(response.body.sources.map(s => s.url)).size, 6);
  assert.ok(response.body.sources.some(s => s.url.includes('/technical/')));
  assert.ok(response.body.sources.some(s => s.url.includes('/sport/')));
  assert.ok(response.body.sources.every(s => s.trustLevel === 'UNREVIEWED' && s.sourceKind === 'EXTERNAL_PROVIDER' && !Object.hasOwn(s, 'reviewed') && !Object.hasOwn(s, 'approved')));
  assert.equal(Object.hasOwn(response.body, 'claims'), false);
  assert.equal(response.body.usage.credits, 2);
  assert.equal(response.body.applicationType, 'FIREARM_LICENCE_FIRST_APPLICATION');
  assert.equal(response.body.licenceSection, '16');
  assert.equal(response.body.purpose, 'Dedicated sport shooting');
  assert.equal(response.body.discipline, 'Skeet');
  assert.equal(response.body.sources[0].trustLevel, 'UNREVIEWED');
  assert.equal(response.body.sources[0].publishedDate, '2026-08-01');
  assert.equal(response.body.sources[0].sourceKind, 'EXTERNAL_PROVIDER');
  assert.equal(response.body.findings[0].sourceUrl, 'https://example.test/firearm');
  const storedModel = createResponse();
  await handler(request({ licenceSection: '16', purpose: 'Dedicated sport shooting', discipline: 'Skeet', firearm: { make: 'CZ', model: 'Stored test model', calibre: '12 BR SHOTGUN', firearmType: 'SHOTGUN' } }), storedModel);
  assert.equal(storedModel.statusCode, 200);
  assert.match(JSON.parse(providerRequests[2].options.body).query, /CZ Stored test model 12 BR SHOTGUN/);
  const publication = (id, title, content) => ({ id, title, content, url: `https://example.test/${id}` });
  const navigation = publication('navigation', 'CZ shotgun specifications and Skeet rules', 'Home Contact us Log in Privacy policy Menu CZ shotgun manufacturer specifications skeet competition hunting rifle');
  const association = publication('generic-association', 'SA Hunters dedicated membership', 'Dedicated sport shooting Section 16 membership and association navigation information.');
  const wrongCategory = publication('wrong-category', 'CZ rifle history', 'Manufacturer specifications for CZ rifles, not a shotgun guide.');
  resultOverrides = [
    [navigation, association, wrongCategory,
      publication('weak-firearm', 'Shotgun context', 'The CZ shotgun has interchangeable chokes and documented technical characteristics for sporting use.'),
      publication('strong-firearm', 'CZ 12 gauge shotgun specifications', 'The CZ 12 gauge shotgun has manufacturer barrel and choke specifications and documented production history.')],
    [association, navigation, publication('wrong-discipline', 'Hunting rifle association', 'Rifle hunting competitions and dedicated membership.'),
      publication('weak-purpose', 'Club newsletter', 'Skeet shooting competition uses a shotgun on the range.'),
      publication('strong-purpose', 'Skeet shotgun competition rules', 'Skeet competition rules require a shotgun to engage crossing clay targets with specified equipment.')],
  ];
  const focused = createResponse();
  const caseBody = { licenceSection: '16', purpose: 'Dedicated sport shooting', discipline: 'Skeet', firearm: { make: 'CZ', calibre: '12 BR SHOTGUN', firearmType: 'SHOTGUN' } };
  await handler(request(caseBody), focused);
  assert.equal(focused.statusCode, 200);
  assert.equal(focused.body.sourceCount, 4, 'irrelevant material never fills the limit');
  assert.deepEqual(focused.body.sources.map(s => s.url), ['strong-firearm', 'strong-purpose', 'weak-firearm', 'weak-purpose'].map(id => `https://example.test/${id}`));
  assert.match(focused.body.warnings.join(' '), /Insufficient relevant sources/);
  assert.ok(focused.body.sources.every(s => s.trustLevel === 'UNREVIEWED' && !s.reviewed && !s.approved));
  assert.equal(Object.hasOwn(focused.body, 'claims'), false);
  resultOverrides = [[association, navigation, wrongCategory], [association, navigation]];
  const insufficient = createResponse();
  await handler(request(caseBody), insufficient);
  assert.equal(insufficient.body.sourceCount, 0);
  assert.equal(insufficient.body.providerStatus, 'REQUIRES_EXTERNAL_PROVIDER');
  assert.match(insufficient.body.warnings.join(' '), /No relevant firearm-specific.*No relevant application-purpose/s);
  // Reconstructed failure characteristics reported in physical testing, not
  // verbatim provider excerpts (which were not supplied). Mixed menu terms must
  // not establish relevance by leaking across unrelated passages.
  const physicalFailures = [
    publication('rifle-association', 'SA Hunting Rifle Shooting Association', 'The association provides rifle competition rules for dedicated hunters. Shotgun Skeet Hunting Membership Events'),
    publication('dedicated-status', 'SA Hunters Dedicated Sport Shooter Status', 'Dedicated sport shooter status requires annual activity reports and membership. Skeet Shotgun Hunting Competitions'),
    publication('firearm-help', 'Firearm help and dedicated status', 'Our firearm help service provides licensing assistance for Section 16 applicants. Skeet Shotgun Hunting Equipment'),
    publication('hunting-menu', 'Hunting and shotgun Skeet information', 'Membership Events Training Bookings News Downloads Branches Competitions Rifle Pistol Shotgun Skeet Hunting Conservation Gallery Sponsors Shop Calendar Resources. Skeet competition requires shotguns to engage crossing clay targets.'),
    publication('other-category', 'CZ rifle technical specifications', 'The CZ rifle has a technical action designed for hunting and sporting competition. Shotgun Skeet'),
  ];
  const natshoot = publication('natshoot', 'Natshoot shotgun Skeet competition', 'Skeet rules require shotguns to engage crossing clay targets from specified stations with approved equipment. Competitors must follow shotgun safety rules on the range.' );
  const hunting = publication('shotgun-hunting', '12 bore shotgun hunting use', 'A 12 bore shotgun can be used for hunting game birds with suitable ammunition and chokes. Hunting shotguns should use patterns appropriate to the game and distance.');
  const cz = publication('cz-shotgun', 'CZ 12 bore shotgun technical characteristics', 'The CZ 12 bore shotgun has documented barrel specifications and interchangeable chokes for sporting and hunting use.');
  const dualPurpose = { ...caseBody, discipline: 'Skeet AND hunting' };
  resultOverrides = [[...physicalFailures, cz], [...physicalFailures, natshoot, hunting]];
  const physical = createResponse(); await handler(request(dualPurpose), physical);
  assert.equal(physical.statusCode, 200);
  assert.deepEqual(new Set(physical.body.sources.map(s => s.url)), new Set([cz.url, natshoot.url, hunting.url]));
  assert.equal(physical.body.sources[0].url, cz.url, 'qualified firearm discovery retains its balanced slot');
  assert.ok(physical.body.sources.every(s => s.trustLevel === 'UNREVIEWED' && !s.reviewed && !s.approved));
  assert.equal(Object.hasOwn(physical.body, 'claims'), false);
  resultOverrides = [physicalFailures, [...physicalFailures, natshoot, hunting]];
  const unidentified = createResponse(); await handler(request(dualPurpose), unidentified);
  assert.equal(unidentified.body.sourceCount, 2, 'no guessed model or filler when firearm evidence is unavailable');
  assert.match(unidentified.body.warnings.join(' '), /No relevant firearm-specific/);
  assert.equal(unidentified.body.firearm.model, null);
  resultOverrides = [physicalFailures, physicalFailures];
  const allPoor = createResponse(); await handler(request(dualPurpose), allPoor);
  assert.equal(allPoor.body.sourceCount, 0, 'zero qualifying sources is valid');
  console.log('Live research API auth, privacy filtering, server-only key, bounded search, and source mapping passed.');
} finally {
  globalThis.fetch = previousFetch;
  for (const [name, value] of Object.entries({
    EXPO_PUBLIC_SUPABASE_URL: previousValues.supabaseUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: previousValues.publishableKey,
    TAVILY_API_KEY: previousValues.tavilyKey,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
