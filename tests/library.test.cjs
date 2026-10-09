'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,0]).toString('base64');
function fixture() {
  const sandbox = vm.createContext({ Date, JSON, Object, Array, String, Number, Math, RegExp, Error, isFinite });
  for (const name of ['store', 'domain', 'catalog', 'library', 'features']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', name + '.js'), 'utf8'), sandbox);
  const A = sandbox.Arkham;
  let state = A.emptyState();
  let serial = 0;
  let aiResponse = { configured: false };
  const aiCalls = [], fileCalls = [];
  const files = new Map();
  const dependencies = {
    now: () => '2026-10-07T12:00:00.000Z',
    id: () => (++serial).toString(16).padStart(32, '0'),
    digest: value => crypto.createHash('sha256').update(value).digest('hex'),
    store: { read: fn => fn(state), transact: fn => { const draft = structuredClone(state); const result = fn(draft); state = draft; return result; } },
    ai: request => { aiCalls.push(structuredClone(request)); return typeof aiResponse === 'function' ? aiResponse(request) : structuredClone(aiResponse); },
    files: request => {
      fileCalls.push(structuredClone(request));
      if (request.action === 'save') { const fileId = 'private-file-' + (++serial); files.set(fileId, { mimeType: request.mimeType, base64: request.base64 }); return { fileId }; }
      if (request.action === 'read') return structuredClone(files.get(request.fileId));
      if (request.action === 'remove') { files.delete(request.fileId); return { removed: true }; }
      return { committed: true };
    }
  };
  const service = A.createFullService(dependencies);
  const gm = service.upsertUser({ sub: 'gm', email: 'gm@example.com', emailVerified: true, name: 'GM' });
  const player = service.upsertUser({ sub: 'player', email: 'player@example.com', emailVerified: true, name: 'Player' });
  const stranger = service.upsertUser({ sub: 'stranger', email: 'stranger@example.com', emailVerified: true, name: 'Stranger' });
  const campaign = service.execute(gm.id, { operation: 'createCampaign', payload: { name: 'Library campaign' }, requestId: 'create-library' }).campaign;
  state.members[campaign.id + ':' + player.id] = { id: campaign.id + ':' + player.id, campaignId: campaign.id, userId: player.id, role: 'PLAYER', status: 'ACTIVE' };
  function call(actor, operation, payload = {}, expectedVersion, requestId) {
    return service.execute(actor.id, { operation, payload: { campaignId: campaign.id, ...payload },
      ...(expectedVersion === undefined ? {} : { expectedVersion }), requestId: requestId || 'request-' + (++serial) });
  }
  function entity(id, visibility, englishText = 'A hidden clue about thresholds.', owner = gm.id) {
    state.entities[id] = { id, campaignId: campaign.id, type: 'RULE', name: id, englishText, visibility,
      ownerUserId: owner, verificationStatus: 'NEEDS_REVIEW', sourceVersion: 'source-v1', createdAt: dependencies.now(), updatedAt: dependencies.now(), version: 1 };
    return state.entities[id];
  }
  function upload(actor = gm) {
    return call(actor, 'uploadMaterial', { title: 'Source page', type: 'BOOK_PAGE', mimeType: 'image/png', base64: PNG, source: 'Private source', printedPage: 7 }).material;
  }
  return { A, service, dependencies, gm, player, stranger, campaign, call, entity, upload, aiCalls, fileCalls,
    state: () => state, setAI: response => { aiResponse = response; } };
}
function fails(fn, code) { assert.throws(fn, error => error.code === code); }

test('Thai search uses glossary, verified catalog citations and pagination without changing state', () => {
  const f = fixture();
  const before = JSON.stringify(f.state());
  const result = f.call(f.player, 'searchRules', { query: 'บาดเจ็บ', language: 'th', limit: 2, offset: 0 });
  assert.equal(result.results.length, 2);
  assert.ok(result.total > 2);
  assert.ok(result.results.every(source => source.citation.pdfPage === source.citation.pdfPageIndex + 1));
  assert.equal(result.results[0].verificationStatus, 'VERIFIED');
  assert.equal(JSON.stringify(f.state()), before);
  fails(() => f.call(f.stranger, 'searchRules', { query: 'injury' }), 'FORBIDDEN');
});

test('search does not expose GM-only, private or other campaign source records', () => {
  const f = fixture();
  f.entity('restricted-mystery', 'GM_ONLY', 'uniqueneedle forbidden text');
  f.entity('uploader-private', 'OWNER_ONLY', 'uniqueneedle personal text');
  f.entity('allowed-public', 'CAMPAIGN_PLAYERS', 'uniqueneedle public text');
  f.entity('other-campaign', 'CAMPAIGN_PLAYERS', 'uniqueneedle cross campaign').campaignId = 'different-campaign';
  const result = f.call(f.player, 'searchRules', { query: 'uniqueneedle' });
  assert.deepEqual(Array.from(result.results, row => row.id), ['allowed-public']);
  assert.equal(JSON.stringify(result).includes('forbidden text'), false);
  assert.equal(JSON.stringify(result).includes('personal text'), false);
});

test('assistant fallback is grounded and core game operations do not need a configured model', () => {
  const f = fixture();
  const result = f.call(f.player, 'askAssistant', { question: 'dice pool refill', language: 'th', mode: 'RULES' }).answer;
  assert.equal(result.status, 'ENGLISH_REFERENCE_FALLBACK');
  assert.ok(result.citations.length);
  assert.ok(result.text.includes('AI ไม่พร้อมใช้งาน'));
  const noSource = f.call(f.player, 'askAssistant', { question: 'zzunfindablezz', language: 'en' }).answer;
  assert.equal(noSource.answerType, 'SOURCE_UNAVAILABLE');
  assert.equal(f.aiCalls.length, 1);
  fails(() => f.call(f.player, 'askAssistant', { question: 'prep', mode: 'PREPARE' }), 'FORBIDDEN');
});

test('provider cannot fabricate citations, page numbers, official rule status or game state changes', () => {
  const f = fixture();
  f.setAI({ answer: 'Gain 1000 XP immediately.', citations: [{ sourceId: 'fabricated-rule', printedPage: 900 }], changes: { xp: 1000 } });
  const rejected = f.call(f.player, 'askAssistant', { question: 'injury', mode: 'RULES' }).answer;
  assert.equal(rejected.status, 'REJECTED_CITATIONS');
  assert.equal(rejected.text.includes('1000 XP'), false);
  f.setAI(request => ({ answer: 'A supported explanation.', citations: [{ sourceId: request.context[0].sourceId }], answerType: 'OFFICIAL_RULE', changes: { xp: 1000 } }));
  const accepted = f.call(f.player, 'askAssistant', { question: 'injury', mode: 'RULES' }).answer;
  assert.equal(accepted.answerType, 'EXPLANATION');
  assert.equal(f.state().characters && Object.keys(f.state().characters).length, 0);
  f.setAI(request => ({ answer: 'Incorrect page.', citations: [{ sourceId: request.context[0].sourceId, printedPage: 99999 }] }));
  assert.equal(f.call(f.player, 'askAssistant', { question: 'injury' }).answer.status, 'REJECTED_CITATIONS');
});

test('player retrieval filters data before transport and replay rechecks every submitted source after demotion', () => {
  const f = fixture();
  f.entity('public-source', 'CAMPAIGN_PLAYERS', 'uniqueneedle public source');
  f.entity('gm-source', 'GM_ONLY', 'uniqueneedle VERY_SECRET_VALUE');
  f.setAI(request => ({ answer: 'Supported explanation.', citations: [{ sourceId: 'public-source' }] }));
  f.call(f.player, 'askAssistant', { question: 'uniqueneedle' });
  assert.equal(JSON.stringify(f.aiCalls[0]).includes('VERY_SECRET_VALUE'), false);
  const payload = { question: 'uniqueneedle' };
  f.call(f.gm, 'askAssistant', payload, undefined, 'demotion-replay');
  assert.equal(JSON.stringify(f.aiCalls[1]).includes('VERY_SECRET_VALUE'), true);
  f.state().members[f.campaign.id + ':' + f.gm.id].role = 'PLAYER';
  fails(() => f.call(f.gm, 'askAssistant', payload, undefined, 'demotion-replay'), 'FORBIDDEN');
  assert.equal(f.call(f.gm, 'getAIHistory').history.length, 0);
});

test('structured imports require GM and book version, preserve checkpoints, and remain unverified', () => {
  const f = fixture();
  const book = f.call(f.gm, 'registerBook', { title: 'Private Book', edition: '2024', checksum: 'a'.repeat(64) }).book;
  const payload = { book: book.id, checkpoint: 'page-17', entities: [{ id: 'custom-rule', type: 'RULE', name: 'Custom', englishText: 'A source excerpt.', printedPage: 17, pdfPageIndex: 19, keywords: ['custom'] }] };
  fails(() => f.call(f.player, 'importEntities', payload, book.version), 'FORBIDDEN');
  fails(() => f.call(f.gm, 'importEntities', payload), 'VALIDATION');
  const result = f.call(f.gm, 'importEntities', payload, book.version, 'import-one');
  assert.equal(result.book.importStatus, 'PARTIAL');
  const entity = f.state().entities[result.imported[0]];
  assert.equal(entity.verificationStatus, 'NEEDS_REVIEW');
  assert.equal(entity.visibility, 'CO_GM');
  assert.equal(f.call(f.player, 'searchRules', { query: 'custom' }).results.some(row => row.id === entity.id), false);
  const reference = f.call(f.gm, 'searchRules', { query: 'Custom' }).results.find(row => row.id === entity.id);
  assert.equal(reference.version, entity.version);
  assert.equal(reference.sourceType, 'entity');
  assert.equal(reference.canonicalCatalogId, null);
  const repeated = f.call(f.gm, 'importEntities', payload, book.version, 'import-one');
  assert.equal(repeated.importId, result.importId);
  assert.equal(Object.keys(f.state().imports).length, 1);
  f.call(f.gm, 'reviewSource', { sourceType: 'entity', sourceId: entity.id, decision: 'VERIFIED', notes: 'Compared with private original.' }, entity.version);
  assert.equal(f.state().entities[entity.id].verificationStatus, 'VERIFIED');
  assert.equal(f.A.catalog.sourceVersion.includes('7901c7'), true);
});

test('source translations preserve numbers, use versioned metadata and fall back safely', () => {
  const f = fixture();
  const entity = f.entity('numerical-rule', 'CAMPAIGN_PLAYERS', 'Spend 2 XP to gain 1 die.');
  f.setAI({ text: 'ใช้ 3 XP เพื่อเพิ่ม 1 ลูก', model: 'test-model' });
  const rejected = f.call(f.player, 'translateContent', { sourceType: 'entity', sourceId: entity.id, language: 'th' }).translation;
  assert.equal(rejected.status, 'ENGLISH_FALLBACK');
  assert.equal(rejected.text, entity.englishText);
  f.state().entities[entity.id].sourceVersion = 'source-v2';
  f.setAI({ text: 'ใช้ 2 XP เพื่อเพิ่ม 1 ลูก', model: 'test-model' });
  const translated = f.call(f.player, 'translateContent', { sourceType: 'entity', sourceId: entity.id, language: 'th' }).translation;
  assert.equal(translated.status, 'NEEDS_REVIEW');
  assert.equal(translated.sourceVersion, 'source-v2');
  assert.equal(translated.promptVersion, 'arkham-grounding-1');
  assert.equal(Object.keys(f.state().translations).length, 2);
  assert.equal(Object.keys(f.state().characters).length, 0);
});

test('GM player narration requires explicitly revealed sources and cannot send GM secrets', () => {
  const f = fixture();
  const secret = f.entity('secret', 'GM_ONLY', 'GMONLYSECRETVALUE');
  fails(() => f.call(f.gm, 'translateContent', { sourceType: 'entity', sourceId: secret.id, language: 'th', mode: 'NARRATE' }), 'FORBIDDEN');
  assert.equal(f.aiCalls.length, 0);
  f.state().assets['revealed-handout'] = { id: 'revealed-handout', campaignId: f.campaign.id, name: 'Handout', description: 'Public clue text', gmNotes: 'Do not reveal murderer', visibility: 'CAMPAIGN_PLAYERS', version: 1 };
  f.setAI({ text: 'Public clue narrative' });
  f.call(f.gm, 'translateContent', { sourceType: 'asset', sourceId: 'revealed-handout', language: 'en', mode: 'NARRATE' });
  assert.equal(f.aiCalls[0].text, 'Public clue text');
  assert.equal(JSON.stringify(f.aiCalls[0]).includes('murderer'), false);
});

test('uploads reject forged MIME, SVG, malformed base64 and oversized content before Drive is called', () => {
  const f = fixture();
  const payload = { title: 'Invalid file', type: 'OTHER_IMAGE', mimeType: 'image/png', base64: PNG };
  for (const change of [
    { mimeType: 'image/svg+xml' }, { mimeType: 'image/jpeg' }, { base64: '!not-base64' },
    { base64: Buffer.alloc(750 * 1024 + 1).toString('base64') }
  ]) fails(() => f.call(f.player, 'uploadMaterial', { ...payload, ...change }), 'VALIDATION');
  assert.equal(f.fileCalls.length, 0);
});

test('scanner stores private original, separate OCR draft and corrected text, with an explicit review gate', () => {
  const f = fixture();
  const uploaded = f.upload(f.player);
  assert.equal(uploaded.visibility, 'OWNER_ONLY');
  assert.equal(uploaded.hasFile, true);
  assert.equal('driveFileId' in uploaded, false);
  assert.equal(f.fileCalls[1].action, 'commit');
  fails(() => f.call(f.gm, 'getMaterialFile', { materialId: uploaded.id }), 'FORBIDDEN');
  f.setAI({ englishText: 'OCR draft with 2 XP.', model: 'test-model' });
  const draft = f.call(f.player, 'analyzeMaterial', { materialId: uploaded.id }, uploaded.version).material;
  assert.equal(draft.extractedText, 'OCR draft with 2 XP.');
  assert.equal(draft.englishText, '');
  assert.equal(draft.verificationStatus, 'NEEDS_REVIEW');
  const corrected = f.call(f.player, 'saveMaterial', { materialId: draft.id, englishText: 'Corrected 2 XP.', visibility: 'CAMPAIGN_PLAYERS' }, draft.version).material;
  assert.equal(corrected.extractedText, draft.extractedText);
  assert.equal(corrected.sourceVersion, '2');
  assert.equal(corrected.verificationStatus, 'NEEDS_REVIEW');
  const result = f.call(f.gm, 'getMaterialFile', { materialId: corrected.id });
  assert.equal(result.file.base64, PNG);
  assert.equal('fileId' in result.file, false);
  const search = f.call(f.gm, 'searchRules', { query: 'Corrected' });
  assert.equal(search.results[0].citation.printedPage, 7);
  assert.equal(search.results[0].citation.pdfPageIndex, null); // Unknown scan mapping is not fabricated.
});

test('removal or narrowing visibility blocks material and translation replay with prior request IDs', () => {
  const f = fixture();
  const entity = f.entity('shared-rule', 'CAMPAIGN_PLAYERS', 'Two successes are needed.');
  const payload = { sourceType: 'entity', sourceId: entity.id, language: 'en' };
  f.call(f.player, 'translateContent', payload, undefined, 'translation-replay');
  f.state().entities[entity.id].visibility = 'GM_ONLY';
  fails(() => f.call(f.player, 'translateContent', payload, undefined, 'translation-replay'), 'FORBIDDEN');
  f.state().members[f.campaign.id + ':' + f.player.id].status = 'REMOVED';
  fails(() => f.call(f.player, 'getAIHistory'), 'FORBIDDEN');
});

test('AI rate limit and optional provider failures leave unrelated campaign state usable', () => {
  const f = fixture();
  f.setAI(() => { throw new Error('secret provider payload'); });
  for (let i = 0; i < 10; i++) assert.equal(f.call(f.player, 'askAssistant', { question: 'injury' }).answer.status, 'ENGLISH_REFERENCE_FALLBACK');
  fails(() => f.call(f.player, 'askAssistant', { question: 'injury' }), 'RATE_LIMITED');
  assert.equal(f.call(f.player, 'searchRules', { query: 'injury' }).results.length > 0, true);
  assert.equal(JSON.stringify(f.state().aiHistory).includes('secret provider payload'), false);
});

test('external AI work runs before the storage transaction and a source change rejects its stale answer', () => {
  const f = fixture();
  const source = f.entity('mutable-source', 'CAMPAIGN_PLAYERS', 'racecontext original source');
  let locked = false;
  const transact = f.dependencies.store.transact;
  f.dependencies.store.transact = fn => { locked = true; try { return transact(fn); } finally { locked = false; } };
  f.setAI(request => {
    assert.equal(locked, false);
    source.englishText = 'racecontext updated source'; source.sourceVersion = 'source-v2'; source.version += 1;
    return { answer: 'A stale answer.', citations: [{ sourceId: source.id }] };
  });
  const beforeAudits = Object.keys(f.state().audit).length;
  fails(() => f.call(f.player, 'askAssistant', { question: 'racecontext' }, undefined, 'stale-assistant'), 'CONFLICT');
  assert.equal(Object.keys(f.state().aiHistory).length, 0);
  assert.equal(Object.keys(f.state().audit).length, beforeAudits);
  assert.equal(f.state().mutations[f.player.id + ':stale-assistant'], undefined);
});

test('translation rechecks source metadata and upload compensates a membership loss before commit', () => {
  const f = fixture();
  const source = f.entity('metadata-source', 'CAMPAIGN_PLAYERS', 'Translate source 2.');
  f.setAI(() => {
    source.visibility = 'SELECTED_PLAYERS'; source.selectedUserIds = [f.player.id];
    return { text: 'แปลข้อความ 2.' };
  });
  fails(() => f.call(f.player, 'translateContent', { sourceType: 'entity', sourceId: source.id, language: 'th' }), 'CONFLICT');
  assert.equal(Object.keys(f.state().translations).length, 0);
  const files = f.dependencies.files;
  f.dependencies.files = request => {
    const result = files(request);
    if (request.action === 'save') f.state().members[f.campaign.id + ':' + f.player.id].status = 'REMOVED';
    return result;
  };
  fails(() => f.upload(f.player), 'FORBIDDEN');
  assert.equal(Object.keys(f.state().materials).length, 0);
  assert.deepEqual(f.fileCalls.map(call => call.action), ['save', 'remove']);
});

test('successful AI and OCR receipts replay without repeating provider calls and missing history fails closed', () => {
  const f = fixture();
  f.entity('retry-source', 'CAMPAIGN_PLAYERS', 'retrycontext 2 XP.');
  f.setAI(request => request.kind === 'assistant' ? { answer: 'An explanation.', citations: [{ sourceId: 'retry-source' }] } :
    request.kind === 'ocr' ? { englishText: 'Correct this OCR draft.' } : { text: 'แหล่งอ้างอิง 2 XP.' });
  const answerPayload = { question: 'retrycontext' };
  const answer = f.call(f.player, 'askAssistant', answerPayload, undefined, 'one-provider-answer');
  assert.deepEqual(f.call(f.player, 'askAssistant', answerPayload, undefined, 'one-provider-answer'), answer);
  const translatePayload = { sourceType: 'entity', sourceId: 'retry-source', language: 'th' };
  const translation = f.call(f.player, 'translateContent', translatePayload, undefined, 'one-provider-translation');
  assert.deepEqual(f.call(f.player, 'translateContent', translatePayload, undefined, 'one-provider-translation'), translation);
  const material = f.upload(f.player);
  const analyzed = f.call(f.player, 'analyzeMaterial', { materialId: material.id }, material.version, 'one-provider-ocr');
  assert.deepEqual(f.call(f.player, 'analyzeMaterial', { materialId: material.id }, material.version, 'one-provider-ocr'), analyzed);
  assert.equal(f.aiCalls.length, 3);
  assert.equal(f.fileCalls.filter(call => call.action === 'read').length, 1);
  delete f.state().aiHistory[answer.answer.id];
  fails(() => f.call(f.player, 'askAssistant', answerPayload, undefined, 'one-provider-answer'), 'FORBIDDEN');
  assert.equal(f.aiCalls.length, 3);
});

test('imported claims cannot promote verification and persisted catalog rows cannot forge reference facts', () => {
  const f = fixture();
  const book = f.call(f.gm, 'registerBook', { title: 'Custom book', checksum: 'b'.repeat(64) }).book;
  const entity = { id: 'forged-rule', type: 'RULE', name: 'Forged', englishText: 'Grant arbitrary XP.', printedPage: 1, pdfPageIndex: 1, verificationStatus: 'VERIFIED' };
  fails(() => f.call(f.gm, 'importEntities', { book: book.id, entities: [entity] }, book.version), 'VALIDATION');
  const canonical = Object.values(f.state().entities).find(record => record.canonicalCatalogId === 'pool-refilling');
  canonical.englishDescription = 'forgedcanonical gain 999 XP'; canonical.canonicalProperties = { xp: 999 }; canonical.verificationStatus = 'NEEDS_REVIEW';
  assert.equal(f.call(f.player, 'searchRules', { query: 'forgedcanonical' }).results.length, 0);
  const result = f.call(f.player, 'searchRules', { query: 'Pool Refilling' }).results.find(record => record.id === canonical.id);
  assert.equal(result.verificationStatus, 'VERIFIED');
  assert.equal(result.englishText.includes('999'), false);
  fails(() => f.call(f.gm, 'reviewSource', { sourceType: 'entity', sourceId: canonical.id, decision: 'VERIFIED' }, canonical.version), 'FORBIDDEN');
});

test('analytical Insight retrieval supplies verified cost, timing, horror face and penalty rather than only a summary', () => {
  const f = fixture();
  f.setAI(request => {
    const analytical = request.context.find(source => source.name === 'Analytical');
    assert.ok(analytical);
    assert.match(analytical.text, /spend 1 Insight/);
    assert.match(analytical.text, /before trauma resolution/);
    assert.match(analytical.text, /horror die showing 1/);
    assert.match(analytical.text, /"insightCost":1/);
    assert.match(analytical.text, /"timing":"BEFORE_TRAUMA"/);
    return { answer: 'A supported explanation.', citations: [{ sourceId: analytical.sourceId }] };
  });
  assert.equal(f.call(f.player, 'askAssistant', { question: 'Analytical Insight' }).answer.status, 'MODEL_GENERATED');
  f.setAI({ configured: false });
  const fallback = f.call(f.player, 'askAssistant', { question: 'Analytical' }).answer;
  assert.match(fallback.text, /spend 1 Insight/);
  assert.match(fallback.text, /before trauma resolution/);
});

test('GM catalog fallback and persisted GM canonical rows enforce permission before search, translation and AI', () => {
  const f = fixture();
  const entry = { id: 'hidden-threat', name: 'Hidden Threat', summary: 'gmreferenceunique original monster profile.',
    statFacts: { vitality: 4 }, sourceVersion: 'gm-source-v1', printedPage: 140, pdfPageIndex: 140,
    verificationStatus: 'VERIFIED', statusSource: 'VERIFIED', visibility: 'CAMPAIGN_PLAYERS' };
  f.A.gmCatalog = { sourceVersion: 'gm-source-v1', source: { title: 'Corebook', sha256: 'c'.repeat(64) }, npcs: [entry] };
  assert.equal(f.call(f.player, 'searchRules', { query: 'gmreferenceunique' }).results.length, 0);
  const fallback = f.call(f.gm, 'searchRules', { query: 'gmreferenceunique' }).results;
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, 'catalog:gm:hidden-threat');
  fails(() => f.call(f.player, 'translateContent', { sourceType: 'entity', sourceId: 'gm:hidden-threat' }), 'FORBIDDEN');
  const row = f.entity('campaign-gm-reference', 'CAMPAIGN_PLAYERS', 'gmreferenceunique forged public monster profile.');
  row.canonicalCatalogId = 'gm:hidden-threat'; row.canonicalProperties = { vitality: 9000 };
  const sources = f.call(f.gm, 'searchRules', { query: 'gmreferenceunique' }).results;
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, row.id);
  assert.equal(sources[0].englishText.includes('9000'), false);
  assert.equal(f.call(f.player, 'searchRules', { query: 'gmreferenceunique' }).results.length, 0);
  fails(() => f.call(f.player, 'translateContent', { sourceType: 'entity', sourceId: row.id }), 'FORBIDDEN');
  assert.equal(f.call(f.player, 'askAssistant', { question: 'gmreferenceunique' }).answer.status, 'SOURCE_UNAVAILABLE');
  assert.equal(f.aiCalls.length, 0);
  f.call(f.gm, 'askAssistant', { question: 'gmreferenceunique' });
  assert.equal(f.aiCalls[0].context.length, 1);
  assert.equal(f.aiCalls[0].context[0].text.includes('"vitality":4'), true);
  assert.equal(f.aiCalls[0].context[0].text.includes('9000'), false);
});

test('material upload receipts recheck a later visibility restriction before returning stored results', () => {
  const f = fixture();
  const payload = { title: 'Private original', type: 'BOOK_PAGE', mimeType: 'image/png', base64: PNG };
  const uploaded = f.call(f.player, 'uploadMaterial', payload, undefined, 'narrow-upload').material;
  f.state().materials[uploaded.id].visibility = 'GM_ONLY';
  fails(() => f.call(f.player, 'uploadMaterial', payload, undefined, 'narrow-upload'), 'FORBIDDEN');
  assert.equal(f.fileCalls.filter(call => call.action === 'save').length, 1);
});

test('a new translation request can recover from unavailable AI without editing the source or repeating its retry receipt', () => {
  const f = fixture();
  const source = f.entity('recovering-translation', 'CAMPAIGN_PLAYERS', 'retrytranslation 2 XP.');
  const payload = { sourceType: 'entity', sourceId: source.id, language: 'th' };
  const fallback = f.call(f.player, 'translateContent', payload, undefined, 'unavailable-translation');
  assert.equal(fallback.translation.status, 'ENGLISH_FALLBACK');
  f.setAI({ text: 'retrytranslation ใช้ 2 XP.', model: 'configured-model' });
  assert.deepEqual(f.call(f.player, 'translateContent', payload, undefined, 'unavailable-translation'), fallback);
  assert.equal(f.aiCalls.length, 1);
  const recovered = f.call(f.player, 'translateContent', payload, undefined, 'recovered-translation');
  assert.equal(recovered.translation.status, 'NEEDS_REVIEW');
  assert.equal(recovered.translation.sourceVersion, source.sourceVersion);
  assert.equal(f.aiCalls.length, 2);
  const result = f.call(f.player, 'searchRules', { query: 'retrytranslation', language: 'th' });
  assert.equal(result.results[0].translation, recovered.translation.text);
  assert.deepEqual(f.call(f.player, 'translateContent', payload, undefined, 'recovered-translation'), recovered);
  assert.equal(f.aiCalls.length, 2);
});
