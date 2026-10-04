import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261002_private_draft_rpc_rls.sql', 'utf8');
const extract = (name) => {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'));
  assert.ok(match, `missing function ${name}`);
  return match[0];
};
const competency = extract('create_or_resume_competency_application_draft');
const firearm = extract('create_or_resume_firearm_application_draft');
const guard = extract('guard_competency_draft_start');

for (const [name, body] of [['competency RPC', competency], ['firearm RPC', firearm], ['competency trigger', guard]]) {
  assert.match(body, /security definer/i, `${name} must perform protected operations through its tightly-scoped definer`);
  assert.match(body, /set search_path = pg_catalog, public, pg_temp/i, `${name} must pin its search path`);
}

for (const body of [competency, firearm, guard]) {
  assert.match(body, /auth\.uid\(\)/i, 'privileged path must bind authorization to the authenticated user');
  assert.match(body, /is_dealer_member\(/i, 'privileged path must check active dealer access');
  assert.match(body, /is_record_authorized_for_user\('clients'/i, 'privileged path must check client record access');
}
assert.match(competency, /is_record_authorized_for_user\('competencies'/i);
assert.match(competency, /is_record_authorized_for_user\('application_cases'/i, 'resume must not return another user’s private draft');
assert.match(firearm, /is_record_authorized_for_user\('firearms'/i);
assert.match(firearm, /is_record_authorized_for_user\('firearm_licences'/i);
assert.match(firearm, /is_record_authorized_for_user\('application_cases'/i, 'upsert conflict must not update/return another user’s private draft');

for (const body of [competency, firearm]) {
  assert.match(body, /record_scope[\s\S]*?'PRIVATE'/i, 'new RPC-created rows must be private');
  assert.match(body, /owner_user_id[\s\S]*?v_user_id/i, 'new rows must be owned by the authenticated creator');
  assert.match(body, /created_by[\s\S]*?v_user_id/i);
  assert.match(body, /updated_by[\s\S]*?v_user_id/i);
}
assert.match(competency, /for update/i);
assert.match(competency, /current_setting\('transaction_isolation'\)/i);
assert.match(competency, /status = 'NOT_STARTED'/i);
assert.match(guard, /for update/i);
assert.match(guard, /working application already exists/i);
assert.match(guard, /old\.status::text in \('SUBMITTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'CLOSED'\)/i);
assert.match(firearm, /on conflict \(dealer_id, client_id, application_type, firearm_id\)/i);
assert.match(firearm, /3ecd17e8-1608-41bf-9152-eb8c5b371a42/i);

assert.match(sql, /revoke all on function public\.create_or_resume_competency_application_draft[\s\S]*?from public, anon/i);
assert.match(sql, /revoke all on function public\.create_or_resume_firearm_application_draft[\s\S]*?from public, anon/i);
assert.match(sql, /grant execute on function public\.create_or_resume_competency_application_draft[\s\S]*?to authenticated/i);
assert.match(sql, /grant execute on function public\.create_or_resume_firearm_application_draft[\s\S]*?to authenticated/i);
assert.doesNotMatch(sql, /\b(create|alter|drop)\s+policy\b|disable\s+row\s+level\s+security|service_role|truncate\s+|delete\s+from\s+public\.|update\s+public\./i);
assert.match(sql, /begin;[\s\S]*commit;/i);
console.log('R10 passed: both draft RPCs and competency trigger use pinned SECURITY DEFINER paths with explicit user/dealer/record checks; RLS policies and application data are unchanged.');
