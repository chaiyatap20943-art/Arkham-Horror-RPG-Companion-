'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

function loadModules() {
  const context = vm.createContext({ Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, encodeURIComponent, decodeURIComponent, isFinite });
  for (const name of ['store', 'domain', 'auth']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', `${name}.js`), 'utf8'), context, { filename: `${name}.js` });
  }
  return context.Arkham;
}

function atomicWrite(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function fileStore(filename, initial) {
  const read = () => fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : structuredClone(initial);
  return {
    read(fn) { return fn(read()); },
    transact(fn) {
      // All domain callbacks are synchronous in one local Node process.
      const draft = read();
      const result = fn(draft);
      atomicWrite(filename, draft);
      return result;
    }
  };
}

function fileVault(filename) {
  const read = () => fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
  let working = null;
  function mutate(fn) {
    if (working) return fn(working);
    const data = read();
    const result = fn(data);
    atomicWrite(filename, data);
    return result;
  }
  return {
    get(key) { return (working || read())[key] || null; },
    set(key, value) { mutate(data => { data[key] = value; }); },
    delete(key) { mutate(data => { delete data[key]; }); },
    entries(prefix) { return Object.entries(working || read()).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })); },
    locked(fn) {
      if (working) throw new Error('Nested private vault lock.');
      working = read();
      try {
        const result = fn();
        atomicWrite(filename, working);
        return result;
      } finally { working = null; }
    }
  };
}

function googleHttp(url, options) {
  // Keep credentials out of process arguments and logs. Child stdin is private.
  const result = spawnSync(process.execPath, [path.join(__dirname, 'google-http.cjs')], {
    input: JSON.stringify({ url, options }), encoding: 'utf8', timeout: 20000,
    maxBuffer: 100000, env: { ...process.env, NODE_USE_ENV_PROXY: '1' }
  });
  if (result.status !== 0 || result.error) throw new Error('Google identity service is unavailable.');
  return JSON.parse(result.stdout);
}

function runtime(options = {}) {
  const A = loadModules();
  const directory = options.directory || process.env.ARKHAM_LOCAL_DIR || path.join(__dirname, '../.local');
  const store = options.store || fileStore(path.join(directory, 'database.json'), A.emptyState());
  const digest = text => crypto.createHash('sha256').update(text).digest('hex');
  const id = () => crypto.randomBytes(24).toString('hex');
  const service = A.createService({ store, now: () => new Date().toISOString(), id, digest });
  const auth = A.createAuth({
    config: options.config || { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: process.env.APP_URL || 'http://localhost:3000/oauth/callback', mode: 'development' },
    vault: options.vault || fileVault(path.join(directory, 'private-auth.json')),
    nowMs: Date.now, id, digest, http: options.http || googleHttp, service
  });
  return { service, auth, store };
}

function dispatch(current, request) {
  const requestId = request && typeof request.requestId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(request.requestId) ? request.requestId : crypto.randomUUID();
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request) || JSON.stringify(request).length > 30000) {
      throw Object.assign(new Error('Invalid request.'), { code: 'VALIDATION' });
    }
    let data;
    if (request.operation === 'publicConfig') data = current.auth.publicConfig();
    else if (request.operation === 'beginLogin') data = current.auth.beginLogin(request.payload || {});
    else if (request.operation === 'finishLogin') data = current.auth.finishLogin(request.payload || {});
    else if (request.operation === 'pollLogin') data = current.auth.pollLogin(request.payload || {});
    else if (request.operation === 'logout') data = current.auth.logout(request.sessionToken);
    else {
      const userId = current.auth.authorize(request.sessionToken);
      const domainRequest = { ...request };
      delete domainRequest.sessionToken;
      data = current.service.execute(userId, domainRequest);
    }
    return { ok: true, requestId, data };
  } catch (error) {
    const publicCodes = /^(AUTH_[A-Z_]+|UNAUTHENTICATED|AUTH_REQUIRED|FORBIDDEN|NOT_FOUND|VALIDATION|CONFLICT|IDEMPOTENCY_CONFLICT|CONFIGURATION|RATE_LIMITED)$/;
    let code = publicCodes.test(error.code || '') ? error.code : 'SERVER_ERROR';
    if (code === 'UNAUTHENTICATED') code = 'AUTH_REQUIRED';
    return { ok: false, requestId, error: { code, message: code === 'SERVER_ERROR' ? 'The request could not be completed. Try again.' : error.message } };
  }
}

module.exports = { loadModules, atomicWrite, fileStore, fileVault, runtime, dispatch };
