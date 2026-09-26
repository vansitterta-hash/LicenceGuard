import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader } from './beta-test-support.mjs';
let record = { id: 'draft', dealer_id: 'dealer', status: 'NOT_STARTED' }, role = 'owner', removed = 0, fail = null;
const db = {
  auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) },
  from(table) {
    const filters = []; const q = { select() { return q; }, eq(...filter) { filters.push(filter); return q; },
      async single() {
        assert.ok(filters.some(([key,value]) => key === 'dealer_id' && value === 'dealer'));
        return { data: table === 'dealer_users' ? { role } : record, error: null };
      } }; return q;
  },
  async rpc(name,args) { assert.equal(name, 'remove_safe_beta_record'); assert.deepEqual(args, { p_table: 'application_cases', p_id: 'draft', p_dealer_id: 'dealer' });
    if (fail) return { data: false, error: { message: fail } }; removed++; return { data: true, error: null }; },
};
const remove = loader({ '../lib/supabase': { supabase: db } })('src/services/safeDeletionService.ts').removeSafeRecord;
await remove('application_cases', 'draft', 'dealer'); assert.equal(removed, 1);
for (const status of ['SUBMITTED','APPROVED','DECLINED','WITHDRAWN','CLOSED','READY_FOR_SUBMISSION']) {
  record.status = status; await assert.rejects(remove('application_cases','draft','dealer'), /unsubmitted draft/);
}
record.status = 'NOT_STARTED'; role = 'staff'; await assert.rejects(remove('application_cases','draft','dealer'), /owner or administrator/);
role = 'owner'; record.dealer_id = 'another-dealer'; await assert.rejects(remove('application_cases','draft','dealer'), /do not have access/);
record.dealer_id = 'dealer'; fail = 'This record has linked records or history and must be retained.';
await assert.rejects(remove('application_cases','draft','dealer'), /linked records/); assert.equal(removed, 1);
const { assertSafeRecordRemoval } = loader()('src/utils/safeDeletionPolicy.ts');
for (const protectedField of ['certificate_number','issue_date','expiry_date','verified','verified_at','document_url']) {
  assert.throws(() => assertSafeRecordRemoval('competencies', { [protectedField]: true }, 'owner'), /retained/);
}
assert.doesNotThrow(() => assertSafeRecordRemoval('competencies', {}, 'administrator'));
const sql = readFileSync('supabase/proposals/20260912_controlled_beta_boundaries.sql','utf8');
assert.doesNotMatch(sql, /disable row level security|create policy/i);
assert.equal((sql.match(/security definer/gi) ?? []).length, 1);
assert.match(sql, /guard_beta_record_removal\(\)[\s\S]*?returns trigger language plpgsql security definer/);
assert.match(sql, /set search_path = pg_catalog, public, pg_temp/);
assert.match(sql, /set row_security = off/);
assert.match(sql, /revoke all on function public\.guard_beta_record_removal\(\) from public, anon, authenticated/);
assert.match(sql, /guard_beta_record_removal/); assert.match(sql, /pg_constraint/); assert.match(sql, /row_count/);
console.log('R05 passed: allowed removal request, protected records, RBAC, tenant mismatch, linked-history error. SQL requires separate database execution validation.');

let confirmed = false, actions = 0;
globalThis.window = { confirm: () => confirmed, alert() {} };
const { userAlert } = loader({ 'react-native': { Platform: { OS: 'web' }, Alert: { alert() { throw new Error('Native alert cannot be used for web confirmation'); } } } })('src/utils/userAlert.ts');
const buttons = [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => actions++ }];
userAlert.alert('Delete draft', 'This cannot be undone.', buttons); assert.equal(actions,0);
confirmed = true; userAlert.alert('Delete draft', 'This cannot be undone.', buttons); assert.equal(actions,1);
delete globalThis.window;
console.log('R05 browser confirmation passed: cancellation performs no action; confirmation invokes removal.');
