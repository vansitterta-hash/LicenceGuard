import assert from 'node:assert/strict';
import handler from '../api/application-research.js';

const previousFetch = globalThis.fetch;
const previousValues = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  tavilyKey: process.env.TAVILY_API_KEY,
};
const providerRequests = [];
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
      return { ok: true, json: async () => ({ id: 'user-1' }) };
    }
    if (url === 'https://api.tavily.com/search') {
      providerRequests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          usage: { credits: 1 },
          results: [
            { id: 'result-1', title: 'Official firearm data', url: 'https://example.test/firearm', content: 'Manufacturer technical specifications.', published_date: '2026-08-01' },
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

  const response = createResponse();
  await handler(request({
    applicationType: 'FIREARM_LICENCE_FIRST_APPLICATION',
    licenceSection: '16',
    purpose: 'Dedicated sport shooting',
    discipline: 'Trap',
    association: 'Sport Association',
    firearm: { make: 'Beretta', model: '1301', calibre: '12 gauge', firearmType: 'SHOTGUN' },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].options.headers.Authorization, 'Bearer server-only-test-key');
  assert.equal(providerRequests[0].options.body.includes('server-only-test-key'), false);
  const payload = JSON.parse(providerRequests[0].options.body);
  assert.equal(payload.search_depth, 'basic');
  assert.equal(payload.max_results, 6);
  assert.equal(payload.include_answer, false);
  assert.equal(response.body.sourceCount, 1);
  assert.equal(response.body.applicationType, 'FIREARM_LICENCE_FIRST_APPLICATION');
  assert.equal(response.body.licenceSection, '16');
  assert.equal(response.body.purpose, 'Dedicated sport shooting');
  assert.equal(response.body.discipline, 'Trap');
  assert.equal(response.body.sources[0].trustLevel, 'UNREVIEWED');
  assert.equal(response.body.sources[0].publishedDate, '2026-08-01');
  assert.equal(response.body.sources[0].sourceKind, 'EXTERNAL_PROVIDER');
  assert.equal(response.body.findings[0].sourceUrl, 'https://example.test/firearm');
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
