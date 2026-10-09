'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildPreview } = require('../scripts/build-preview.cjs');

test('offline export is deterministic, self-contained, marked, and valid JavaScript', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arkham-offline-test-'));
  try {
    const first = path.join(directory, 'first.html');
    const second = path.join(directory, 'second.html');
    buildPreview(first); buildPreview(second);
    const html = fs.readFileSync(first, 'utf8');
    assert.equal(html, fs.readFileSync(second, 'utf8'));
    assert.match(html, /<html lang="th" data-arkham-offline-preview="true">/);
    assert.match(html, /name="arkham-preview" content="offline-read-only"/);
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /Object\.defineProperty\(window, 'ARKHAM_OFFLINE_PREVIEW', \{ value: true/);
    assert.doesNotMatch(html, /<\?/);
    assert.doesNotMatch(html, /<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["']https?:/i);
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 3);
    scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script[1])));
    const window = {};
    vm.runInNewContext(scripts[0][1], { window });
    assert.equal(window.ARKHAM_OFFLINE_PREVIEW, true);
    assert.equal(Object.getOwnPropertyDescriptor(window, 'ARKHAM_OFFLINE_PREVIEW').writable, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('ordinary source does not activate the export marker', () => {
  const index = fs.readFileSync(path.join(__dirname, '../src/client/Index.html'), 'utf8');
  assert.doesNotMatch(index, /data-arkham-offline-preview|name="arkham-preview"|ARKHAM_OFFLINE_PREVIEW/);
});

test('storage helpers tolerate file-browser storage getters and methods being denied', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/client/Client.html'), 'utf8');
  const helpers = source.slice(source.indexOf('  function readStorage('), source.indexOf('  function t('));
  const window = {};
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage is unavailable for this file.'); } });
  window.sessionStorage = { getItem() { throw new Error('Storage denied.'); }, setItem() { throw new Error('Storage denied.'); }, removeItem() { throw new Error('Storage denied.'); } };
  const results = vm.runInNewContext(helpers + '\n[readStorage("localStorage", "key"), readStorage("sessionStorage", "key"), writeStorage("localStorage", "key", "value"), writeStorage("sessionStorage", "key", null)]', { window });
  assert.equal(results[0], null); assert.equal(results[1], null);
  assert.equal(results[2], undefined); assert.equal(results[3], undefined);
});
