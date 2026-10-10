import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loader, hookHarness, nativeMock, nodes } from './beta-test-support.mjs';
const require = createRequire(import.meta.url);
const { PGlite } = require('../.tmp/generated-documents-rls-runtime/node_modules/@electric-sql/pglite');
const pg = new PGlite();
const migration = readFileSync('supabase/migrations/20261010_public_registration.sql', 'utf8');
const schema = readFileSync('supabase/licenceguard_schema.sql', 'utf8');
const privacy = readFileSync('supabase/migrations/20260928_privacy_enforcement.sql', 'utf8');
const foundation = readFileSync('supabase/migrations/20260927_privacy_authorization_foundation.sql', 'utf8');
const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const details = { firstName: ' Test ', surname: ' Applicant ', idNumber: '8001015009087', email: ' Test@example.com ', password: 'test-password', confirmation: 'test-password' };
let session = null, event, signupArgs, failSignup = false, failMembership = false, automaticSignup = false, releaseLogout;
const auth = {
  async signUp(args) {
    signupArgs = args;
    if (failSignup) return { error: { message: 'Signup unavailable' } };
    if (automaticSignup) { session = { user: { id: actor } }; event?.('SIGNED_IN', session); }
    return { data: { user: { id: actor }, session: null }, error: null };
  },
  async signOut() { if (automaticSignup) await new Promise(resolve => { releaseLogout = resolve; }); session = null; event?.('SIGNED_OUT', null); return { error: null }; },
  async signInWithPassword() { session = { user: { id: actor } }; event?.('SIGNED_IN', session); return { data: { user: session.user, session }, error: null }; },
  async getSession() { return { data: { session } }; },
  onAuthStateChange(callback) { event = callback; return { data: { subscription: { unsubscribe() {} } } }; },
};
const registration = loader({ '../lib/supabase': { supabase: { auth } } })('src/services/registrationService.ts');
for (const bad of [{ firstName: '' }, { idNumber: '8001015009088' }, { email: 'bad' }, { confirmation: 'different' }, { password: 'short', confirmation: 'short' }]) {
  await assert.rejects(registration.registerAccount({ ...details, ...bad }));
  assert.equal(signupArgs, undefined, 'invalid input must not reach Auth');
}
await registration.registerAccount(details);
session = { user: { id: actor } };
await registration.registerAccount(details);
assert.equal(session, null, 'confirmation-disabled signup also returns to explicit login');
assert.equal(signupArgs.email, 'test@example.com');
assert.equal(signupArgs.options.data.first_name, 'Test');
assert.equal(signupArgs.options.data.licenceguard_registration, 'v1');
failSignup = true;
await assert.rejects(registration.registerAccount(details), /Signup unavailable/);
failSignup = false;
try {
  await pg.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    create type public.dealer_user_role as enum ('owner','administrator','staff','tester');
    create type public.notification_channel as enum ('WHATSAPP','EMAIL','SMS');
    create type public.record_scope as enum ('PRIVATE','SHARED','TEST');
  `);
  for (const table of ['dealers', 'dealer_users', 'clients']) {
    await pg.exec(schema.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`))[0]);
  }
  await pg.exec(`alter table public.dealers add workspace_kind text default 'PRODUCTION';
    alter table public.clients add owner_user_id uuid references auth.users(id), add record_scope public.record_scope default 'PRIVATE';
    create table public.dealer_user_permissions (user_id uuid, dealer_id uuid, permission text, scope_type text, expires_at timestamptz);
  `);
  await pg.exec(foundation.match(/create or replace function public\.assert_record_privacy_fields\([\s\S]*?\$\$;/)[0]);
  await pg.exec(`create trigger clients_assert_privacy before insert or update on public.clients for each row execute function public.assert_record_privacy_fields();`);
  await pg.exec(migration);
  await pg.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [actor, signupArgs.email, signupArgs.options.data]);
  const client = (await pg.query('select * from public.clients')).rows[0];
  assert.equal(client.owner_user_id, actor); assert.equal(client.record_scope, 'PRIVATE');
  assert.equal((await pg.query('select * from public.dealer_users')).rows.length, 1);
  assert.equal((await pg.query('select raw_user_meta_data from auth.users')).rows[0].raw_user_meta_data.id_number, undefined);
  await assert.rejects(pg.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [other, 'other@example.com', { ...signupArgs.options.data, id_number: '8001015009088' }]));
  assert.equal((await pg.query('select * from auth.users')).rows.length, 1, 'failed provisioning rolls back Auth user');
  assert.equal((await pg.query('select * from public.dealers')).rows.length, 1, 'failed provisioning creates no workspace');
  // Inject a downstream storage failure to prove transaction rollback after workspace/membership insertion.
  await pg.exec(`alter table public.clients add constraint test_failure check (first_name <> 'Fail');`);
  await assert.rejects(pg.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [other, 'other@example.com', { ...signupArgs.options.data, first_name: 'Fail' }]));
  assert.equal((await pg.query('select * from public.dealers')).rows.length, 1);
  assert.equal((await pg.query('select * from public.dealer_users')).rows.length, 1);
  await pg.query('insert into auth.users (id,email) values ($1,$2)', [other, 'other@example.com']);
  assert.equal((await pg.query('select * from public.dealers')).rows.length, 1, 'unmarked admin-created user unchanged');
  await pg.query(`insert into public.dealer_users (dealer_id,user_id,role) values ($1,$2,'staff')`, [client.dealer_id, other]);
  await pg.exec(schema.match(/create or replace function public\.is_dealer_member\([\s\S]*?\$\$;/)[0]);
  await pg.exec(schema.match(/create or replace function public\.is_dealer_admin\([\s\S]*?\$\$;/)[0]);
  // Same test-only helper adjustment used by generated-document-rls-regression:
  // deployed helper is SECURITY DEFINER; repository body remains unchanged.
  await pg.exec(privacy.match(/create or replace function public\.is_record_authorized_for_user\([\s\S]*?\$\$;/)[0].replace('security invoker', 'security definer'));
  await pg.exec(`alter table public.clients enable row level security; grant usage on schema auth to authenticated; grant select, update on public.clients to authenticated; grant select on public.dealer_users to authenticated;`);
  for (const policy of privacy.matchAll(/create policy "[^"]+"\s+on public\.clients[\s\S]*?;/g)) await pg.exec(policy[0]);
  await pg.query(`select set_config('test.actor',$1,false)`, [actor]);
  await pg.exec('set role authenticated');
  assert.equal((await pg.query('select * from public.clients')).rows.length, 1);
  await pg.query(`update public.clients set city = 'Durban' where id = $1`, [client.id]);
  await pg.query(`select set_config('test.actor',$1,false)`, [other]);
  assert.equal((await pg.query('select * from public.clients')).rows.length, 0, 'same-dealer staff cannot see owner profile');
  assert.equal((await pg.query(`update public.clients set city='Other' where id=$1 returning id`, [client.id])).rows.length, 0);
  await assert.rejects(pg.exec('select public.initialize_public_registration()'), /permission denied/);
  await pg.exec('reset role');
  const db = { auth, from() { const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
    async then(resolve) { const rows = (await pg.query('select dealer_id,role,full_name from public.dealer_users where user_id=$1', [actor])).rows.map(row => ({ ...row, dealers: { name: 'Test Applicant' } })); return resolve({ data: failMembership ? [] : rows, error: null }); } }; return q; } };
  const h = hookHarness();
  h.mount(loader({ react: { ...h.react, createContext: () => ({ Provider: 'Provider' }) }, '../lib/supabase': { supabase: db } })('src/context/AuthContext.tsx').AuthProvider, { children: null });
  await h.settle();
  automaticSignup = true;
  const pendingSignup = h.tree.props.value.registerAccount(details);
  await h.settle();
  assert.equal(h.tree.props.value.registering, true, 'auto-signin must keep registration gated during logout');
  releaseLogout(); await pendingSignup; automaticSignup = false; await h.settle();
  assert.equal(h.tree.props.value.session, null); assert.equal(h.tree.props.value.registering, false);
  await h.tree.props.value.signIn(details.email, details.password); await h.settle();
  assert.equal(h.tree.props.value.dealerProfile.dealerId, client.dealer_id);
  await h.tree.props.value.signOut(); await h.settle(); assert.equal(h.tree.props.value.session, null);
  await h.tree.props.value.signIn(details.email, details.password); await h.settle();
  assert.equal((await pg.query('select city from public.clients where id=$1', [client.id])).rows[0].city, 'Durban');
  failMembership = true;
  await assert.rejects(h.tree.props.value.signIn(details.email, details.password), /not linked/); await h.settle();
  assert.equal(h.tree.props.value.session, null); assert.equal(h.tree.props.value.dealerProfile, null);
  h.unmount();
  assert.match(readFileSync('App.tsx','utf8'), /if \(!session \|\| !dealerProfile \|\| registering\)/, 'restored session must fail closed without membership; signup must wait for explicit login');
  console.log('PASS: signup validation/errors; real PostgreSQL atomic provisioning and rollback; metadata minimization; unchanged admin creation; owner RLS/same-dealer staff isolation; mocked Auth login/logout with real DB persistence; missing membership fails closed.');
} finally { await pg.close(); }

const h = hookHarness(); let submitted;
h.mount(loader({ react: h.react, 'react-native': nativeMock, '../utils/userAlert': { userAlert: { alert() {} } }, '../services/passwordService': { requestPasswordReset: async () => {} }, 'lucide-react-native': { LockKeyhole: 'Lock', Mail: 'Mail' }, '../components/LicenceGuardLogo': { default: 'Logo' }, '../context/AuthContext': { useAuth: () => ({ loading: false, signIn: async () => {}, registerAccount: async input => { submitted = input; } }) } })('src/screens/LoginScreen.tsx').default, {});
await h.settle();
const findText = label => nodes(h.tree).find(n => n.type === 'Text' && n.props.children === label);
const pressFor = label => nodes(h.tree).find(n => n.type === 'Pressable' && nodes(n.props.children).some(child => child.type === 'Text' && child.props.children === label));
pressFor('Register / Create Account').props.onPress(); await h.settle();
for (const [label, value] of [['First name','Test'], ['Surname','Applicant'], ['South African ID number',details.idNumber], ['Confirm password',details.password]]) nodes(h.tree).find(n => n.props.accessibilityLabel === label).props.onChangeText(value);
nodes(h.tree).find(n => n.props.autoComplete === 'email').props.onChangeText(details.email);
nodes(h.tree).find(n => n.props.autoComplete === 'new-password' && !n.props.accessibilityLabel).props.onChangeText(details.password);
await h.settle(); pressFor('Create account').props.onPress(); await h.settle();
assert.equal(submitted.idNumber, details.idNumber); assert.ok(findText('Sign in'));
assert.ok(nodes(h.tree).some(n => n.props.accessibilityRole === 'alert' && /Check your inbox/.test(n.props.children)));
h.unmount(); console.log('PASS: public register form submits minimum details and returns to login with confirmation guidance.');
