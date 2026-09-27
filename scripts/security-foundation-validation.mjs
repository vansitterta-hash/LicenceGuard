import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260927_privacy_authorization_foundation.sql', 'utf8');
const workspaceEvents = readFileSync('supabase/migrations/20260720_application_workspace_events.sql', 'utf8');
const authTypes = readFileSync('src/types/authorization.ts', 'utf8');
const authPolicy = readFileSync('src/utils/authorizationPolicy.ts', 'utf8');

const requiredSql = [
  'workspace_kind',
  'dealer_user_permissions',
  'record_scope',
  'owner_user_id',
  'has_workspace_role',
  'has_permission',
  'tester',
  'dealer_users',
];

for (const token of requiredSql) {
  assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Missing migration token: ${token}`);
}

assert.doesNotMatch(workspaceEvents, /dealer_memberships/);
assert.match(workspaceEvents, /join public\.dealer_users du/);
assert.match(authTypes, /WORKSPACE_KINDS/);
assert.match(authTypes, /DEALER_USER_ROLES/);
assert.match(authTypes, /RECORD_SCOPES/);
assert.match(authTypes, /DEALER_PERMISSIONS/);
assert.match(authPolicy, /DEFAULT_WORKSPACE_KIND/);
assert.match(authPolicy, /requiresExplicitPrivateAccess/);

const checks = requiredSql.length + 7;
console.log(`Security foundation validation passed (${checks} checks). No database deployment was executed.`);
