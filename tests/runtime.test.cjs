'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { runtime, dispatch, fileStore } = require('../scripts/node-runtime.cjs');

test('local atomic storage survives reopening and rolls back callback exceptions', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkham-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'db.json');
  const store = fileStore(filename, { value: 0 });
  store.transact(data => { data.value = 1; });
  assert.throws(() => store.transact(data => { data.value = 2; throw new Error('failure'); }));
  assert.equal(fileStore(filename, {}).read(data => data.value), 1);
  assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
});

test('real dispatch joins authentication, campaign persistence, retry and revocation using test provider responses', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkham-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = { clientId: 'test-client', clientSecret: 'test-provider-secret', redirectUri: 'http://localhost:3000/oauth/callback', mode: 'development' };
  const http = (url, request) => {
    if (url.endsWith('/token')) {
      assert.ok(request.body.includes('code_verifier='));
      return { status: 200, json: { access_token: 'test-only-provider-token', token_type: 'Bearer', expires_in: 3600, scope: 'openid email profile' } };
    }
    return { status: 200, json: { sub: 'test-account', email: 'investigator@example.com', email_verified: true, name: 'Test Investigator' } };
  };
  const instance = runtime({ directory: dir, config, http });
  const denied = dispatch(instance, { operation: 'bootstrap', payload: {} });
  assert.equal(denied.error.code, 'AUTH_REQUIRED');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const started = dispatch(instance, { operation: 'beginLogin', payload: { browserChallenge: challenge } }).data;
  assert.equal(dispatch(instance, { operation: 'pollLogin', payload: { state: started.state, browserVerifier: verifier } }).data.pending, true);
  instance.auth.callback({ state: started.state, code: 'test-only-provider-code' });
  const login = dispatch(instance, { operation: 'pollLogin', payload: { state: started.state, browserVerifier: verifier } }).data;
  assert.equal(login.user.id, 'google:test-account');
  const request = { operation: 'createCampaign', payload: { name: 'Miskatonic After Dark', notes: 'GM only' }, requestId: 'browser-like-create', sessionToken: login.sessionToken };
  const created = dispatch(instance, request);
  assert.equal(created.ok, true);
  const fresh = runtime({ directory: dir, config, http });
  assert.deepEqual(dispatch(fresh, request), created);
  assert.equal(dispatch(fresh, { operation: 'bootstrap', payload: {}, sessionToken: login.sessionToken }).data.campaigns.length, 1);
  const forged = dispatch(fresh, { operation: 'bootstrap', payload: {}, sessionToken: login.sessionToken, userId: 'google:somebody-else' });
  assert.equal(forged.error.code, 'VALIDATION');
  const persistent = fs.readFileSync(path.join(dir, 'private-auth.json'), 'utf8');
  for (const secret of [login.sessionToken, verifier, 'test-only-provider-token', 'test-only-provider-code', 'test-provider-secret']) assert.ok(!persistent.includes(secret));
  dispatch(fresh, { operation: 'logout', sessionToken: login.sessionToken });
  assert.equal(dispatch(instance, { operation: 'bootstrap', payload: {}, sessionToken: login.sessionToken }).error.code, 'AUTH_REQUIRED');
});
