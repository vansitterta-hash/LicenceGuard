import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policySql = readFileSync('supabase/migrations/20260928_privacy_enforcement.sql', 'utf8');
const foundationSql = readFileSync('supabase/migrations/20260927_privacy_authorization_foundation.sql', 'utf8');
const authContext = readFileSync('src/context/AuthContext.tsx', 'utf8');
const policyHelper = readFileSync('src/utils/authorizationPolicy.ts', 'utf8');

const requiredTokens = [
  'is_record_authorized_for_user',
  'record_scope',
  'owner_user_id',
  'dealer_user_permissions',
  'workspace_kind',
  'TEST',
  'is_dealer_member',
  'licenceguard-documents',
  'public.is_record_authorized_for_user(\'documents\'',
  'Tester accounts must use a dedicated test workspace',
  'tester',
  'public.can_manage_workspace_membership'
];

let checks = 0;
for (const token of requiredTokens) {
  assert.match(policySql + foundationSql + authContext + policyHelper, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Missing required security token: ${token}`);
  checks += 1;
}

assert.doesNotMatch(policySql, /dealer_memberships/);
assert.doesNotMatch(policySql, /role in \('owner', 'administrator', 'staff'\)\s*or\s*auth\.uid\(\)/i);
assert.match(policySql, /for select\s*to authenticated\s*using \(\s*public\.is_dealer_member\(dealer_id\)\s*and\s*public\.is_record_authorized_for_user\('clients', id, auth\.uid\(\)\)/is);
assert.match(policySql, /bucket_id = 'licenceguard-documents'/i);
assert.match(policySql, /owner_user_id is null\s*or owner_user_id = auth\.uid\(\)/i);
assert.match(authContext, /role: 'owner' \| 'administrator' \| 'staff' \| 'tester'/i);
assert.match(policyHelper, /testerMustUseDedicatedWorkspace/i);
assert.match(policyHelper, /canAccessPrivateRecord/i);

checks += 4;
console.log(`Adversarial privacy regression checks passed (${checks}/${checks}). No production deployment was executed.`);
