'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');

function fixture() {
  let sheets = [{ properties: { sheetId: 1, title: 'Owner workspace', gridProperties: { rowCount: 100, columnCount: 5 } }, rows: [['keep this']] }];
  let rejectNext = false;
  let writes = 0;
  const props = { DATABASE_ID: 'test-spreadsheet', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', APP_URL: 'https://script.google.com/macros/s/test/exec' };
  let locked = false;
  const context = vm.createContext({
    Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isFinite,
    Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, text) => [...crypto.createHash('sha256').update(text).digest()] },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { locked = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] || null, setProperty: (key, value) => { props[key] = value; }, deleteProperty: key => { delete props[key]; }, getProperties: () => ({ ...props }) }) },
    Sheets: { Spreadsheets: {
      get: () => structuredClone({ sheets: sheets.map(sheet => ({ properties: sheet.properties })) }),
      Values: { batchGet: (_, options) => ({ valueRanges: options.ranges.map(range => ({ values: structuredClone(sheets.find(sheet => range.startsWith(`'${sheet.properties.title}'!`)).rows) })) }) },
      batchUpdate: batch => {
        const draft = structuredClone(sheets);
        for (const request of batch.requests) {
          if (request.addSheet) draft.push({ properties: structuredClone(request.addSheet.properties), rows: [] });
          else if (request.appendDimension) draft.find(sheet => sheet.properties.sheetId === request.appendDimension.sheetId).properties.gridProperties.rowCount += request.appendDimension.length;
          else if (request.updateCells) {
            const update = request.updateCells;
            const sheet = draft.find(sheet => sheet.properties.sheetId === update.range.sheetId);
            assert.ok(sheet);
            sheet.rows = structuredClone(update.rows.map(row => row.values.map(cell => {
              assert.deepEqual(Object.keys(cell.userEnteredValue), ['stringValue']);
              return cell.userEnteredValue.stringValue;
            })));
          } else throw new Error('Unexpected storage request');
        }
        if (rejectNext) { rejectNext = false; throw new Error('Injected Sheets atomic failure'); }
        sheets = draft; writes++;
      }
    } }
  });
  for (const file of ['store.js', 'domain.js', 'auth.js', 'apps-script.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', file), 'utf8'), context, { filename: file });
  return { context, props, sheets: () => sheets, reject() { rejectNext = true; }, writes: () => writes };
}

test('Apps Script initializes six versioned tables without changing owner sheets and is repeatable', () => {
  const f = fixture();
  f.context.initializeDatabase_();
  assert.equal(f.sheets().length, 7);
  assert.deepEqual(f.sheets()[0].rows, [['keep this']]);
  assert.deepEqual(f.sheets()[1].rows[0], ['RecordKey', 'CreatedAt', 'UpdatedAt', 'Version', 'DataJSON']);
  f.context.initializeDatabase_();
  assert.equal(f.writes(), 1);
});

test('actual Sheets adapter persists service records and makes data plus retry plus audit atomic', () => {
  const f = fixture();
  const service = f.context.runtime_().service;
  const user = service.upsertUser({ sub: 'accountA', email: 'a@example.com', emailVerified: true, name: 'Account A' });
  const request = { operation: 'createCampaign', payload: { name: '=SUM(1,2)', notes: 'owner-only secret' }, requestId: 'atomic-create' };
  const result = service.execute(user.id, request);
  const recreated = f.context.runtime_().service;
  assert.deepEqual(JSON.parse(JSON.stringify(recreated.execute(user.id, request))), JSON.parse(JSON.stringify(result)));
  const state = f.context.sheetsStore_().read(state => state);
  assert.equal(Object.keys(state.campaigns).length, 1);
  assert.equal(Object.keys(state.members).length, 1);
  assert.equal(Object.keys(state.audit).length, 1);
  assert.equal(Object.keys(state.mutations).length, 1);
  assert.equal(state.campaigns[result.campaign.id].name, '=SUM(1,2)');
});

test('Sheets rejects a failed batch without partial campaign membership or retry receipt', () => {
  const f = fixture();
  const service = f.context.runtime_().service;
  const user = service.upsertUser({ sub: 'A', email: 'a@example.com', emailVerified: true, name: 'A' });
  f.reject();
  const request = { operation: 'createCampaign', payload: { name: 'Nightfall' }, requestId: 'retry-safe' };
  assert.throws(() => service.execute(user.id, request), /Injected Sheets atomic failure/);
  const beforeRetry = f.context.sheetsStore_().read(state => state);
  for (const name of ['campaigns', 'members', 'mutations', 'audit']) assert.equal(Object.keys(beforeRetry[name]).length, 0);
  service.execute(user.id, request);
  assert.equal(Object.keys(f.context.sheetsStore_().read(state => state.campaigns)).length, 1);
});

test('unknown schemas fail closed without replacing user table contents', () => {
  const f = fixture(); f.context.initializeDatabase_();
  f.sheets().find(sheet => sheet.properties.title === 'Users').rows[0][0] = 'DifferentSchema';
  const before = structuredClone(f.sheets());
  assert.throws(() => f.context.sheetsStore_().transact(() => true), /schema/);
  assert.deepEqual(f.sheets(), before);
});

test('RPC extracts transport session token while rejecting forged identity fields', () => {
  const f = fixture();
  let received;
  f.context.runtime_ = () => ({ auth: { authorize: token => { assert.equal(token, 'secret-test-session'); return 'google:A'; } }, service: { execute: (userId, request) => { received = { userId, request }; return { campaigns: [] }; } } });
  const result = f.context.api({ operation: 'bootstrap', payload: {}, sessionToken: 'secret-test-session' });
  assert.equal(result.ok, true);
  assert.equal(received.userId, 'google:A');
  assert.equal(Object.hasOwn(received.request, 'sessionToken'), false);
});

test('RPC exposes only setting names and maps expired sessions to reauthentication', () => {
  const f = fixture();
  const config = f.context.api({ operation: 'publicConfig' });
  assert.equal(config.data.configured, true);
  assert.ok(!JSON.stringify(config).includes('test-secret'));
  f.context.runtime_ = () => ({ auth: { authorize: () => { throw Object.assign(new Error('Sign in again.'), { code: 'UNAUTHENTICATED' }); } } });
  const expired = f.context.api({ operation: 'bootstrap', payload: {}, sessionToken: 'fake' });
  assert.equal(expired.error.code, 'AUTH_REQUIRED');
});

test('callback page escapes injected strings and does not message arbitrary openers', () => {
  const f = fixture();
  f.context.HtmlService = { createHtmlOutput: html => ({ setTitle: () => html }) };
  const html = f.context.callbackHtml_({ error: '</script><img src=x onerror=alert(1)>' });
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('postMessage'));
});
