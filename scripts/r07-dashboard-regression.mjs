import assert from 'node:assert/strict';
import { loader } from './beta-test-support.mjs';
const calls = []; let error = null;
const counts = [4, 3, 2, 1, 1, 2];
const db = { from(table) {
  const call = { table, filters: [] }; calls.push(call); const index = calls.length - 1;
  const q = { select(fields, options) { assert.equal(options.count,'exact'); assert.equal(options.head,true); return q; },
    eq(...filter) { call.filters.push(['eq',...filter]); return q; }, not(...filter) { call.filters.push(['not',...filter]); return q; },
    gte(...filter) { call.filters.push(['gte',...filter]); return q; }, lte(...filter) { call.filters.push(['lte',...filter]); return q; },
    then(resolve) { return Promise.resolve({ count: counts[index % 6], error }).then(resolve); },
  }; return q;
} };
const getCounts = loader({ '../lib/supabase': { supabase: db } })('src/services/dashboardService.ts').getDashboardCounts;
assert.deepEqual(await getCounts('dealer',new Date('2026-09-12T12:00:00Z')), [4,3,3,3]);
for (const call of calls) {
  assert.ok(call.filters.some(([op,key,value]) => op === 'eq' && key === 'dealer_id' && value === 'dealer'));
  assert.ok(call.filters.some(([op,key,value]) => op === 'eq' && key.endsWith('is_active') && value === true));
}
assert.ok(calls[1].filters.some(([op,key]) => op === 'not' && key === 'status'));
assert.ok(calls[2].filters.some(([op,key,value]) => op === 'gte' && key === 'expiry_date' && value === '2026-09-12'));
error = { message: 'Read failed' }; await assert.rejects(getCounts('dealer'),/Read failed/);
console.log('R07 passed: actual query counts, dealer/active-client filters, open status, date windows, error propagation.');
