'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAuth } = require('../src/server/auth.js');

// All doubles live in tests; the app has no fallback or simulated Google identity.
function fixture(overrides = {}) {
  let clock = 1_800_000_000_000;
  let serial = 0;
  const records = new Map();
  const usersBySubject = new Map();
  const requests = [];
  const profiles = [];
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const vault = {
    get: key => records.has(key) ? structuredClone(records.get(key)) : null,
    set: (key, value) => records.set(key, structuredClone(value)),
    delete: key => records.delete(key),
    entries: prefix => [...records.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value: structuredClone(value) })),
    locked: fn => fn()
  };
  let tokenResponse = {
    status: 200,
    json: { access_token: 'google-test-access-token', token_type: 'Bearer', expires_in: 3600,
      scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      id_token: 'untrusted.id.token', refresh_token: 'must-never-leave-server' }
  };
  let profileResponse = {
    status: 200,
    json: { sub: 'google-subject-A', email: 'Investigator@Example.com', email_verified: true,
      name: 'Investigator', picture: 'https://example.com/avatar.png' }
  };
  let transportError = null;
  const auth = createAuth({
    config: overrides.config || {
      clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'test-secret',
      redirectUri: 'https://script.google.com/macros/s/test-deployment/exec', mode: 'production'
    },
    vault,
    nowMs: () => clock,
    id: () => (++serial).toString(16).padStart(32, '0'),
    digest,
    http: (url, options) => {
      requests.push({ url, options });
      if (transportError) throw transportError;
      return structuredClone(url.endsWith('/token') ? tokenResponse : profileResponse);
    },
    service: {
      upsertUser: profile => {
        profiles.push(structuredClone(profile));
        const existing = usersBySubject.get(profile.sub);
        const user = { id: existing?.id || 'user-' + (usersBySubject.size + 1),
          googleSubjectId: profile.sub, email: profile.email, name: profile.name };
        usersBySubject.set(profile.sub, user);
        return user;
      }
    }
  });
  const verifier = 'browser-secret-verifier-'.padEnd(64, 'X');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  function begin() { return auth.beginLogin({ browserChallenge: challenge }); }
  function callback(beginResult = begin()) {
    return auth.callback({ state: beginResult.state, code: 'google-auth-code' });
  }
  function login() { return auth.finishLogin({ ...callback(), browserVerifier: verifier }); }
  return {
    auth, records, requests, profiles, verifier, challenge, begin, callback, login,
    advance: ms => { clock += ms; },
    setToken: value => { tokenResponse = value; },
    setProfile: value => { profileResponse = value; },
    setTransportError: value => { transportError = value; }
  };
}

function rejectsCode(fn, code) {
  assert.throws(fn, error => error.code === code);
}

test('unconfigured authentication reports setting names and cannot mint a login', () => {
  const f = fixture({ config: {} });
  assert.deepEqual(f.auth.publicConfig(), {
    configured: false, missingSettings: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL'], mode: 'production'
  });
  rejectsCode(f.begin, 'AUTH_NOT_CONFIGURED');
  assert.equal(f.records.size, 0);
  assert.equal(f.requests.length, 0);
});

test('the public configuration never exposes an OAuth secret', () => {
  const result = fixture().auth.publicConfig();
  assert.equal(result.configured, true);
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
  assert.equal('clientSecret' in result, false);
});

test('production rejects insecure redirects and development permits loopback only', () => {
  for (const redirectUri of ['http://example.com/callback', 'javascript:alert(1)', 'http://localhost:3000/auth/callback']) {
    const f = fixture({ config: { clientId: 'id', clientSecret: 'secret', redirectUri } });
    rejectsCode(f.begin, 'AUTH_BAD_CONFIGURATION');
  }
  const local = fixture({ config: { clientId: 'id', clientSecret: 'secret',
    redirectUri: 'http://localhost:3000/auth/callback', mode: 'development' } });
  assert.ok(local.begin().authorizationUrl.startsWith('https://accounts.google.com/'));
  const remote = fixture({ config: { clientId: 'id', clientSecret: 'secret',
    redirectUri: 'http://example.com/auth/callback', mode: 'development' } });
  rejectsCode(remote.begin, 'AUTH_BAD_CONFIGURATION');
});

test('the authorization request uses code flow, the browser PKCE challenge, identity scopes, and account choice', () => {
  const f = fixture();
  const start = f.begin();
  const url = new URL(start.authorizationUrl);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), f.challenge);
  assert.equal(url.searchParams.get('state'), start.state);
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('access_type'), 'online');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(f.requests.length, 0);
});

test('missing, malformed, and non-SHA256 browser challenges fail before pending state is written', () => {
  const f = fixture();
  for (const browserChallenge of [undefined, '', 'x'.repeat(42), 'x'.repeat(44), '!'.repeat(43), { length: 43 }]) {
    rejectsCode(() => f.auth.beginLogin({ browserChallenge }), 'AUTH_BAD_CHALLENGE');
  }
  assert.equal(f.records.size, 0);
});

test('forged state and an expired state cannot yield a completion ticket', () => {
  const f = fixture();
  rejectsCode(() => f.auth.callback({ state: 'f'.repeat(64), code: 'forged' }), 'AUTH_INVALID_STATE');
  const start = f.begin();
  f.advance(10 * 60 * 1000);
  rejectsCode(() => f.auth.callback({ state: start.state, code: 'late' }), 'AUTH_INVALID_STATE');
  assert.equal(f.requests.length, 0);
});

test('callback consumes state once and returns only an opaque ticket plus correlation state', () => {
  const f = fixture();
  const start = f.begin();
  const returned = f.callback(start);
  assert.deepEqual(Object.keys(returned).sort(), ['state', 'ticket']);
  assert.equal(returned.state, start.state);
  assert.equal(JSON.stringify(returned).includes('google-auth-code'), false);
  rejectsCode(() => f.callback(start), 'AUTH_INVALID_STATE');
  assert.equal(f.requests.length, 0);
});

test('denied Google consent consumes state and preserves no provider error details', () => {
  const f = fixture();
  const start = f.begin();
  assert.throws(() => f.auth.callback({ state: start.state, error: 'provider-secret-error-details' }), error => {
    assert.equal(error.code, 'AUTH_CANCELLED');
    assert.equal(error.message.includes('provider-secret-error-details'), false);
    return true;
  });
  rejectsCode(() => f.callback(start), 'AUTH_INVALID_STATE');
  assert.equal(f.records.size, 0);
});

test('callback without a code fails and cannot be repeated with a different code', () => {
  const f = fixture();
  const start = f.begin();
  rejectsCode(() => f.auth.callback({ state: start.state }), 'AUTH_BAD_CALLBACK');
  rejectsCode(() => f.callback(start), 'AUTH_INVALID_STATE');
});

test('a visible ticket cannot be exchanged without the original browser verifier', () => {
  const f = fixture();
  const result = f.callback();
  rejectsCode(() => f.auth.finishLogin({ ticket: result.ticket, browserVerifier: 'attacker'.padEnd(64, 'A') }),
    'AUTH_VERIFIER_MISMATCH');
  assert.equal(f.requests.length, 0);
  // Incorrect guesses do not let another observer destroy the legitimate browser's login.
  const signedIn = f.auth.finishLogin({ ...result, browserVerifier: f.verifier });
  assert.equal(signedIn.user.id, 'user-1');
});

test('expired and unknown completion tickets cannot invoke Google', () => {
  const f = fixture();
  rejectsCode(() => f.auth.finishLogin({ ticket: 'f'.repeat(64), browserVerifier: f.verifier }), 'AUTH_INVALID_TICKET');
  const returned = f.callback();
  f.advance(10 * 60 * 1000);
  rejectsCode(() => f.auth.finishLogin({ ...returned, browserVerifier: f.verifier }), 'AUTH_INVALID_TICKET');
  assert.equal(f.requests.length, 0);
});

test('completion exchanges the bound code over TLS and trusts only Google userinfo', () => {
  const f = fixture();
  const returned = f.callback();
  const result = f.auth.finishLogin({ ...returned, browserVerifier: f.verifier,
    userId: 'attacker', sub: 'attacker', email: 'attacker@example.com', role: 'GM', idToken: 'forged.jwt' });
  assert.equal(f.requests[0].url, 'https://oauth2.googleapis.com/token');
  const body = new URLSearchParams(f.requests[0].options.body);
  assert.equal(body.get('code_verifier'), f.verifier);
  assert.equal(body.get('code'), 'google-auth-code');
  assert.equal(body.get('client_id'), 'test-client.apps.googleusercontent.com');
  assert.equal(body.get('client_secret'), 'test-secret');
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(f.requests[1].url, 'https://openidconnect.googleapis.com/v1/userinfo');
  assert.equal(f.requests[1].options.headers.Authorization, 'Bearer google-test-access-token');
  assert.deepEqual(f.profiles[0], { sub: 'google-subject-A', email: 'investigator@example.com',
    emailVerified: true, name: 'Investigator' });
  assert.equal(result.user.id, 'user-1');
  assert.equal(f.auth.authorize(result.sessionToken), 'user-1');
  const publicResult = JSON.stringify(result);
  for (const sensitive of ['google-test-access-token', 'untrusted.id.token', 'must-never-leave-server', 'test-secret']) {
    assert.equal(publicResult.includes(sensitive), false);
  }
});

test('successful completion is single-use even when replayed with the correct verifier', () => {
  const f = fixture();
  const returned = f.callback();
  f.auth.finishLogin({ ...returned, browserVerifier: f.verifier });
  rejectsCode(() => f.auth.finishLogin({ ...returned, browserVerifier: f.verifier }), 'AUTH_INVALID_TICKET');
  assert.equal(f.requests.length, 2);
});

test('Google errors do not leak upstream payloads or create an authenticated session', () => {
  const f = fixture();
  f.setToken({ status: 400, json: { error: 'invalid_grant', error_description: 'sensitive upstream details' } });
  const returned = f.callback();
  assert.throws(() => f.auth.finishLogin({ ...returned, browserVerifier: f.verifier }), error => {
    assert.equal(error.code, 'AUTH_PROVIDER_REJECTED');
    assert.equal(error.message.includes('sensitive upstream details'), false);
    return true;
  });
  rejectsCode(() => f.auth.finishLogin({ ...returned, browserVerifier: f.verifier }), 'AUTH_INVALID_TICKET');
  assert.equal(f.profiles.length, 0);
  assert.equal([...f.records.keys()].some(key => key.startsWith('auth:session:')), false);
});

test('network transport failures use a safe error and require a fresh login', () => {
  const f = fixture();
  f.setTransportError(new Error('secret-token-in-adapter-error'));
  const returned = f.callback();
  assert.throws(() => f.auth.finishLogin({ ...returned, browserVerifier: f.verifier }), error => {
    assert.equal(error.code, 'AUTH_PROVIDER_UNAVAILABLE');
    assert.equal(error.message.includes('secret-token-in-adapter-error'), false);
    return true;
  });
  rejectsCode(() => f.auth.finishLogin({ ...returned, browserVerifier: f.verifier }), 'AUTH_INVALID_TICKET');
});

test('invalid token grants cannot fall back to an ID token or client claims', () => {
  for (const token of [
    { id_token: 'looks.like.jwt' },
    { access_token: 'access', token_type: 'Basic', expires_in: 3600, scope: 'openid' },
    { access_token: 'access', token_type: 'Bearer', expires_in: 0, scope: 'openid' },
    { access_token: 'access', token_type: 'Bearer', expires_in: 3600, scope: 'email profile' }
  ]) {
    const f = fixture();
    f.setToken({ status: 200, json: token });
    rejectsCode(f.login, 'AUTH_PROVIDER_REJECTED');
    assert.equal(f.profiles.length, 0);
  }
});

test('Google userinfo must include verified email and immutable subject', () => {
  for (const profile of [
    { sub: 'subject', email: 'person@example.com', email_verified: false },
    { sub: 'subject', email: 'person@example.com', email_verified: 'true' },
    { email: 'person@example.com', email_verified: true },
    { sub: 'subject', email: 'malformed', email_verified: true },
    { sub: 'subject\n', email: 'person@example.com', email_verified: true }
  ]) {
    const f = fixture();
    f.setProfile({ status: 200, json: profile });
    rejectsCode(f.login, 'AUTH_UNVERIFIED_IDENTITY');
    assert.equal(f.profiles.length, 0);
    assert.equal([...f.records.keys()].some(key => key.startsWith('auth:session:')), false);
  }
});

test('userinfo rejection creates no user even if a token grant succeeded', () => {
  const f = fixture();
  f.setProfile({ status: 401, json: { error: 'invalid_token' } });
  rejectsCode(f.login, 'AUTH_PROVIDER_REJECTED');
  assert.equal(f.profiles.length, 0);
});

test('Google subject drives repeated account identity across display name and email changes', () => {
  const f = fixture();
  const first = f.login();
  f.setProfile({ status: 200, json: { sub: 'google-subject-A', email: 'renamed@example.com',
    email_verified: true, name: 'Renamed' } });
  const second = f.login();
  assert.equal(first.user.id, second.user.id);
  assert.equal(second.user.email, 'renamed@example.com');
  assert.notEqual(first.sessionToken, second.sessionToken);
  assert.equal(f.profiles[0].sub, f.profiles[1].sub);
});

test('provider display metadata fits the domain contract without turning literal characters into markup', () => {
  const f = fixture();
  f.setProfile({ status: 200, json: { sub: 'google-subject-A', email: 'person@example.com',
    email_verified: true, name: '  <Emily & Ellis>\n\t' + 'x'.repeat(200) } });
  f.login();
  assert.equal(f.profiles[0].name.length, 120);
  assert.ok(f.profiles[0].name.startsWith('<Emily & Ellis> '));
  assert.equal(/[\n\t]/.test(f.profiles[0].name), false);
  f.setProfile({ status: 200, json: { sub: 'google-subject-A', email: 'person@example.com',
    email_verified: true, name: '\n\t ' } });
  f.login();
  assert.equal(f.profiles[1].name, 'person@example.com');
});

test('sessions store only a token digest and cannot be forged by submitting a user ID', () => {
  const f = fixture();
  const result = f.login();
  const serialized = JSON.stringify([...f.records]);
  assert.equal(serialized.includes(result.sessionToken), false);
  assert.equal(serialized.includes('google-auth-code'), false);
  rejectsCode(() => f.auth.authorize('user-1'), 'UNAUTHENTICATED');
  rejectsCode(() => f.auth.authorize('f'.repeat(64)), 'UNAUTHENTICATED');
  rejectsCode(() => f.auth.authorize(undefined), 'UNAUTHENTICATED');
});

test('eight-hour session expiry removes authentication and logout revokes one session', () => {
  const f = fixture();
  const first = f.login();
  const second = f.login();
  assert.deepEqual(f.auth.logout(first.sessionToken), { loggedOut: true });
  rejectsCode(() => f.auth.authorize(first.sessionToken), 'UNAUTHENTICATED');
  assert.equal(f.auth.authorize(second.sessionToken), second.user.id);
  f.advance(8 * 60 * 60 * 1000);
  rejectsCode(() => f.auth.authorize(second.sessionToken), 'UNAUTHENTICATED');
  assert.equal([...f.records.keys()].some(key => key.startsWith('auth:session:')), false);
});

test('pending logins have a bounded quota and expired records are pruned before the next login', () => {
  const f = fixture();
  for (let index = 0; index < 100; index += 1) f.begin();
  rejectsCode(f.begin, 'AUTH_BUSY');
  assert.equal(f.records.size, 100);
  f.advance(10 * 60 * 1000);
  f.begin();
  assert.equal(f.records.size, 1);
});

test('PKCE works with the RFC 7636 standard S256 verifier', () => {
  const f = fixture();
  const browserVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const browserChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  const start = f.auth.beginLogin({ browserChallenge });
  const returned = f.callback(start);
  const result = f.auth.finishLogin({ ...returned, browserVerifier });
  assert.equal(f.auth.authorize(result.sessionToken), 'user-1');
});

test('original-tab polling waits for callback and completes without cross-origin window messaging', () => {
  const f = fixture();
  const start = f.begin();
  assert.deepEqual(f.auth.pollLogin({ state: start.state, browserVerifier: f.verifier }), { pending: true });
  assert.equal(f.requests.length, 0);
  f.callback(start);
  const result = f.auth.pollLogin({ state: start.state, browserVerifier: f.verifier });
  assert.equal(result.pending, false);
  assert.equal(f.auth.authorize(result.sessionToken), 'user-1');
  assert.equal([...f.records.keys()].some(key => key.startsWith('oauth:')), false);
  rejectsCode(() => f.auth.pollLogin({ state: start.state, browserVerifier: f.verifier }), 'AUTH_INVALID_STATE');
});

test('polling cannot disclose or finish another tab login without its verifier', () => {
  const f = fixture();
  const start = f.begin();
  const attacker = { state: start.state, browserVerifier: 'attacker'.padEnd(64, 'A') };
  rejectsCode(() => f.auth.pollLogin(attacker), 'AUTH_VERIFIER_MISMATCH');
  f.callback(start);
  rejectsCode(() => f.auth.pollLogin(attacker), 'AUTH_VERIFIER_MISMATCH');
  assert.equal(f.requests.length, 0);
  const result = f.auth.pollLogin({ state: start.state, browserVerifier: f.verifier });
  assert.equal(result.user.id, 'user-1');
});

test('unknown, expired, and cancelled sign-ins end polling without a session', () => {
  const f = fixture();
  rejectsCode(() => f.auth.pollLogin({ state: 'a'.repeat(64), browserVerifier: f.verifier }), 'AUTH_INVALID_STATE');
  const start = f.begin();
  f.callback(start);
  f.advance(10 * 60 * 1000);
  rejectsCode(() => f.auth.pollLogin({ state: start.state, browserVerifier: f.verifier }), 'AUTH_INVALID_STATE');
  assert.equal([...f.records.keys()].some(key => key.startsWith('oauth:')), false);
  const cancelled = f.begin();
  rejectsCode(() => f.auth.callback({ state: cancelled.state, error: 'access_denied' }), 'AUTH_CANCELLED');
  rejectsCode(() => f.auth.pollLogin({ state: cancelled.state, browserVerifier: f.verifier }), 'AUTH_INVALID_STATE');
  assert.equal(f.requests.length, 0);
});

test('manual ticket completion clears polling state and cannot yield a second session', () => {
  const f = fixture();
  const start = f.begin();
  const returned = f.callback(start);
  const result = f.auth.finishLogin({ ...returned, browserVerifier: f.verifier });
  assert.equal(f.auth.authorize(result.sessionToken), 'user-1');
  rejectsCode(() => f.auth.pollLogin({ state: start.state, browserVerifier: f.verifier }), 'AUTH_INVALID_STATE');
  assert.equal(f.requests.length, 2);
});
