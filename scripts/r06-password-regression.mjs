import assert from 'node:assert/strict';
import { loader, hookHarness } from './beta-test-support.mjs';
const calls = []; let expired = false;
const auth = {
  getUser: async () => ({ data: { user: expired ? null : { id: 'actor' } }, error: expired ? { message: 'expired' } : null }),
  updateUser: async (args) => { calls.push(['update',args]); return { error: null }; },
  resetPasswordForEmail: async (...args) => { calls.push(['request',...args]); return { error: null }; },
  setSession: async (args) => { calls.push(['session',args]); return { error: expired ? { message: 'expired' } : null }; },
  exchangeCodeForSession: async (code) => { calls.push(['code',code]); return { error: null }; },
};
const password = loader({ '../lib/supabase': { supabase: { auth } } })('src/services/passwordService.ts');
await assert.rejects(password.changePassword('long-password','different'), /do not match/); assert.equal(calls.length,0);
await assert.rejects(password.changePassword('short','short'), /at least 8/);
await password.changePassword('new-password','new-password'); assert.deepEqual(calls.pop(), ['update',{ password: 'new-password' }]);
await password.requestPasswordReset(' beta@example.com ', 'http://localhost:8081/');
assert.deepEqual(calls.pop(), ['request','beta@example.com',{ redirectTo: 'http://localhost:8081/?reset-password=1' }]);
await assert.rejects(password.requestPasswordReset('bad-email','http://localhost:8081/'), /valid email/);
assert.equal(password.passwordResetRedirect('https://beta.test/clients/private-client/application/draft'), 'https://beta.test/?reset-password=1');
assert.equal(password.isPasswordRecoveryUrl('https://beta.test/?reset-password=1'),true);
assert.equal(password.isPasswordRecoveryUrl('https://beta.test/#type=recovery'),true);
assert.equal(password.isPasswordRecoveryUrl('https://beta.test/'),false);
await password.acceptPasswordRecovery('https://beta.test/?reset-password=1#type=recovery&access_token=test&refresh_token=refresh',false);
assert.deepEqual(calls.pop(), ['session',{ access_token:'test',refresh_token:'refresh' }]);
await password.acceptPasswordRecovery('https://beta.test/?reset-password=1&code=one-use-code',false);
assert.deepEqual(calls.pop(), ['code','one-use-code']);
await assert.rejects(password.acceptPasswordRecovery('https://beta.test/?reset-password=1',false), /invalid or has expired/);
await assert.rejects(password.acceptPasswordRecovery('https://beta.test/?reset-password=1#error=access_denied',true), /invalid or has expired/);
await password.acceptPasswordRecovery('https://beta.test/?reset-password=1',true);
expired = true;
await assert.rejects(password.acceptPasswordRecovery('https://beta.test/?reset-password=1',true), /invalid or has expired/);
await assert.rejects(password.changePassword('new-password','new-password'), /expired/);
assert.equal(calls.length,0);
console.log('R06 passed: password change, mismatch, forgot-password request/redirect, recovery tokens/code, refresh, invalid and expired recovery.');

// Auth lifecycle: token refresh and password updates must not unmount the application.
const h = hookHarness(); let authEvent;
const session = { user: { id: 'actor' } };
const contextDb = {
  auth: { ...auth, getSession: async () => ({ data: { session } }),
    onAuthStateChange(callback) { authEvent = callback; return { data: { subscription: { unsubscribe() {} } } }; } },
  from() { const q = { select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; },
    then(resolve) { return Promise.resolve({ data: [{ dealer_id: 'dealer', role: 'owner', dealers: { name: 'Dealer' } }], error: null }).then(resolve); } }; return q; },
};
const react = { ...h.react, createContext: () => ({ Provider: 'Provider' }) };
h.mount(loader({ react, '../lib/supabase': { supabase: contextDb } })('src/context/AuthContext.tsx').AuthProvider, { children: null });
await h.settle(); assert.equal(h.tree.props.value.loading, false);
for (const event of ['TOKEN_REFRESHED', 'USER_UPDATED']) {
  authEvent(event, { ...session }); h.render();
  assert.equal(h.tree.props.value.loading, false, event + ' must not replace the app with its loading screen');
}
authEvent('PASSWORD_RECOVERY', session); await h.settle(); assert.equal(h.tree.props.value.recovery,true);
h.unmount();
console.log('R06 auth lifecycle passed: refresh/update preserve navigation; recovery selects password reset state.');
