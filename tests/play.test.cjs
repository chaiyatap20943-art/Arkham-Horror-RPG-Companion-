'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadModules } = require('../scripts/node-runtime.cjs');

function fixture(overrides = {}) {
  const A = loadModules();
  let state = A.emptyState(), sequence = 0, calls = 0, faces = [], failCommit = false;
  const copy = value => JSON.parse(JSON.stringify(value));
  const store = {
    read(fn) { return fn(copy(state)); },
    transact(fn) {
      const next = copy(state), result = fn(next);
      if (failCommit) { failCommit = false; throw new Error('Simulated commit failure'); }
      state = next; return result;
    }
  };
  const service = A.createFullService({ store, now: () => '2026-10-07T00:00:00.000Z',
    id: () => String(++sequence), digest: text => createHash('sha256').update(text).digest('hex'),
    d6() { calls++; assert.ok(faces.length, 'A test must provide every server die'); return faces.shift(); }
  });
  const users = {};
  for (const sub of ['A', 'B', 'C']) users[sub] = service.upsertUser({ sub,
    email: `${sub.toLowerCase()}@example.com`, emailVerified: true, name: sub });
  function run(actor, operation, payload, expectedVersion, requestId) {
    const request = { operation, payload, requestId: requestId || `test-${++sequence}` };
    if (expectedVersion !== undefined) request.expectedVersion = expectedVersion;
    return service.execute(users[actor].id, request);
  }
  const campaign = run('A', 'createCampaign', { name: 'Play tests', notes: 'GM-only campaign secret' }).campaign;
  for (const actor of ['B', 'C']) {
    const invite = run('A', 'inviteMember', { campaignId: campaign.id, email: users[actor].email }).invitation;
    run(actor, 'respondInvite', { inviteId: invite.id, decision: 'ACCEPT' });
  }
  // Approved/current-session fixtures exist only in tests; product approval is never bypassed.
  const base = { campaignId: campaign.id, ownerUserId: users.B.id, name: 'Test investigator',
    status: 'APPROVED', build: { personalityId: 'ambitious', background: 'Private investigator history' },
    skills: { lore: 6, agility: 6, wits: 6 }, knacks: [], equipment: [], money: 0,
    xpEarned: 0, xpSpent: 0, insightLimit: 2, insightCurrent: 2, poolMaximum: 6,
    poolLimit: 6, normalDice: 6, horrorDice: 0, horrorLimit: 0,
    injuries: [], traumas: [], effects: [], mundaneResources: [], supernaturalResources: [],
    createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', version: 1 };
  const character = { ...base, ...copy(overrides), id: 'character:play-test' };
  state.characters[character.id] = character;
  const session = { id: 'session:play-test', campaignId: campaign.id, status: 'ACTIVE',
    number: 1, name: 'Test session', gmNotes: 'GM-only session secret', version: 1,
    createdAt: base.createdAt, updatedAt: base.updatedAt };
  state.sessions[session.id] = session;
  state.attendance['attendance:test'] = { id: 'attendance:test', campaignId: campaign.id,
    sessionId: session.id, characterId: character.id, userId: users.B.id, attendance: 'PRESENT',
    version: 1, createdAt: base.createdAt, updatedAt: base.updatedAt };
  function action(operation, extra = {}, actor = 'B', expectedVersion, requestId) {
    return run(actor, operation, { campaignId: campaign.id, characterId: character.id,
      sessionId: session.id, ...extra }, expectedVersion === undefined ? state.characters[character.id].version : expectedVersion, requestId);
  }
  return { A, service, users, campaign, character, session, run, action,
    dice: (...values) => { faces = values; }, calls: () => calls,
    state: () => copy(state), characterState: () => copy(state.characters[character.id]),
    seed: fn => fn(state), failCommit: () => { failCommit = true; } };
}
const code = value => error => error.code === value;
const injury = entityId => ({ id: `injury:${entityId}`, entityId, createdAt: '2026-10-07T00:00:00.000Z' });

test('natural one fails and natural six succeeds even under accumulated injury penalties', () => {
  const h = fixture({ skills: { lore: 2 }, injuries: [injury('concussed'), injury('severely-injured')] });
  h.dice(1, 6);
  const { roll, character } = h.action('rollDice', { skillId: 'lore', diceCount: 2 });
  assert.equal(roll.modifier, -3);
  assert.equal(roll.successes, 1);
  assert.equal(roll.successful, true);
  assert.deepEqual(roll.results.map(d => d.face), [1, 6]);
  assert.equal(character.normalDice, 4);
  assert.equal(roll.sources[0].printedPage, 17);
  assert.equal(roll.rulesVersion, h.A.catalog.sourceVersion);
  assert.equal(roll.sources[0].sourceVersion, h.A.catalog.sourceVersion);
  assert.equal(roll.sources[0].bookId, h.A.catalog.provenance.bookId);
  assert.ok(roll.sources.some(source => source.printedPage === 32));
});

const ruleParameters = extra => ({ modifier: 1, advantage: false, disadvantage: false,
  duration: 'NEXT_ACTION', ...extra });
const rulePayload = extra => ({ kind: 'KNACK', entityId: 'hypnotic-tone',
  reason: 'Private GM context for this persuasive action', parameters: ruleParameters(), ...extra });

test('rule adjudication requires current GM authority, an approved build, owned verified source, and version', () => {
  const h = fixture({ knacks: ['hypnotic-tone'] });
  const payload = rulePayload();
  assert.throws(() => h.action('applyRuleEffect', payload), code('FORBIDDEN'));
  assert.throws(() => h.action('applyRuleEffect', payload, 'C'), code('FORBIDDEN'));
  assert.throws(() => h.action('applyRuleEffect', payload, 'A', 99), code('CONFLICT'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ entityId: 'custom-unverified-rule' }), 'A'), code('RULE_NOT_VERIFIED'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ entityId: 'scientific' }), 'A'), code('VALIDATION'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ reason: ' ' }), 'A'), code('VALIDATION'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ modifier: 7 }) }), 'A'), code('VALIDATION'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ advantage: 'true' }) }), 'A'), code('VALIDATION'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ duration: 'FOREVER' }) }), 'A'), code('VALIDATION'));
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ sourceVersion: 'forged' }) }), 'A'), code('VALIDATION'));
  h.seed(state => { state.characters[h.character.id].status = 'DRAFT'; });
  assert.throws(() => h.action('applyRuleEffect', payload, 'A'), code('VALIDATION'));
  h.seed(state => { state.characters[h.character.id].status = 'APPROVED'; state.sessions[h.session.id].status = 'COMPLETED'; });
  assert.throws(() => h.action('applyRuleEffect', payload, 'A'), code('CONFLICT'));
  assert.equal(h.characterState().effects.length, 0);
});

test('personality and equipment adjudications validate the investigator selection rather than accepting a catalog name alone', () => {
  const h = fixture({ equipment: [{ entityId: 'flashlight', quantity: 1 }] });
  const item = h.A.catalog.equipment.find(entry => entry.id === 'flashlight');
  assert.ok(item);
  const personality = h.action('applyRuleEffect', rulePayload({ kind: 'PERSONALITY', entityId: 'ambitious' }), 'A');
  assert.equal(personality.effect.source.printedPage, 45);
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ kind: 'PERSONALITY', entityId: 'analytical' }), 'A'), code('VALIDATION'));
  const equipment = h.action('applyRuleEffect', rulePayload({ kind: 'EQUIPMENT', entityId: item.id }), 'A');
  assert.equal(equipment.effect.source.entityId, item.id);
  h.seed(state => { state.characters[h.character.id].equipment[0].quantity = 0; });
  assert.throws(() => h.action('applyRuleEffect', rulePayload({ kind: 'EQUIPMENT', entityId: item.id }), 'A'), code('VALIDATION'));
});

test('GM adjudication records confidential reasoning separately from bounded roll effects and verified rule references', () => {
  const h = fixture({ skills: { lore: 6 }, knacks: ['hypnotic-tone'] });
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ modifier: 6, duration: 'SESSION' }) }), 'A');
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ modifier: 6, duration: 'SESSION' }) }), 'A');
  h.dice(1, 2, 6);
  const { roll } = h.action('rollDice', { skillId: 'lore', diceCount: 3 });
  assert.equal(roll.modifier, 6);
  assert.equal(roll.adjudicatedModifier, 6);
  assert.equal(roll.successes, 2);
  assert.equal(roll.adjudication, 'GM_ADJUDICATED');
  assert.equal(roll.ruleEffects.length, 2);
  assert.ok(roll.sources.some(source => source.entityId === 'hypnotic-tone' &&
    source.sourceVersion === h.A.catalog.sourceVersion && source.sha256 === h.A.catalog.provenance.sha256));
  assert.equal(roll.sources.some(source => source.printedPage === 32), false);
  const player = h.run('B', 'bootstrap', { campaignId: h.campaign.id });
  assert.equal(JSON.stringify(player).includes('Private GM context'), false);
  const gm = h.run('A', 'bootstrap', { campaignId: h.campaign.id });
  assert.equal(gm.activeCampaign.events.filter(event => event.type === 'GM_RULE_EFFECT').length, 2);
  assert.ok(JSON.stringify(gm.activeCampaign.events).includes('Private GM context'));
  assert.equal(JSON.stringify(h.characterState().effects).includes('Private GM context'), false);
});

test('negative GM modifiers preserve natural six and advantage plus disadvantage preserve all original faces', () => {
  const h = fixture({ skills: { lore: 2 }, knacks: ['hypnotic-tone'] });
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ modifier: -6, advantage: true, disadvantage: true }) }), 'A');
  h.dice(6, 2, 1, 5);
  const { roll } = h.action('rollDice', { skillId: 'lore', diceCount: 2 });
  assert.equal(roll.advantage, true);
  assert.equal(roll.disadvantage, true);
  assert.deepEqual(roll.results.map(die => die.face), [6, 2, 1, 5]);
  assert.deepEqual(roll.results.filter(die => die.discarded).map(die => die.face), [6, 1]);
  assert.equal(roll.successes, 0);
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ modifier: -6 }) }), 'A');
  h.dice(6);
  assert.equal(h.action('rollDice', { skillId: 'lore', diceCount: 1 }).roll.successes, 1);
});

test('a next-action effect consumes once after an atomic roll and actor-scoped retries do not apply or roll twice', () => {
  const h = fixture({ knacks: ['hypnotic-tone'] });
  const applied = h.action('applyRuleEffect', rulePayload(), 'A', 1, 'apply-once');
  assert.deepEqual(h.action('applyRuleEffect', rulePayload(), 'A', 1, 'apply-once'), applied);
  assert.equal(h.characterState().effects.length, 1);
  h.dice(5); h.failCommit();
  assert.throws(() => h.action('rollDice', { skillId: 'lore', diceCount: 1 }, 'B', 2, 'roll-effect-once'), /commit failure/);
  assert.equal(h.characterState().effects[0].resolvedAt, undefined);
  assert.equal(Object.keys(h.state().rolls).length, 0);
  h.dice(5);
  const first = h.action('rollDice', { skillId: 'lore', diceCount: 1 }, 'B', 2, 'roll-effect-once');
  assert.equal(first.roll.successes, 1);
  assert.equal(h.characterState().effects[0].consumedByRollId, first.roll.id);
  assert.deepEqual(h.action('rollDice', { skillId: 'lore', diceCount: 1 }, 'B', 2, 'roll-effect-once'), first);
  h.dice(5);
  const second = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  assert.equal(second.roll.modifier, 0);
  assert.equal(second.roll.successes, 0);
  assert.equal(second.roll.ruleEffects, undefined);
  h.seed(state => { state.members[h.campaign.id + ':' + h.users.A.id].role = 'PLAYER'; });
  assert.throws(() => h.action('applyRuleEffect', rulePayload(), 'A', 1, 'apply-once'), code('FORBIDDEN'));
});

test('effects from another session or expired, resolved, or inactive scene cannot influence a roll', () => {
  const h = fixture({ knacks: ['hypnotic-tone'] });
  h.seed(state => {
    state.scenes['scene:current'] = { id: 'scene:current', campaignId: h.campaign.id, sceneType: 'STRUCTURED' };
    state.sessions[h.session.id].currentSceneId = 'scene:current';
    state.sessions[h.session.id].sceneStatuses = { 'scene:current': 'ACTIVE' };
  });
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ duration: 'SCENE' }) }), 'A');
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ duration: 'SESSION' }) }), 'A');
  h.action('applyRuleEffect', rulePayload(), 'A');
  h.action('applyRuleEffect', rulePayload({ parameters: ruleParameters({ duration: 'GM_RESOLVED' }) }), 'A');
  h.seed(state => {
    const effects = state.characters[h.character.id].effects;
    effects[0].sceneId = 'scene:previous';
    effects[1].expiredAt = '2026-10-07T00:00:00.000Z';
    effects[2].resolvedAt = '2026-10-07T00:00:00.000Z';
    effects[3].sessionId = 'session:previous';
  });
  h.dice(5);
  const { roll } = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  assert.equal(roll.modifier, 0);
  assert.equal(roll.successes, 0);
  assert.equal(roll.ruleEffects, undefined);
  h.seed(state => { state.characters[h.character.id].effects[0].sceneId = 'scene:current'; state.sessions[h.session.id].sceneStatuses['scene:current'] = 'COMPLETED'; });
  h.dice(5);
  assert.equal(h.action('rollDice', { skillId: 'lore', diceCount: 1 }).roll.modifier, 0);
});

test('advantage and disadvantage retain all natural faces and a discarded horror one still triggers trauma', () => {
  const h = fixture({ normalDice: 4, horrorDice: 2, horrorLimit: 2 });
  h.dice(1, 6, 3, 5);
  const { roll } = h.action('rollDice', { skillId: 'lore', diceCount: 2,
    horrorCount: 2, advantage: true, disadvantage: true });
  assert.equal(roll.results.length, 4);
  assert.deepEqual(roll.results.filter(d => d.discarded).map(d => d.face), [1, 6]);
  assert.deepEqual(roll.results.filter(d => !d.discarded).map(d => d.face), [3, 5]);
  assert.equal(roll.horrorOnes, 1);
  assert.equal(roll.pendingTrauma, true);
  assert.equal(h.characterState().effects.filter(e => e.type === 'PENDING_TRAUMA').length, 1);
});

test('multiple horror ones create one severity-weighted consequence and exact retries never roll again', () => {
  const h = fixture({ normalDice: 3, horrorDice: 3, horrorLimit: 3 });
  const payload = { skillId: 'lore', diceCount: 3, horrorCount: 3 };
  h.dice(1, 1, 1, 3);
  const first = h.action('rollDice', payload, 'B', 1, 'roll-once');
  const second = h.action('rollDice', payload, 'B', 1, 'roll-once');
  assert.deepEqual(second, first);
  assert.equal(h.calls(), 3);
  assert.equal(Object.keys(h.state().rolls).length, 1);
  assert.throws(() => h.action('rollDice', { ...payload, difficulty: 2 }, 'B', 1, 'roll-once'), code('IDEMPOTENCY_CONFLICT'));
  const consequence = h.action('resolveConsequence', { rollId: first.roll.id, kind: 'TRAUMA' }, 'B', 2, 'trauma-once');
  assert.equal(consequence.consequence.severity, 6);
  assert.equal(consequence.consequence.horrorOnes, 3);
  assert.equal(consequence.consequence.entityId, 'overcome-by-horror');
  assert.equal(h.characterState().traumas.length, 1);
  assert.deepEqual(h.action('resolveConsequence', { rollId: first.roll.id, kind: 'TRAUMA' }, 'B', 2, 'trauma-once'), consequence);
  assert.equal(h.calls(), 4);
  assert.throws(() => h.action('resolveConsequence', { rollId: first.roll.id, kind: 'TRAUMA' }), code('CONFLICT'));
});

test('pending trauma must resolve before another roll, spend, simple action, strain, or refill', () => {
  const h = fixture({ normalDice: 5, horrorDice: 1, horrorLimit: 1, poolLimit: 5 });
  h.dice(1);
  h.action('rollDice', { skillId: 'lore', diceCount: 1, horrorCount: 1 });
  const before = h.state();
  assert.throws(() => h.action('rollDice', { skillId: 'lore', diceCount: 1 }), code('CONFLICT'));
  for (const action of ['SPEND', 'SIMPLE', 'STRAIN', 'REFILL']) {
    assert.throws(() => h.action('poolAction', { action, reason: 'Test timing' }, action === 'REFILL' ? 'A' : 'B'), code('CONFLICT'));
  }
  assert.deepEqual(h.state(), before);
  assert.equal(h.calls(), 1);
});

test('bonus dice may exceed maximum, healing adds no dice, and damage/discard remove regular dice first', () => {
  const h = fixture({ normalDice: 3, horrorDice: 1, horrorLimit: 3, poolLimit: 4 });
  const bonus = h.action('poolAction', { action: 'BONUS', amount: 4, reason: 'Granted bonus' }, 'A').character;
  assert.equal(bonus.normalDice + bonus.horrorDice, 8);
  assert.equal(bonus.poolLimit, 4);
  const healed = h.action('poolAction', { action: 'HEAL', amount: 2, reason: 'Treatment' }, 'A').character;
  assert.equal(healed.poolLimit, 6);
  assert.equal(healed.normalDice + healed.horrorDice, 8);
  const refilled = h.action('poolAction', { action: 'REFILL', reason: 'Scene start' }, 'A').character;
  assert.equal(refilled.normalDice + refilled.horrorDice, 8);
  const damaged = h.action('poolAction', { action: 'DAMAGE', amount: 3, reason: 'Attack' }, 'A').character;
  assert.equal(damaged.poolLimit, 3);
  assert.equal(damaged.normalDice, 2);
  assert.equal(damaged.horrorDice, 1);
  assert.equal(damaged.horrorLimit, 3);
  const spent = h.action('poolAction', { action: 'SPEND' }).character;
  assert.equal(spent.normalDice, 1);
  assert.equal(spent.horrorDice, 1);
  const wounded = h.action('poolAction', { action: 'DAMAGE', amount: 3, reason: 'Attack' }, 'A').character;
  assert.equal(wounded.poolLimit, 0);
  assert.equal(wounded.normalDice + wounded.horrorDice, 0);
  assert.equal(wounded.horrorLimit, 3);
});

test('refill prioritizes horror while honoring a damaged pool limit and strain restores only the limit', () => {
  const h = fixture({ normalDice: 0, horrorDice: 0, horrorLimit: 4, poolLimit: 2 });
  const first = h.action('poolAction', { action: 'REFILL', reason: 'Turn start' }, 'A').character;
  assert.equal(first.horrorDice, 2);
  assert.equal(first.normalDice, 0);
  const strained = h.action('poolAction', { action: 'STRAIN' }).character;
  assert.equal(strained.poolLimit, 6);
  assert.equal(strained.horrorDice, 2);
  assert.equal(strained.normalDice, 0);
  assert.equal(strained.horrorLimit, 4);
  assert.equal(strained.effects.filter(e => e.type === 'STRAIN_INJURY_DUE').length, 1);
  const refilled = h.action('poolAction', { action: 'REFILL', reason: 'Turn start' }, 'A').character;
  assert.equal(refilled.horrorDice, 4);
  assert.equal(refilled.normalDice, 2);
});

test('Nasty Cut blocks normal healing and strain without changing state', () => {
  const h = fixture({ poolLimit: 3, normalDice: 3, injuries: [injury('nasty-cut')] });
  const before = h.state();
  assert.throws(() => h.action('poolAction', { action: 'HEAL', amount: 3, reason: 'Treatment' }, 'A'), code('VALIDATION'));
  assert.throws(() => h.action('poolAction', { action: 'STRAIN' }), code('VALIDATION'));
  assert.deepEqual(h.state(), before);
});

test('Imaginative spends one Insight for two advantage dice and cannot recover horror under its active negative', () => {
  const h = fixture({ build: { personalityId: 'imaginative' }, horrorLimit: 2 });
  h.dice(2, 3, 6);
  const first = h.action('rollDice', { skillId: 'lore', diceCount: 1, useInsight: true });
  assert.equal(first.roll.results.length, 3);
  assert.equal(first.roll.results.filter(d => d.discarded).length, 2);
  assert.equal(first.roll.successes, 1);
  assert.equal(first.character.insightCurrent, 1);
  assert.ok(first.roll.sources.some(source => source.printedPage === 46));
  h.seed(state => state.characters[h.character.id].effects.push({ type: 'PERSONALITY_NEGATIVE',
    personalityId: 'imaginative', sessionId: h.session.id }));
  assert.throws(() => h.action('poolAction', { action: 'RECOVER_HORROR', reason: 'Rest' }, 'A'), code('VALIDATION'));
  h.seed(state => { state.sessions[h.session.id].status = 'COMPLETED'; });
  const recovered = h.action('poolAction', { action: 'RECOVER_HORROR', reason: 'Rest after session' }, 'A').character;
  assert.equal(recovered.horrorLimit, 1);
});

test('Ambitious adds two successes only after a successful action and once per action', () => {
  const h = fixture();
  h.dice(6);
  const first = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  const insight = h.action('useInsight', { kind: 'EXTRA_SUCCESS', rollId: first.roll.id });
  assert.equal(insight.roll.successes, 3);
  assert.equal(insight.character.insightCurrent, 1);
  assert.equal(insight.source.printedPage, 45);
  assert.throws(() => h.action('useInsight', { kind: 'EXTRA_SUCCESS', rollId: first.roll.id }), code('VALIDATION'));
  h.dice(2);
  const failed = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  assert.throws(() => h.action('useInsight', { kind: 'EXTRA_SUCCESS', rollId: failed.roll.id }), code('VALIDATION'));
});

test('Insight follows the state version even when random roll IDs sort contrary to two equal timestamps', () => {
  const h = fixture();
  h.dice(6, 6);
  const earlier = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  const latest = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  h.seed(state => {
    const original = state.rolls[earlier.roll.id]; delete state.rolls[earlier.roll.id];
    original.id = 'roll:zzzz'; state.rolls[original.id] = original;
  });
  const saved = h.action('useInsight', { kind: 'EXTRA_SUCCESS', rollId: latest.roll.id });
  assert.equal(saved.roll.id, latest.roll.id);
  assert.equal(saved.roll.successes, 3);
  assert.throws(() => h.action('useInsight', { kind: 'EXTRA_SUCCESS', rollId: 'roll:zzzz' }), code('CONFLICT'));
});

test('Analytical removes one horror one before trauma and its negative rolls twice taking the higher severity', () => {
  const h = fixture({ build: { personalityId: 'analytical' }, normalDice: 4, horrorDice: 2, horrorLimit: 2 });
  h.dice(1, 1, 2, 5);
  const rolled = h.action('rollDice', { skillId: 'lore', diceCount: 2, horrorCount: 2 });
  const insight = h.action('useInsight', { kind: 'ANALYTICAL', rollId: rolled.roll.id });
  assert.equal(insight.roll.horrorOnes, 1);
  assert.equal(insight.roll.pendingTrauma, true);
  h.seed(state => state.characters[h.character.id].effects.push({ type: 'PERSONALITY_NEGATIVE',
    personalityId: 'analytical', sessionId: h.session.id }));
  const resolved = h.action('resolveConsequence', { kind: 'TRAUMA', rollId: rolled.roll.id });
  assert.deepEqual(resolved.consequence.faces, [2, 5]);
  assert.equal(resolved.consequence.severity, 6);
  assert.equal(resolved.consequence.horrorOnes, 1);
});

test('Analytical can prevent a sole horror one consequence and spends Insight exactly once', () => {
  const h = fixture({ build: { personalityId: 'analytical' }, normalDice: 5, horrorDice: 1, horrorLimit: 1 });
  h.dice(1);
  const rolled = h.action('rollDice', { skillId: 'lore', diceCount: 1, horrorCount: 1 });
  const protectedAction = h.action('useInsight', { kind: 'ANALYTICAL', rollId: rolled.roll.id });
  assert.equal(protectedAction.roll.pendingTrauma, false);
  assert.equal(protectedAction.roll.horrorOnes, 0);
  assert.equal(protectedAction.character.insightCurrent, 1);
  assert.ok(protectedAction.character.effects.find(e => e.type === 'PENDING_TRAUMA').resolvedAt);
  assert.throws(() => h.action('resolveConsequence', { kind: 'TRAUMA', rollId: rolled.roll.id }), code('CONFLICT'));
});

test('Sickened caps pool dice by a server d3 and Burned forces disadvantage plus discards for natural ones', () => {
  const sick = fixture({ injuries: [injury('sickened')] });
  sick.dice(5, 3, 4, 6);
  const limited = sick.action('rollDice', { skillId: 'lore', diceCount: 5 });
  assert.equal(limited.roll.sicknessLimit, 3);
  assert.equal(limited.roll.diceCount, 3);
  assert.equal(limited.character.normalDice, 3);
  const burned = fixture({ injuries: [injury('burned')] });
  burned.dice(1, 6);
  const result = burned.action('rollDice', { skillId: 'lore', diceCount: 1 });
  assert.equal(result.roll.disadvantage, true);
  assert.equal(result.roll.successful, false);
  assert.equal(result.character.normalDice, 4);
});

test('Choking makes a normal complex action difficult and a third identical unique injury is fatal', () => {
  const h = fixture({ injuries: [injury('choking')] });
  h.dice(6);
  const first = h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  assert.equal(first.roll.difficulty, 2);
  assert.equal(first.roll.successful, false);
  h.action('resolveConsequence', { kind: 'CHOKING', reason: 'Still unable to breathe' }, 'A');
  const third = h.action('resolveConsequence', { kind: 'CHOKING', reason: 'Still unable to breathe' }, 'A');
  assert.equal(third.character.outOfPlay, 'DEAD');
  assert.throws(() => h.action('rollDice', { skillId: 'lore', diceCount: 1 }), code('VALIDATION'));
});

test('fatal injury includes existing injuries and survival permanently reduces Insight limit without erasing history', () => {
  const h = fixture({ injuries: ['heavy-blow', 'slowed', 'nasty-cut', 'concussed', 'injured-leg'].map(injury) });
  h.dice(6);
  const fatal = h.action('resolveConsequence', { kind: 'INJURY', reason: 'Severe attack' }, 'A');
  assert.equal(fatal.consequence.severity, 11);
  assert.equal(fatal.consequence.entityId, 'dead');
  assert.equal(fatal.character.outOfPlay, 'DEAD');
  const survived = h.action('useInsight', { kind: 'AVOID_DEATH' }).character;
  assert.equal(survived.insightLimit, 0);
  assert.equal(survived.insightCurrent, 0);
  assert.equal(survived.outOfPlay, null);
  assert.equal(survived.injuries.at(-1).entityId, 'dead');
  assert.ok(survived.effects.some(e => e.type === 'SURVIVED_FATAL_CONSEQUENCE' && e.requiresGMResolution));
});

test('play rejects stale versions, browser faces, another owner, foreign objects, and revocation even for replay', () => {
  const h = fixture();
  const payload = { skillId: 'lore', diceCount: 1 };
  assert.throws(() => h.action('rollDice', payload, 'B', 99), code('CONFLICT'));
  assert.throws(() => h.action('rollDice', { ...payload, results: [6] }), code('VALIDATION'));
  assert.throws(() => h.action('rollDice', payload, 'C'), code('FORBIDDEN'));
  assert.equal(h.calls(), 0);
  const foreign = h.run('C', 'createCampaign', { name: 'Other campaign' }).campaign;
  assert.throws(() => h.run('C', 'rollDice', { campaignId: foreign.id, characterId: h.character.id,
    sessionId: h.session.id, ...payload }, 1), code('FORBIDDEN'));
  h.seed(state => { state.attendance['attendance:test'].attendance = 'ABSENT'; });
  assert.throws(() => h.action('rollDice', payload), code('FORBIDDEN'));
  h.seed(state => { state.attendance['attendance:test'].attendance = 'PRESENT'; });
  h.dice(6);
  h.action('rollDice', payload, 'B', 1, 'revoke-roll');
  const membership = h.state().members[`${h.campaign.id}:${h.users.B.id}`];
  h.run('A', 'removeMember', { campaignId: h.campaign.id, userId: h.users.B.id }, membership.version);
  assert.throws(() => h.action('rollDice', payload, 'B', 1, 'revoke-roll'), code('FORBIDDEN'));
  assert.equal(h.calls(), 1);
});

test('a failed roll commit leaves pool, roll, audit, and receipt unchanged', () => {
  const h = fixture();
  const before = h.state();
  h.dice(2, 6); h.failCommit();
  assert.throws(() => h.action('rollDice', { skillId: 'lore', diceCount: 1 }, 'B', 1, 'atomic-roll'), /commit failure/);
  assert.deepEqual(h.state(), before);
  const saved = h.action('rollDice', { skillId: 'lore', diceCount: 1 }, 'B', 1, 'atomic-roll');
  assert.equal(saved.roll.results[0].face, 6);
  assert.equal(saved.character.normalDice, 5);
  assert.equal(Object.keys(h.state().rolls).length, 1);
});

test('manual play adjustments reject foreign session references and trauma stays in its originating session', () => {
  const h = fixture({ normalDice: 5, horrorDice: 1, horrorLimit: 1 });
  const foreign = h.run('C', 'createCampaign', { name: 'Other campaign' }).campaign;
  h.seed(state => { state.sessions['session:foreign'] = { id: 'session:foreign', campaignId: foreign.id,
    status: 'ACTIVE', createdAt: '2026-10-07T00:00:00.000Z', version: 1 }; });
  const before = h.state();
  assert.throws(() => h.action('poolAction', { action: 'BONUS', reason: 'Correction', sessionId: 'session:foreign' }, 'A'), code('FORBIDDEN'));
  assert.throws(() => h.action('useInsight', { kind: 'CLUE', amount: 1, reason: 'Clue', sessionId: 'session:foreign' }, 'A'), code('FORBIDDEN'));
  assert.deepEqual(h.state(), before);
  h.dice(1, 1);
  const rolled = h.action('rollDice', { skillId: 'lore', diceCount: 1, horrorCount: 1 });
  h.seed(state => { state.sessions['session:other'] = { id: 'session:other', campaignId: h.campaign.id,
    status: 'PREPARING', createdAt: '2026-10-07T00:00:00.000Z', version: 1 }; });
  assert.throws(() => h.action('resolveConsequence', { kind: 'TRAUMA', rollId: rolled.roll.id,
    sessionId: 'session:other' }), code('VALIDATION'));
  const resolved = h.run('B', 'resolveConsequence', { campaignId: h.campaign.id, characterId: h.character.id,
    kind: 'TRAUMA', rollId: rolled.roll.id }, h.characterState().version);
  assert.equal(resolved.consequence.sessionId, h.session.id);
  assert.equal(Object.values(h.state().events).at(-1).sessionId, h.session.id);
});

test('party bootstrap sees shared roll outcomes without GM notes or another investigator private build', () => {
  const h = fixture(); h.dice(6);
  h.action('rollDice', { skillId: 'lore', diceCount: 1 });
  const view = h.run('C', 'bootstrap', { campaignId: h.campaign.id });
  assert.equal(view.activeCampaign.rolls.length, 1);
  assert.equal(view.activeCampaign.characters.length, 1);
  assert.equal(Object.hasOwn(view.activeCampaign.characters[0], 'build'), false);
  assert.equal(JSON.stringify(view).includes('Private investigator history'), false);
  assert.equal(JSON.stringify(view).includes('GM-only'), false);
});
