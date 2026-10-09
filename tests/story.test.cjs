'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function checksum(backup) { const copied = structuredClone(backup); delete copied.checksum; backup.checksum = digest(canonical(copied)); return backup; }

function fixture() {
  const sandbox = vm.createContext({ Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, isFinite });
  for (const name of ['store', 'domain', 'features', 'story']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', name + '.js'), 'utf8'), sandbox);
  }
  const A = sandbox.Arkham;
  let state = A.emptyState();
  let clock = '2026-10-07T12:00:00.000Z';
  let sequence = 0;
  let failCommit = false;
  const store = {
    read(fn) { return fn(structuredClone(state)); },
    transact(fn) {
      const next = structuredClone(state); const result = fn(next);
      Object.values(next).forEach(records => A.packRows(records));
      if (failCommit) { failCommit = false; throw new Error('Simulated atomic commit failure'); }
      state = next; return result;
    }
  };
  const service = A.createFullService({ store, now: () => clock, id: () => String(++sequence), digest, d6: () => 3 });
  const accounts = {};
  for (const sub of ['A', 'B', 'C']) accounts[sub] = service.upsertUser({ sub, email: sub.toLowerCase() + '@example.com', emailVerified: true, name: sub });
  const run = (account, operation, payload, expectedVersion, requestId) => {
    const request = { operation, payload, requestId: requestId || 'review-' + (++sequence) };
    if (expectedVersion !== undefined) request.expectedVersion = expectedVersion;
    return service.execute(accounts[account].id, request);
  };
  const campaign = run('A', 'createCampaign', { name: 'Campaign X', notes: 'Secret campaign note' }).campaign;
  const unrelated = run('C', 'createCampaign', { name: 'Campaign Y', notes: 'Unrelated secret' }).campaign;
  const invitation = run('A', 'inviteMember', { campaignId: campaign.id, email: accounts.B.email }).invitation;
  run('B', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' });
  function character(owner = 'B', suffix = String(++sequence)) {
    const record = { id: 'character:' + suffix, campaignId: campaign.id, ownerUserId: accounts[owner].id, name: 'Investigator ' + owner,
      status: 'APPROVED', build: { background: 'Private character background', personalityId: 'brave' },
      normalDice: 2, horrorDice: 0, horrorLimit: 1, poolLimit: 5, poolMaximum: 6, insightCurrent: 0, insightLimit: 2,
      xpEarned: 5, xpSpent: 0, money: 10, injuries: [{ id: 'injury-1' }], traumas: [], effects: [],
      createdAt: clock, updatedAt: clock, version: 1 };
    state.characters[record.id] = record; return structuredClone(record);
  }
  function session() { return run('A', 'createSession', { campaignId: campaign.id, name: 'Session 1', date: '2026-10-07' }).session; }
  function attendance(sessionId, record) { return run('A', 'setAttendance', { campaignId: campaign.id, sessionId, userId: record.ownerUserId, characterId: record.id, attendance: 'PRESENT' }).attendance; }
  function action(record, kind, extra = {}, requestId) { return run('A', 'sessionAction', { campaignId: campaign.id, sessionId: record.id, action: kind, ...extra }, record.version, requestId); }
  return { A, run, campaign, unrelated, accounts, character, session, attendance, action,
    state: () => structuredClone(state), edit: fn => fn(state), fail: () => { failCommit = true; },
    seedCatalog: () => {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server/catalog.js'), 'utf8'), sandbox);
      A.seedCatalogForCampaign(state, state.campaigns[campaign.id], clock);
    },
    at: value => { clock = value; }, read: (account, campaignId = campaign.id) => run(account, 'bootstrap', { campaignId }) };
}
const code = expected => error => error.code === expected;

test('scene planning cannot refill investigators before their session starts', () => {
  const f = fixture(); const character = f.character(); const session = f.session(); f.attendance(session.id, character);
  const scene = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Future scene', sceneType: 'NARRATIVE' }).asset;
  const before = f.state();
  assert.throws(() => f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: scene.id, status: 'ACTIVE' }, session.version), code('VALIDATION'));
  assert.deepEqual(f.state(), before);
});

test('sessions persist investigators, reset Insight only on START, and prevent competing live sessions', () => {
  const f = fixture(); const investigator = f.character(); const first = f.session(); f.attendance(first.id, investigator);
  const started = f.action(first, 'START').session;
  const live = f.state().characters[investigator.id];
  assert.equal(live.insightCurrent, 2); assert.equal(live.normalDice, 2); assert.equal(live.poolLimit, 5); assert.equal(live.injuries.length, 1);
  const another = f.session(); assert.throws(() => f.action(another, 'START'), code('CONFLICT'));
  const paused = f.action(started, 'PAUSE').session; assert.equal(paused.status, 'PAUSED');
  const resumed = f.action(paused, 'RESUME').session; assert.equal(resumed.startedAt, started.startedAt);
  assert.throws(() => f.run('B', 'sessionAction', { campaignId: f.campaign.id, sessionId: first.id, action: 'END' }, resumed.version), code('FORBIDDEN'));
  assert.throws(() => f.run('A', 'updateSession', { campaignId: f.unrelated.id, sessionId: first.id, name: 'Hijack' }, resumed.version), code('FORBIDDEN'));
  assert.throws(() => f.run('A', 'updateSession', { campaignId: f.campaign.id, sessionId: first.id, name: 'Stale' }, first.version), code('CONFLICT'));
});

test('attendance checks owner, membership, approved status and existing-row versions', () => {
  const f = fixture(); const investigator = f.character(); const session = f.session();
  assert.throws(() => f.run('B', 'setAttendance', { campaignId: f.campaign.id, sessionId: session.id, userId: f.accounts.A.id, characterId: investigator.id, attendance: 'PRESENT' }), code('FORBIDDEN'));
  assert.throws(() => f.run('A', 'setAttendance', { campaignId: f.campaign.id, sessionId: session.id, userId: f.accounts.A.id, characterId: investigator.id, attendance: 'PRESENT' }), code('VALIDATION'));
  const first = f.attendance(session.id, investigator);
  assert.throws(() => f.run('B', 'setAttendance', { campaignId: f.campaign.id, sessionId: session.id, userId: f.accounts.B.id, characterId: investigator.id, attendance: 'LEFT' }), code('VALIDATION'));
  const left = f.run('B', 'setAttendance', { campaignId: f.campaign.id, sessionId: session.id, userId: f.accounts.B.id, characterId: investigator.id, attendance: 'LEFT' }, first.version).attendance;
  assert.equal(left.attendance, 'LEFT'); assert.equal(Object.keys(f.state().members).length, 3);
  assert.throws(() => f.run('B', 'setAttendance', { campaignId: f.campaign.id, sessionId: session.id, userId: f.accounts.B.id, characterId: investigator.id, attendance: 'PRESENT' }, first.version), code('CONFLICT'));
});

test('end-session is atomic, retry-safe, immutable, and projects GM notes and character backgrounds', () => {
  const f = fixture(); const b = f.character('B'); const a = f.character('A'); const first = f.session();
  f.attendance(first.id, b); f.attendance(first.id, a); const started = f.action(first, 'START').session;
  const before = f.state(); f.fail();
  const extras = { summary: 'A clue was found.', gmNotes: 'Secret ending', xpAwards: [{ characterId: b.id, amount: 3 }] };
  assert.throws(() => f.action(started, 'END', extras, 'end-once'), /atomic commit/);
  assert.deepEqual(f.state(), before);
  const ended = f.action(started, 'END', extras, 'end-once'); assert.equal(ended.session.status, 'COMPLETED');
  const after = f.state(); assert.equal(after.characters[b.id].xpEarned, 8); assert.equal(Object.keys(after.xpLedger).length, 1);
  assert.deepEqual(f.action(started, 'END', extras, 'end-once'), ended);
  assert.throws(() => f.action(ended.session, 'END', extras, 'new-end-request'), code('CONFLICT'));
  assert.throws(() => f.run('A', 'updateSession', { campaignId: f.campaign.id, sessionId: first.id, name: 'Alter history' }, ended.session.version), code('CONFLICT'));
  f.edit(state => { state.characters[b.id].xpEarned = 99; state.characters[b.id].injuries = []; });
  const player = f.run('B', 'getHistory', { campaignId: f.campaign.id });
  const snap = player.snapshots[0]; assert.equal(snap.characters.find(row => row.id === b.id).xpEarned, 8);
  assert.equal(snap.characters.find(row => row.id === b.id).injuries.length, 1);
  assert.equal(snap.characters.find(row => row.id === a.id).build, undefined); assert.equal(snap.gmNotes, undefined);
  assert.equal(JSON.stringify(player).includes('Secret ending'), false);
  const next = f.session(); f.attendance(next.id, f.state().characters[b.id]); f.action(next, 'START');
  assert.equal(f.state().characters[b.id].xpEarned, 99); assert.equal(f.state().characters[b.id].id, b.id);
});

test('hidden and selected assets stay filtered in history, snapshots, and replay after role reduction', () => {
  const f = fixture(); const b = f.character(); const session = f.session(); f.attendance(session.id, b);
  let active = f.action(session, 'START').session;
  const hidden = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Hidden scene', gmNotes: 'Cult secret' }).asset;
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: hidden.id, status: 'ACTIVE' }, active.version).session;
  assert.equal(f.read('B').activeCampaign.sessions[0].currentSceneId, null);
  assert.equal(f.run('B', 'getHistory', { campaignId: f.campaign.id }).events.some(row => row.data.sceneId === hidden.id), false);
  const clue = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'CLUE', name: 'The selected clue', sceneId: hidden.id, gmNotes: 'Secret culprit', visibility: 'SELECTED_PLAYERS', selectedUserIds: [f.accounts.B.id] }).asset;
  const shown = f.read('B').activeCampaign.assets[0]; assert.equal(shown.id, clue.id); assert.equal(shown.gmNotes, undefined);
  const ended = f.action(active, 'END'); const view = f.run('B', 'getHistory', { campaignId: f.campaign.id });
  assert.equal(view.snapshots[0].scenes.length, 0); assert.equal(view.snapshots[0].assets.length, 1);
  f.run('A', 'revealStoryAsset', { campaignId: f.campaign.id, assetId: clue.id, visibility: 'GM_ONLY' }, clue.version);
  assert.equal(f.run('B', 'getHistory', { campaignId: f.campaign.id }).snapshots[0].assets.length, 0);
  const bMember = f.read('A').activeCampaign.members.find(row => row.userId === f.accounts.B.id);
  const gmMember = f.run('A', 'setMemberRole', { campaignId: f.campaign.id, userId: bMember.userId, role: 'GM' }, bMember.version).member;
  const payload = { campaignId: f.campaign.id, kind: 'NPC', name: 'GM record', gmNotes: 'Original secret', visibility: 'GM_ONLY' };
  f.run('B', 'createStoryAsset', payload, undefined, 'private-record');
  f.run('A', 'setMemberRole', { campaignId: f.campaign.id, userId: gmMember.userId, role: 'CO_GM' }, gmMember.version);
  const replay = f.run('B', 'createStoryAsset', payload, undefined, 'private-record'); assert.equal(replay.asset, null);
  assert.equal(ended.snapshot.characters[0].ownerUserId, f.accounts.B.id);
});

test('narrative scene entry refills pool once, structured scenes do not, and bonus dice are preserved', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  let active = f.action(session, 'START').session;
  const narrative = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Narrative', sceneType: 'NARRATIVE', visibility: 'CAMPAIGN_PLAYERS' }).asset;
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: narrative.id }, active.version).session;
  assert.equal(f.state().characters[c.id].normalDice, 4); assert.equal(f.state().characters[c.id].horrorDice, 1);
  f.edit(state => { state.characters[c.id].normalDice = 1; state.characters[c.id].horrorDice = 0; });
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: narrative.id }, active.version).session;
  assert.equal(f.state().characters[c.id].normalDice, 1);
  const structured = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Structured', sceneType: 'STRUCTURED' }).asset;
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: structured.id }, active.version).session;
  assert.equal(f.state().characters[c.id].normalDice, 1);
  f.edit(state => { state.characters[c.id].normalDice = 9; });
  f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: narrative.id }, active.version);
  assert.equal(f.state().characters[c.id].normalDice, 9);
});

test('session-bound trauma expires while injuries remain, and unresolved consequences block ending', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  const active = f.action(session, 'START').session;
  f.edit(state => { state.characters[c.id].effects = [{ type: 'PENDING_TRAUMA', sessionId: session.id }]; });
  assert.throws(() => f.action(active, 'END'), code('CONFLICT'));
  f.edit(state => { state.characters[c.id].effects = [{ type: 'PERSONALITY_NEGATIVE', sessionId: session.id }]; state.characters[c.id].traumas = [{ duration: 'SESSION', sessionId: session.id }, { duration: 'SOURCE', sessionId: session.id }]; });
  f.action(active, 'END'); const saved = f.state().characters[c.id];
  assert.equal(saved.injuries.length, 1); assert.ok(saved.traumas[0].expiredAt); assert.equal(saved.traumas[1].expiredAt, undefined); assert.ok(saved.effects[0].resolvedAt);
});

test('private player journal and completed-session amendments do not rewrite prior snapshots', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  const active = f.action(session, 'START').session; const ended = f.action(active, 'END');
  const privateEntry = f.run('B', 'addJournalEvent', { campaignId: f.campaign.id, sessionId: session.id, text: 'Private player observation' }).event;
  assert.equal(privateEntry.eventType, 'AMENDMENT');
  assert.equal(f.run('A', 'getHistory', { campaignId: f.campaign.id }).events.some(row => row.id === privateEntry.id), false);
  assert.equal(f.run('B', 'getHistory', { campaignId: f.campaign.id }).events.some(row => row.id === privateEntry.id), true);
  assert.equal(f.run('B', 'getHistory', { campaignId: f.campaign.id }).snapshots[0].events.some(row => row.id === privateEntry.id), false);
  assert.equal(ended.session.status, 'COMPLETED');
});

test('large immutable snapshots use individually bounded rows and compact retry receipts', () => {
  const f = fixture(); const session = f.session(); const active = f.action(session, 'START').session;
  for (let index = 0; index < 6; index++) f.run('A', 'addJournalEvent', { campaignId: f.campaign.id, sessionId: session.id, text: 'x'.repeat(9000), visibility: 'CAMPAIGN_PLAYERS' });
  const ended = f.action(active, 'END', {}, 'large-end'); assert.ok(JSON.stringify(ended.snapshot).length > 40000);
  Object.values(f.state().snapshots).forEach(row => assert.ok(JSON.stringify(row).length < 40000));
  const receipt = Object.values(f.state().mutations).find(row => row.requestId === 'large-end');
  assert.deepEqual(Object.keys(receipt.result).sort(), ['sessionId', 'snapshotId']);
  assert.deepEqual(f.action(active, 'END', {}, 'large-end'), ended);
});

test('owner export/restore preserves scoped IDs and history without unrelated campaigns or credentials', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  const active = f.action(session, 'START').session; f.action(active, 'END', { xpAwards: [{ characterId: c.id, amount: 4 }] });
  assert.throws(() => f.run('B', 'exportCampaign', { campaignId: f.campaign.id }), code('FORBIDDEN'));
  const backup = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  assert.equal(backup.tables.users.some(user => user.id === f.accounts.C.id), false);
  assert.equal(JSON.stringify(backup).includes('Unrelated secret'), false);
  assert.equal(JSON.stringify(backup).includes('sessionToken'), false);
  const before = f.state(); f.edit(state => { state.characters[c.id].xpEarned = 999; });
  const result = f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Recovery exercise' }, before.campaigns[f.campaign.id].version);
  assert.equal(result.restored, true); assert.equal(f.state().characters[c.id].xpEarned, 9);
  assert.deepEqual(f.state().campaigns[f.unrelated.id], before.campaigns[f.unrelated.id]);
  assert.deepEqual(f.state().users[f.accounts.C.id], before.users[f.accounts.C.id]);
  assert.equal(f.state().characters[c.id].id, c.id); assert.ok(f.state().characters[c.id].version > before.characters[c.id].version);
  const oldSnapshot = Object.values(before.snapshots).find(row => row.kind === 'SNAPSHOT');
  assert.deepEqual(f.state().snapshots[oldSnapshot.id], before.snapshots[oldSnapshot.id]);
});

test('restore rejects corrupted checksums, broken foreign keys, schema and cross-campaign data atomically', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  const original = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  for (const modify of [
    backup => { backup.campaign.name = 'Changed without digest'; },
    backup => { backup.schemaVersion = 9; checksum(backup); },
    backup => { backup.tables.attendance[0].characterId = 'character:absent'; checksum(backup); },
    backup => { backup.tables.characters[0].campaignId = f.unrelated.id; checksum(backup); },
    backup => { backup.tables.characters[0].accessToken = 'forbidden'; checksum(backup); }
  ]) {
    const backup = structuredClone(original); modify(backup); const before = f.state();
    assert.throws(() => f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Invalid recovery' }, before.campaigns[f.campaign.id].version), error => ['VALIDATION', 'FORBIDDEN'].includes(error.code));
    assert.deepEqual(f.state(), before);
  }
});

test('scene and session end expire GM rule effects once and preserve the awarded character version in XP history', () => {
  const f = fixture(); const c = f.character(); const other = f.character('A'); const session = f.session(); f.attendance(session.id, c);
  let active = f.action(session, 'START').session;
  const first = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'First', sceneType: 'STRUCTURED' }).asset;
  const second = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Second', sceneType: 'NARRATIVE' }).asset;
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: first.id }, active.version).session;
  f.edit(state => {
    state.characters[c.id].effects = ['SCENE', 'SESSION', 'NEXT_ACTION', 'GM_RESOLVED'].map(duration => ({
      id: 'effect-' + duration, type: 'GM_RULE_EFFECT', sessionId: session.id, sceneId: first.id, parameters: { duration }
    }));
    state.characters[other.id].effects = [{ type: 'GM_RULE_EFFECT', sessionId: session.id, parameters: { duration: 'SESSION' } }];
  });
  const beforeScene = f.state().characters[c.id].version;
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: second.id }, active.version).session;
  const afterScene = f.state().characters[c.id];
  assert.equal(afterScene.effects[0].expiryReason, 'SCENE_ENDED');
  assert.equal(afterScene.effects[1].expiredAt, undefined);
  assert.equal(afterScene.version, beforeScene + 1, 'refill and effect expiry form one character revision');
  f.edit(state => { state.characters[c.id].traumas = [{ sessionId: session.id, duration: 'SESSION' }]; });
  const beforeEnd = f.state().characters[c.id].version;
  const payload = { xpAwards: [{ characterId: c.id, amount: 2 }] };
  const ended = f.action(active, 'END', payload, 'expire-end');
  const saved = f.state();
  assert.equal(saved.characters[c.id].version, beforeEnd + 1, 'XP and duration expiry form one character revision');
  assert.ok(saved.characters[c.id].effects.every(effect => effect.expiredAt));
  assert.ok(saved.characters[other.id].effects[0].expiredAt, 'non-attending investigator effects cannot carry into another session');
  const ledger = Object.values(saved.xpLedger)[0];
  assert.equal(ledger.characterVersion, saved.characters[c.id].version);
  assert.equal(ended.snapshot.characters[0].version, saved.characters[c.id].version);
  assert.deepEqual(f.action(active, 'END', payload, 'expire-end'), ended);
  assert.deepEqual(f.state(), saved);
});

test('selected snapshot access follows current revocation and missing source records fail closed', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  let active = f.action(session, 'START').session;
  const scene = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Shared scene', visibility: 'SELECTED_PLAYERS', selectedUserIds: [f.accounts.B.id] }).asset;
  active = f.run('A', 'setScene', { campaignId: f.campaign.id, sessionId: session.id, sceneId: scene.id }, active.version).session;
  const clue = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'CLUE', name: 'Private clue', sceneId: scene.id, visibility: 'SELECTED_PLAYERS', selectedUserIds: [f.accounts.B.id] }).asset;
  f.action(active, 'END');
  assert.equal(f.run('B', 'getHistory', { campaignId: f.campaign.id }).snapshots[0].assets.length, 1);
  f.run('A', 'revealStoryAsset', { campaignId: f.campaign.id, assetId: clue.id, visibility: 'SELECTED_PLAYERS', selectedUserIds: [f.accounts.A.id] }, clue.version);
  let history = f.run('B', 'getHistory', { campaignId: f.campaign.id });
  assert.equal(history.snapshots[0].assets.length, 0);
  f.edit(state => { delete state.scenes[scene.id]; });
  history = f.run('B', 'getHistory', { campaignId: f.campaign.id });
  assert.equal(history.snapshots[0].scenes.length, 0);
  assert.equal(JSON.stringify(history).includes('Shared scene'), false);
});

test('invalid duplicate or absent end-session XP awards roll back all state changes', () => {
  const f = fixture(); const c = f.character(); const other = f.character('A'); const session = f.session(); f.attendance(session.id, c);
  const active = f.action(session, 'START').session;
  for (const awards of [[{ characterId: c.id, amount: 1 }, { characterId: c.id, amount: 2 }],
    [{ characterId: c.id, amount: 1 }, { characterId: other.id, amount: 2 }]]) {
    const before = f.state();
    assert.throws(() => f.action(active, 'END', { xpAwards: awards }), code('VALIDATION'));
    assert.deepEqual(f.state(), before);
  }
});

test('restore preserves current roles, reveal revocations, owners, and append-only history missing from an old backup', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  const scene = f.run('A', 'createStoryAsset', { campaignId: f.campaign.id, kind: 'SCENE', name: 'Protected source', visibility: 'SELECTED_PLAYERS', selectedUserIds: [f.accounts.B.id] }).asset;
  const backup = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  const bMember = f.read('A').activeCampaign.members.find(row => row.userId === f.accounts.B.id);
  f.run('A', 'setMemberRole', { campaignId: f.campaign.id, userId: f.accounts.B.id, role: 'CO_GM' }, bMember.version);
  f.run('A', 'revealStoryAsset', { campaignId: f.campaign.id, assetId: scene.id, visibility: 'GM_ONLY' }, scene.version);
  const journal = f.run('A', 'addJournalEvent', { campaignId: f.campaign.id, text: 'Later historical event', visibility: 'CAMPAIGN_PLAYERS' }).event;
  const before = f.state();
  const restored = f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Old mutable state recovery' }, before.campaigns[f.campaign.id].version);
  assert.deepEqual(f.state().members[f.campaign.id + ':' + f.accounts.B.id], before.members[f.campaign.id + ':' + f.accounts.B.id]);
  assert.equal(f.state().characters[c.id].ownerUserId, f.accounts.B.id);
  assert.equal(f.state().scenes[scene.id].visibility, 'GM_ONLY');
  assert.deepEqual(f.state().events[journal.id], before.events[journal.id]);
  assert.ok(restored.retainedCounts.events > 0);
});

test('restore rejects rewriting existing immutable records and skips unauthenticated new mutation receipts', () => {
  const f = fixture(); const session = f.session(); const active = f.action(session, 'START').session; f.action(active, 'END');
  const original = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  const forged = structuredClone(original); forged.tables.snapshots.find(row => row.kind === 'SNAPSHOT').summary = 'Edited history'; checksum(forged);
  const before = f.state();
  assert.throws(() => f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup: forged, reason: 'Forged history' }, before.campaigns[f.campaign.id].version), code('VALIDATION'));
  assert.deepEqual(f.state(), before);
  const backup = structuredClone(original);
  const forgedId = f.accounts.B.id + ':forged-retry';
  backup.tables.mutations.push({ id: forgedId, userId: f.accounts.B.id, campaignId: f.campaign.id, operation: 'rollDice', requestId: 'forged-retry', fingerprint: 'caller supplied', result: { roll: { id: 'fake' } } });
  checksum(backup);
  const result = f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Restore data without forged receipts' }, before.campaigns[f.campaign.id].version);
  assert.equal(result.skippedMutationReceipts, 1);
  assert.equal(f.state().mutations[forgedId], undefined);
});

test('restore requires current private file bindings and rejects foreign campaign or unknown files', () => {
  const f = fixture();
  f.edit(state => {
    state.materials['material:own'] = { id: 'material:own', campaignId: f.campaign.id, ownerUserId: f.accounts.A.id, driveFileId: 'private_file_A', visibility: 'OWNER_ONLY', version: 1 };
    state.materials['material:foreign'] = { id: 'material:foreign', campaignId: f.unrelated.id, ownerUserId: f.accounts.C.id, driveFileId: 'private_file_C', visibility: 'OWNER_ONLY', version: 1 };
  });
  const original = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  for (const fileId of ['private_file_C', 'unregistered_file']) {
    const backup = structuredClone(original); backup.tables.materials[0].driveFileId = fileId; checksum(backup); const before = f.state();
    assert.throws(() => f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Rebind storage' }, before.campaigns[f.campaign.id].version), code('FORBIDDEN'));
    assert.deepEqual(f.state(), before);
  }
  const before = f.state();
  const result = f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup: original, reason: 'Known file restoration' }, before.campaigns[f.campaign.id].version);
  assert.equal(result.restored, true); assert.equal(f.state().materials['material:own'].driveFileId, 'private_file_A');
});

test('unknown restored membership assertions require a fresh invitation and cannot grant a verified unrelated account access', () => {
  const f = fixture(); const originalC = f.state().users[f.accounts.C.id];
  const backup = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  backup.tables.users.push({ id: originalC.id, googleSubjectId: originalC.googleSubjectId, displayName: originalC.displayName,
    email: originalC.email, preferredLanguage: originalC.preferredLanguage, createdAt: originalC.createdAt });
  backup.tables.members.push({ id: 'member:restored-C', campaignId: f.campaign.id, userId: originalC.id,
    role: 'GM', status: 'ACTIVE', version: 1 }); checksum(backup);
  const before = f.state();
  const result = f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Restore archived participant' }, before.campaigns[f.campaign.id].version);
  const member = f.state().members[f.campaign.id + ':' + originalC.id];
  assert.equal(member.status, 'INVITED'); assert.equal(member.role, 'PLAYER'); assert.equal(result.pendingMemberships, 1);
  assert.deepEqual(f.state().users[originalC.id], originalC);
  assert.throws(() => f.read('C'), code('FORBIDDEN'));
});

test('restore validates nested campaign links, book references and scene-map references', () => {
  const f = fixture(); const c = f.character(); const session = f.session(); f.attendance(session.id, c);
  f.edit(state => {
    state.books['book:1'] = { id: 'book:1', campaignId: f.campaign.id, ownerUserId: f.accounts.A.id, title: 'Supplement', checksum: 'a'.repeat(64), version: 1 };
    state.entities['entity:1'] = { id: 'entity:1', campaignId: f.campaign.id, bookId: 'book:1', name: 'Imported rule', englishText: 'Review this rule.', verificationStatus: 'NEEDS_REVIEW', version: 1 };
  });
  const original = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  for (const modify of [
    backup => { backup.tables.entities[0].bookId = 'book:missing'; },
    backup => { backup.tables.sessions[0].sceneStatuses = { 'scene:missing': 'ACTIVE' }; },
    backup => { backup.tables.characters[0].effects = [{ sessionId: session.id, campaignId: f.unrelated.id }]; },
    backup => { backup.tables.characters[0].effects = [{ rollId: 'roll:missing' }]; },
    backup => { backup.tables.entities[0].id = '__proto__'; }
  ]) {
    const backup = structuredClone(original); modify(backup); checksum(backup); const before = f.state();
    assert.throws(() => f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Invalid scoped source' }, before.campaigns[f.campaign.id].version), error => ['VALIDATION', 'FORBIDDEN'].includes(error.code));
    assert.deepEqual(f.state(), before);
  }
});

test('restored JSON cannot promote unreviewed imports or forged canonical sources to VERIFIED', () => {
  const f = fixture(); f.seedCatalog();
  f.edit(state => {
    state.books['book:import'] = { id: 'book:import', campaignId: f.campaign.id, ownerUserId: f.accounts.A.id, title: 'Imported book', checksum: 'a'.repeat(64), version: 1 };
    state.entities['book:import:rule'] = { id: 'book:import:rule', campaignId: f.campaign.id, bookId: 'book:import', type: 'RULE', name: 'Unreviewed', englishText: 'Unverified source', verificationStatus: 'NEEDS_REVIEW', version: 1 };
  });
  const backup = f.run('A', 'exportCampaign', { campaignId: f.campaign.id }).backup;
  const imported = backup.tables.entities.find(row => row.id === 'book:import:rule'); imported.verificationStatus = 'VERIFIED'; imported.statusSource = 'VERIFIED';
  const canonicalRow = backup.tables.entities.find(row => row.canonicalCatalogId === 'agility');
  canonicalRow.englishDescription = 'Forged bonus and official rule';
  checksum(backup);
  const before = f.state();
  f.run('A', 'restoreCampaign', { campaignId: f.campaign.id, backup, reason: 'Untrusted source review exercise' }, before.campaigns[f.campaign.id].version);
  const saved = f.state();
  assert.equal(saved.entities[imported.id].verificationStatus, 'NEEDS_REVIEW');
  assert.equal(saved.entities[canonicalRow.id].verificationStatus, 'NEEDS_REVIEW');
  assert.equal(saved.entities[canonicalRow.id].canonicalCatalogId, undefined);
  assert.equal(saved.entities[canonicalRow.id].canonicalProperties, undefined);
  const goodCanonical = Object.values(saved.entities).find(row => row.canonicalCatalogId === 'athletics');
  assert.equal(goodCanonical.verificationStatus, 'VERIFIED');
  assert.equal(saved.books[f.campaign.id + ':corebook'].checksum, f.A.catalog.provenance.sha256);
});
