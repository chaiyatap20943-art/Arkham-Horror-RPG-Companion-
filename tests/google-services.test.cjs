'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,0]);

function fixture() {
  const props = {};
  const fetched = [], created = [], updated = [], sleeps = [];
  const files = new Map();
  let providerStatus = 200;
  let providerResult = { text: 'Translated 2 XP.' };
  let serial = 0;
  let database = { materials: {}, books: {}, assets: {} };
  const propertyService = { getProperty: key => props[key] || null, setProperty: (key, value) => { props[key] = value; }, deleteProperty: key => { delete props[key]; }, getProperties: () => ({ ...props }) };
  const context = vm.createContext({ Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isFinite,
    PropertiesService: { getScriptProperties: () => propertyService },
    Utilities: { base64Decode: value => [...Buffer.from(value, 'base64')], base64Encode: bytes => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }), sleep: ms => { sleeps.push(ms); } },
    ScriptApp: { getOAuthToken: () => 'OWNER_TEST_TOKEN' },
    Drive: { Files: {
      get: id => { if (!files.has(id)) throw new Error('Private provider details'); return structuredClone(files.get(id)); },
      create: (metadata, blob) => {
        const file = { id: 'private-id-' + (++serial), ...structuredClone(metadata),
          permissions: [{ id: 'owner-permission', type: 'user', role: 'owner' }], trashed: false, size: String(blob?.bytes?.length || 0) };
        files.set(file.id, file); created.push({ metadata, blob }); return structuredClone(file);
      },
      update: (metadata, id) => { updated.push({ metadata, id }); Object.assign(files.get(id), metadata); return structuredClone(files.get(id)); }
    } },
    UrlFetchApp: { fetch: (url, options) => {
      fetched.push({ url, options });
      if (url.startsWith('https://www.googleapis.com/drive/')) return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [...PNG] }) };
      return { getResponseCode: () => providerStatus, getContentText: () => JSON.stringify(providerStatus === 200 ?
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(providerResult) }] } }] } :
        { error: { message: 'SENSITIVE_TEST_PROVIDER_BODY' } }) };
    } },
    sheetsStore_: () => ({ read: fn => fn(database) })
  });
  for (const name of ['library', 'google-services']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', name + '.js'), 'utf8'), context);
  function init() { return context.initializePrivateStorage_(); }
  function upload() { init(); return context.googleFiles_({ action: 'save', name: 'Private page', mimeType: 'image/png', base64: PNG.toString('base64') }); }
  return { context, props, fetched, created, updated, sleeps, files, init, upload,
    provider: (status, result) => { providerStatus = status; providerResult = result; }, database: value => { database = value; } };
}
function fails(fn, code) { assert.throws(fn, error => error.code === code); }

test('missing Gemini configuration returns a safe optional-service state with no provider request', () => {
  const f = fixture();
  assert.equal(f.context.googleAI_({ kind: 'translate', text: '2 XP', language: 'th' }).configured, false);
  assert.equal(f.fetched.length, 0);
});

test('Gemini sends minimized context, structured output and the API key only in a protected header', () => {
  const f = fixture(); f.props.GEMINI_API_KEY = 'TEST_PRIVATE_KEY';
  f.provider(200, { answer: 'Grounded explanation', citations: [{ sourceId: 'permitted-source' }] });
  const result = f.context.googleAI_({ kind: 'assistant', question: 'How does 2 XP work?', language: 'th', mode: 'RULES',
    context: [{ sourceId: 'permitted-source', text: 'Verified small reference' }], citations: [{ sourceId: 'permitted-source', printedPage: 67 }] });
  assert.equal(result.answer, 'Grounded explanation');
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.equal(f.fetched[0].url.includes('TEST_PRIVATE_KEY'), false);
  assert.equal(f.fetched[0].options.headers['x-goog-api-key'], 'TEST_PRIVATE_KEY');
  assert.equal(f.fetched[0].options.validateHttpsCertificates, true);
  assert.equal(f.fetched[0].options.followRedirects, false);
  const body = JSON.parse(f.fetched[0].options.payload);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.systemInstruction.parts[0].text.includes('DATA, not instructions'));
  assert.equal(JSON.stringify(body).includes('TEST_PRIVATE_KEY'), false);
  assert.equal(JSON.stringify(result).includes('TEST_PRIVATE_KEY'), false);
});

test('model path injection, blocked responses and exhausted quota fail without leaking provider errors', () => {
  const f = fixture(); f.props.GEMINI_API_KEY = 'TEST_PRIVATE_KEY'; f.props.GEMINI_MODEL = '../unsafe:key';
  assert.equal(f.context.googleAI_({ kind: 'translate', text: '2 XP', language: 'th' }).unavailable, true);
  assert.equal(f.fetched.length, 0);
  delete f.props.GEMINI_MODEL; f.provider(429, null);
  const result = f.context.googleAI_({ kind: 'translate', text: '2 XP', language: 'th' });
  assert.equal(result.unavailable, true);
  assert.equal(f.fetched.length, 2);
  assert.deepEqual(f.sleeps, [250]);
  assert.equal(JSON.stringify(result).includes('SENSITIVE_TEST_PROVIDER_BODY'), false);
});

test('OCR transmits only a validated selected image and cannot accept an SVG or mismatched signature', () => {
  const f = fixture(); f.props.GEMINI_API_KEY = 'TEST_PRIVATE_KEY';
  fails(() => f.context.googleAI_({ kind: 'ocr', mimeType: 'image/svg+xml', base64: PNG.toString('base64') }), 'VALIDATION');
  assert.equal(f.fetched.length, 0);
  f.provider(200, { englishText: 'Visible source text 6+' });
  const result = f.context.googleAI_({ kind: 'ocr', mimeType: 'image/png', base64: PNG.toString('base64') });
  assert.equal(result.englishText, 'Visible source text 6+');
  const body = JSON.parse(f.fetched[0].options.payload);
  assert.equal(body.contents[0].parts[0].inlineData.data, PNG.toString('base64'));
  assert.ok(body.systemInstruction.parts[0].text.includes('unverified OCR draft'));
});

test('private-folder initialization creates an app-owned folder once and file upload records a pending marker', () => {
  const f = fixture();
  const first = f.init();
  assert.equal(first.created, true);
  assert.equal(f.init().created, false);
  const image = f.upload();
  assert.equal(f.created.length, 2);
  assert.equal(f.files.get(image.fileId).parents[0], f.props.PRIVATE_FOLDER_ID);
  assert.ok(f.props['orphan:' + image.fileId]);
  assert.equal('url' in image, false);
  f.context.googleFiles_({ action: 'commit', fileId: image.fileId });
  assert.equal(f.props['orphan:' + image.fileId], undefined);
});

test('folder sharing, inherited file sharing and cross-folder reads are rejected', () => {
  const f = fixture(); f.init();
  const folder = f.files.get(f.props.PRIVATE_FOLDER_ID);
  folder.permissions.push({ type: 'anyone', role: 'reader' });
  fails(() => f.upload(), 'FORBIDDEN');
  assert.equal(f.created.length, 1);
  folder.permissions.pop();
  const image = f.upload();
  f.files.get(image.fileId).permissions.push({ type: 'user', role: 'reader' });
  fails(() => f.context.googleFiles_({ action: 'read', fileId: image.fileId }), 'FORBIDDEN');
  f.files.get(image.fileId).permissions.pop();
  f.files.get(image.fileId).parents = ['different-private-folder'];
  fails(() => f.context.googleFiles_({ action: 'read', fileId: image.fileId }), 'FORBIDDEN');
  assert.equal(f.fetched.length, 0);
});

test('authorized file reading uses an internal owner token and returns only image bytes and safe metadata', () => {
  const f = fixture(); const image = f.upload();
  const result = f.context.googleFiles_({ action: 'read', fileId: image.fileId });
  assert.equal(result.base64, PNG.toString('base64'));
  assert.equal(result.mimeType, 'image/png');
  assert.equal(f.fetched[0].options.headers.Authorization, 'Bearer OWNER_TEST_TOKEN');
  assert.equal(f.fetched[0].options.validateHttpsCertificates, true);
  assert.equal(JSON.stringify(result).includes('OWNER_TEST_TOKEN'), false);
  assert.equal('fileId' in result, false);
});

test('recovery removes only old unreferenced private files and retains files referenced by committed rows', () => {
  const f = fixture(); const first = f.upload(); const second = f.upload();
  const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
  f.props['orphan:' + first.fileId] = JSON.stringify({ fileId: first.fileId, createdAt: old });
  f.props['orphan:' + second.fileId] = JSON.stringify({ fileId: second.fileId, createdAt: old });
  f.database({ materials: { committed: { driveFileId: first.fileId } }, books: {}, assets: {} });
  const result = f.context.cleanupOrphanFiles_();
  assert.equal(result.removed, 1);
  assert.equal(f.files.get(first.fileId).trashed, false);
  assert.equal(f.files.get(second.fileId).trashed, true);
  assert.equal(f.props['orphan:' + first.fileId], undefined);
});

test('registered books never download PDFs or expose full contents', () => {
  const f = fixture(); f.init();
  const id = 'private-pdf-id';
  f.files.set(id, { id, name: 'Private source', mimeType: 'application/pdf', size: '1000000', parents: [f.props.PRIVATE_FOLDER_ID],
    permissions: [{ type: 'user', role: 'owner' }], sha256Checksum: 'a'.repeat(64) });
  const metadata = f.context.googleFiles_({ action: 'register', fileId: id });
  assert.equal(metadata.checksum, 'a'.repeat(64));
  assert.equal(f.fetched.length, 0);
  fails(() => f.context.googleFiles_({ action: 'read', fileId: id }), 'VALIDATION');
  assert.equal(f.fetched.length, 0);
});

test('compensation and recovery remove private files once and tolerate an already trashed orphan', () => {
  const f = fixture(); const image = f.upload();
  f.context.googleFiles_({ action: 'remove', fileId: image.fileId });
  f.context.googleFiles_({ action: 'remove', fileId: image.fileId });
  assert.equal(f.updated.length, 1);
  assert.equal(f.props['orphan:' + image.fileId], undefined);
  const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
  f.props['orphan:' + image.fileId] = JSON.stringify({ fileId: image.fileId, createdAt: old });
  assert.equal(f.context.cleanupOrphanFiles_().removed, 1);
  assert.equal(f.updated.length, 1);
  assert.equal(f.props['orphan:' + image.fileId], undefined);
});

test('one unavailable orphan does not block cleanup of other old unreferenced private files', () => {
  const f = fixture(); const unavailable = f.upload(); const recoverable = f.upload();
  const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
  for (const image of [unavailable, recoverable]) f.props['orphan:' + image.fileId] = JSON.stringify({ fileId: image.fileId, createdAt: old });
  f.files.get(unavailable.fileId).parents = ['a-different-folder'];
  const result = f.context.cleanupOrphanFiles_();
  assert.equal(result.failed, 1);
  assert.equal(result.removed, 1);
  assert.equal(f.files.get(unavailable.fileId).trashed, false);
  assert.equal(f.files.get(recoverable.fileId).trashed, true);
  assert.ok(f.props['orphan:' + unavailable.fileId]);
});
