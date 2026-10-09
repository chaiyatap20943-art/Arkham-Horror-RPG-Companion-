'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadModules } = require('../scripts/node-runtime.cjs');

function fixture(options = {}) {
  const A = loadModules();
  let state = options.legacy ? { users: {}, campaigns: {}, members: {}, invites: {}, mutations: {}, audit: {} } : A.emptyState();
  let sequence = 0, reads = 0, failCommit = false, afterRead = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const store = {
    read(fn) { reads++; const result = fn(copy(state)); if (afterRead) { const hook = afterRead; afterRead = null; hook(state); } return result; },
    transact(fn) { const next = copy(state), result = fn(next); if (failCommit) { failCommit = false; throw new Error('Simulated commit failure'); } state = next; return result; }
  };
  const service = A.createFullService({ store, now: () => '2026-10-07T00:00:00.000Z',
    id: () => String(++sequence), digest: text => createHash('sha256').update(text).digest('hex'),
    files: options.files, ai: options.ai, d6: () => 6 });
  const users = {};
  for (const sub of ['A', 'B', 'C', 'D']) users[sub] = service.upsertUser({ sub,
    email: `${sub.toLowerCase()}@example.com`, emailVerified: true, name: `User ${sub}` });
  function run(actor, operation, payload, expectedVersion, requestId) {
    const request = { operation, payload, requestId: requestId || `feature-${++sequence}` };
    if (expectedVersion !== undefined) request.expectedVersion = expectedVersion;
    return service.execute(users[actor].id, request);
  }
  const campaign = run('A', 'createCampaign', { name: 'Feature integration', notes: 'GM secret: cultist identity' }).campaign;
  function join(actor, role = 'PLAYER') {
    const invite = run('A', 'inviteMember', { campaignId: campaign.id, email: users[actor].email, role }).invitation;
    return run(actor, 'respondInvite', { inviteId: invite.id, decision: 'ACCEPT' }).membership;
  }
  join('B'); join('C');
  function feature(actor, operation, payload = {}, expectedVersion, requestId) {
    return run(actor, operation, { campaignId: campaign.id, ...payload }, expectedVersion, requestId);
  }
  return { A, service, users, campaign, run, feature, join, state: () => copy(state),
    seed: fn => fn(state), reads: () => reads, afterRead: fn => { afterRead = fn; },
    failCommit: () => { failCommit = true; } };
}
const code = value => error => error.code === value;
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]).toString('base64');

test('legacy foundation data gains every feature table without losing existing campaign records', () => {
  const h = fixture({ legacy: true });
  const character = h.feature('B', 'createInvestigator', { name: 'New investigator' }).character;
  const state = h.state();
  assert.deepEqual(Object.keys(state).sort(), Object.keys(h.A.tables).sort());
  assert.equal(state.characters[character.id].ownerUserId, h.users.B.id);
  assert.equal(state.campaigns[h.campaign.id].notes, 'GM secret: cultist identity');
  assert.equal(Object.keys(state.users).length, 4);
});

test('malformed feature table fails closed rather than rewriting incompatible persisted data', () => {
  const h = fixture();
  h.seed(state => { state.rolls = []; });
  const before = h.state();
  assert.throws(() => h.feature('B', 'createInvestigator', { name: 'Cannot save' }), code('CONFIGURATION'));
  assert.deepEqual(h.state(), before);
});

test('feature request allowlists reject identity, owner, stored results, and undeclared envelope fields', () => {
  const h = fixture(), before = h.state();
  for (const payload of [
    { name: 'Invalid', ownerUserId: h.users.A.id },
    { name: 'Invalid', userId: h.users.A.id },
    { name: 'Invalid', role: 'GM' },
    { name: 'Invalid', version: 99 }
  ]) assert.throws(() => h.feature('B', 'createInvestigator', payload), code('VALIDATION'));
  assert.throws(() => h.service.execute(h.users.B.id, {
    operation: 'createInvestigator', payload: { campaignId: h.campaign.id, name: 'Invalid' },
    requestId: 'bad-envelope', userId: h.users.A.id
  }), code('VALIDATION'));
  assert.throws(() => h.run('B', 'createInvestigator', { name: 'Missing campaign' }), code('VALIDATION'));
  assert.throws(() => h.feature('B', 'saveRow', { table: 'Users' }), code('VALIDATION'));
  assert.deepEqual(h.state(), before);
});

test('feature retries are canonical, scoped to actor, and commit one object plus one audit per intent', () => {
  const h = fixture(), beforeAudit = Object.keys(h.state().audit).length;
  const payload = { campaignId: h.campaign.id, name: 'One investigator' };
  const first = h.run('B', 'createInvestigator', payload, undefined, 'one-intent');
  const again = h.run('B', 'createInvestigator', { name: payload.name, campaignId: payload.campaignId }, undefined, 'one-intent');
  assert.deepEqual(again, first);
  assert.equal(Object.keys(h.state().characters).length, 1);
  assert.equal(Object.keys(h.state().audit).length, beforeAudit + 1);
  const other = h.run('C', 'createInvestigator', payload, undefined, 'one-intent');
  assert.notEqual(other.character.id, first.character.id);
  assert.throws(() => h.feature('B', 'createInvestigator', { name: 'Different' }, undefined, 'one-intent'), code('IDEMPOTENCY_CONFLICT'));
  assert.throws(() => h.feature('B', 'createSession', { name: 'Different operation' }, undefined, 'one-intent'), code('FORBIDDEN'));
  const audit = Object.values(h.state().audit).find(row => row.operation === 'createInvestigator');
  assert.equal(audit.actor, h.users.B.id);
  assert.equal(audit.campaignId, h.campaign.id);
  assert.equal(JSON.stringify(audit).includes('One investigator'), false);
});

test('feature ownership, exact versions and current campaign membership apply before replay', () => {
  const h = fixture();
  const created = h.feature('B', 'createInvestigator', { name: 'Owned draft' }).character;
  const payload = { characterId: created.id, name: 'Saved draft' };
  assert.throws(() => h.feature('C', 'saveInvestigator', payload, created.version), code('FORBIDDEN'));
  assert.throws(() => h.feature('B', 'saveInvestigator', payload), code('VALIDATION'));
  const saved = h.feature('B', 'saveInvestigator', payload, created.version, 'save-once');
  assert.equal(saved.character.version, 2);
  assert.throws(() => h.feature('B', 'saveInvestigator', { ...payload, name: 'Stale' }, created.version), code('CONFLICT'));
  assert.deepEqual(h.feature('B', 'saveInvestigator', payload, created.version, 'save-once'), saved);
  const membership = h.state().members[`${h.campaign.id}:${h.users.B.id}`];
  h.feature('A', 'removeMember', { userId: h.users.B.id }, membership.version);
  assert.throws(() => h.feature('B', 'saveInvestigator', payload, created.version, 'save-once'), code('FORBIDDEN'));
});

test('a GM role downgrade denies replay of former private story mutation results', () => {
  const h = fixture();
  let membership = h.state().members[`${h.campaign.id}:${h.users.B.id}`];
  membership = h.feature('A', 'setMemberRole', { userId: h.users.B.id, role: 'GM' }, membership.version).member;
  const payload = { kind: 'CLUE', name: 'Private clue', description: 'Hidden answer', gmNotes: 'Deep secret', visibility: 'GM_ONLY' };
  const saved = h.feature('B', 'createStoryAsset', payload, undefined, 'gm-story-intent');
  assert.equal(saved.asset.gmNotes, 'Deep secret');
  h.feature('A', 'setMemberRole', { userId: h.users.B.id, role: 'PLAYER' }, membership.version);
  assert.throws(() => h.feature('B', 'createStoryAsset', payload, undefined, 'gm-story-intent'), code('FORBIDDEN'));
  assert.equal(JSON.stringify(h.feature('B', 'bootstrap')).includes('Deep secret'), false);
});

test('bootstrap projects one consistent storage snapshot through a concurrent GM downgrade', () => {
  const h = fixture();
  const key = `${h.campaign.id}:${h.users.B.id}`;
  h.seed(state => { state.members[key].role = 'GM'; });
  const beforeReads = h.reads();
  h.afterRead(state => { state.members[key].role = 'PLAYER'; });
  const beforeDowngrade = h.feature('B', 'bootstrap');
  assert.equal(h.reads(), beforeReads + 1);
  assert.equal(beforeDowngrade.activeCampaign.role, 'GM');
  assert.equal(beforeDowngrade.campaigns[0].notes, beforeDowngrade.activeCampaign.campaign.notes);
  const afterDowngrade = h.feature('B', 'bootstrap');
  assert.equal(afterDowngrade.activeCampaign.role, 'PLAYER');
  assert.equal(afterDowngrade.campaigns[0].role, 'PLAYER');
  assert.equal(JSON.stringify(afterDowngrade).includes('cultist identity'), false);
});

test('party projections isolate private investigators, selected assets, GM notes, file IDs, and foreign campaigns', () => {
  const h = fixture();
  const investigator = h.feature('B', 'createInvestigator', { name: 'Party investigator' }).character;
  h.seed(state => { state.characters[investigator.id].build.background = 'Private background marker'; });
  h.feature('A', 'createStoryAsset', { kind: 'CLUE', name: 'Hidden clue marker', visibility: 'GM_ONLY' });
  h.feature('A', 'createStoryAsset', { kind: 'CLUE', name: 'Selected clue marker',
    visibility: 'SELECTED_PLAYERS', selectedUserIds: [h.users.B.id] });
  h.feature('A', 'createStoryAsset', { kind: 'HANDOUT', name: 'Public handout marker',
    description: 'Shared description', gmNotes: 'Private GM hint marker', visibility: 'CAMPAIGN_PLAYERS' });
  const session = h.feature('A', 'createSession', { name: 'Public session', description: 'Shared agenda' }).session;
  h.seed(state => {
    state.sessions[session.id].gmNotes = 'Private session hint marker';
    state.materials['material:public'] = { id: 'material:public', campaignId: h.campaign.id,
      visibility: 'CAMPAIGN_PLAYERS', title: 'Public image', driveFileId: 'Private Drive ID marker',
      base64: 'Private image bytes marker', version: 1 };
    state.characters['character:foreign'] = { id: 'character:foreign', campaignId: 'campaign:foreign', ownerUserId: h.users.C.id, name: 'Foreign character marker' };
  });
  const c = h.feature('C', 'bootstrap').activeCampaign;
  const text = JSON.stringify(c);
  for (const secret of ['Private background marker', 'Hidden clue marker', 'Selected clue marker',
    'Private GM hint marker', 'Private session hint marker', 'Private Drive ID marker',
    'Private image bytes marker', 'Foreign character marker']) assert.equal(text.includes(secret), false, secret);
  assert.ok(text.includes('Public handout marker'));
  assert.ok(text.includes('Shared description'));
  const b = JSON.stringify(h.feature('B', 'bootstrap').activeCampaign);
  assert.ok(b.includes('Selected clue marker'));
  assert.ok(b.includes('Private background marker'));
});

test('bootstrap filters visibility before limiting recent rolls and events to fifty', () => {
  const h = fixture();
  h.seed(state => {
    for (let i = 0; i < 70; i++) {
      const record = { id: `roll:${i}`, campaignId: h.campaign.id, visibility: 'CAMPAIGN_PLAYERS',
        createdAt: new Date(Date.UTC(2026, 9, 7, 0, 0, i)).toISOString(), version: 1 };
      state.rolls[record.id] = record;
      state.events[`event:${i}`] = { ...record, id: `event:${i}`, text: `Public event ${i}` };
    }
    state.rolls['roll:hidden'] = { id: 'roll:hidden', campaignId: h.campaign.id, visibility: 'GM_ONLY',
      createdAt: '2026-10-08T00:00:00.000Z', text: 'Hidden roll marker' };
    state.events['event:hidden'] = { ...state.rolls['roll:hidden'], id: 'event:hidden', text: 'Hidden event marker' };
  });
  const projected = h.feature('B', 'bootstrap').activeCampaign;
  assert.equal(projected.rolls.length, 50);
  assert.equal(projected.events.length, 50);
  assert.equal(projected.rolls[0].id, 'roll:69');
  assert.equal(projected.rolls.at(-1).id, 'roll:20');
  assert.equal(JSON.stringify(projected).includes('Hidden roll marker'), false);
  assert.equal(JSON.stringify(projected).includes('Hidden event marker'), false);
  assert.equal(projected.rulesVersion, projected.catalog.sourceVersion);
});

test('unconfigured AI returns cited reference fallback while missing private file storage fails safely', () => {
  const h = fixture();
  const response = h.feature('B', 'askAssistant', { question: 'horror dice', language: 'en', mode: 'RULES' });
  assert.equal(response.answer.status, 'ENGLISH_REFERENCE_FALLBACK');
  assert.ok(response.answer.citations.length);
  assert.equal(response.answer.userId, h.users.B.id);
  const before = h.state();
  assert.throws(() => h.feature('B', 'uploadMaterial', { title: 'No storage', type: 'BOOK_PAGE',
    mimeType: 'image/png', base64: image }), code('CONFIGURATION'));
  assert.deepEqual(h.state(), before);
  assert.throws(() => h.feature('D', 'searchRules', { query: 'horror' }), code('FORBIDDEN'));
});

test('private upload compensates failed storage commits and retries never create a second committed file', () => {
  const calls = [], h = fixture({ files(request) {
    calls.push(request.action);
    return request.action === 'save' ? { fileId: `private-file-${calls.length}` } : { ok: true };
  } });
  const payload = { title: 'Private handout', type: 'HANDOUT', mimeType: 'image/png', base64: image };
  const before = h.state(); h.failCommit();
  assert.throws(() => h.feature('B', 'uploadMaterial', payload, undefined, 'upload-once'), /commit failure/);
  assert.deepEqual(h.state(), before);
  assert.deepEqual(calls, ['save', 'remove']);
  const saved = h.feature('B', 'uploadMaterial', payload, undefined, 'upload-once');
  assert.deepEqual(calls, ['save', 'remove', 'save', 'commit']);
  assert.equal(saved.material.visibility, 'OWNER_ONLY');
  assert.equal(Object.hasOwn(saved.material, 'driveFileId'), false);
  assert.equal(saved.material.hasFile, true);
  assert.deepEqual(h.feature('B', 'uploadMaterial', payload, undefined, 'upload-once'), saved);
  assert.deepEqual(calls, ['save', 'remove', 'save', 'commit']);
  assert.equal(Object.keys(h.state().materials).length, 1);
  assert.equal(h.feature('C', 'bootstrap').activeCampaign.materials.length, 0);
});
