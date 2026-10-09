'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Test-only entity fixtures isolate domain constraints. The production catalog
// is extracted separately from the supplied Corebook, never from these values.
function fixtureCatalog() {
  const skillIds = ['agility', 'athletics', 'wits', 'presence', 'intuition', 'knowledge', 'resolve', 'melee-combat', 'ranged-combat', 'lore'];
  const fixtureEntity = (id, extra = {}) => ({ id, name: id, verificationStatus: 'VERIFIED', printedPage: 67, pdfPageIndex: 67, sourceVersion: 'test-only-catalog', ...extra });
  return {
    sourceVersion: 'test-only-catalog', skills: skillIds.map(id => fixtureEntity(id)),
    personalities: [fixtureEntity('test-personality')],
    archetypes: [fixtureEntity('test-archetype', {
      skillLimits: { knowledge: 2, lore: 3, intuition: 3, wits: 3 },
      knacks: { 1: ['one-a', 'one-b', 'one-c', 'one-d'], 2: ['two-a', 'two-b', 'two-c'], 3: ['three-a', 'three-b'], 4: ['four-a', 'four-b'] }
    })],
    knacks: ['one-a', 'one-b', 'one-c', 'one-d', 'two-a', 'two-b', 'two-c', 'three-a', 'three-b', 'four-a', 'four-b'].map(id => fixtureEntity(id, { prerequisites: id === 'two-b' ? ['one-b'] : [] })),
    equipment: [fixtureEntity('notebook', { category: 'USEFUL', priceCents: 200 }), fixtureEntity('coat', { category: 'PROTECTIVE', priceCents: 1500 }),
      fixtureEntity('relic', { category: 'RELIC', priceCents: 1000, requiresGMApproval: true }),
      fixtureEntity('tome', { category: 'TOME', priceCents: 2000, requiresGMApproval: true }),
      fixtureEntity('unknown-price', { category: 'USEFUL', priceCents: null })],
    rules: {
      creation: { poolMaximum: 6, gearBudgetCents: 5000, insightLimit: 1, startingKnackTier: 1,
        skillAllocation: { baseThreshold: 6, normalThreshold: 5, normalCount: 3, goodThreshold: 4, goodCount: 1 },
        packages: { gear: { additionalMoneyCents: 10000, xp: 0, insightLimit: 1 }, xp: { additionalMoneyCents: 0, xp: 5, insightLimit: 1 }, insight: { additionalMoneyCents: 0, xp: 0, insightLimit: 2 } } },
      skillCosts: { 6: 2, 5: 4, 4: 7, 3: 12 }, knackCosts: { 1: 3, 2: 6, 3: 10, 4: 15 }, knackLimits: { 1: 3, 2: 2, 3: 2, 4: 1 },
      insight: { cost: 1, maxLimit: 10, maxIncreasesPerSession: 1, qualifiers: ['background', 'injury-four', 'all-horror', 'past', 'severe-failure'] }
    }
  };
}

function harness(canonicalCatalog = false) {
  const context = vm.createContext({ Date, JSON, Object, Array, String, Number, Math, RegExp, Error });
  for (const file of ['store.js', 'domain.js', 'features.js', 'investigators.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', file), 'utf8'), context, { filename: file });
  }
  if (canonicalCatalog) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server/catalog.js'), 'utf8'), context, { filename: 'catalog.js' });
  else context.Arkham.catalog = fixtureCatalog();
  let state = context.Arkham.emptyState();
  let sequence = 0;
  let failCommit = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const store = {
    read: fn => fn(clone(state)),
    transact: fn => {
      const draft = clone(state); const result = fn(draft);
      if (failCommit) { failCommit = false; throw new Error('Injected atomic commit failure'); }
      state = draft; return result;
    }
  };
  const service = context.Arkham.createFullService({ store, now: () => '2026-10-07T00:00:00.000Z', id: () => String(++sequence),
    digest: value => crypto.createHash('sha256').update(value).digest('hex') });
  const users = {};
  for (const account of ['A', 'B', 'C', 'D']) users[account] = service.upsertUser({ sub: account, email: `${account.toLowerCase()}@example.com`, emailVerified: true, name: account });
  function run(actor, operation, payload, expectedVersion, requestId) {
    const request = { operation, payload, requestId: requestId || `request-${++sequence}` };
    if (expectedVersion !== undefined) request.expectedVersion = expectedVersion;
    return clone(service.execute(users[actor].id, request));
  }
  const campaign = run('A', 'createCampaign', { name: 'Investigator tests' }).campaign;
  const foreignCampaign = run('D', 'createCampaign', { name: 'Foreign campaign' }).campaign;
  for (const account of ['B', 'C']) {
    const invitation = run('A', 'inviteMember', { campaignId: campaign.id, email: users[account].email }).invitation;
    run(account, 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' });
  }
  function create(owner = 'B') { return run(owner, 'createInvestigator', { campaignId: campaign.id, name: 'Test investigator' }).character; }
  function build(extra = {}) {
    return { background: { narrative: 'Owner-only supernatural secret.', localVisitor: 'LOCAL' },
      personalityId: 'test-personality', archetypeId: 'test-archetype',
      skills: { agility: 5, intuition: 5, resolve: 5, knowledge: 4 },
      startingKnackId: 'one-a', package: 'xp', equipment: [{ entityId: 'notebook', quantity: 1 }], advancements: [], ...extra };
  }
  function save(character, value = build(), actor = 'B') {
    return run(actor, 'saveInvestigator', { campaignId: campaign.id, characterId: character.id, build: value }, character.version).character;
  }
  function approve(value = build(), approvedItemIds = [], owner = 'B') {
    let character = save(create(owner), value, owner);
    character = run(owner, 'submitInvestigator', { campaignId: campaign.id, characterId: character.id }, character.version).character;
    return run('A', 'reviewInvestigator', { campaignId: campaign.id, characterId: character.id, decision: 'APPROVE', approvedItemIds, notes: 'Build reviewed.' }, character.version).character;
  }
  function seedSession(id = 'session:test', targetCampaign = campaign.id, status = 'COMPLETED') {
    state.sessions[id] = { id, campaignId: targetCampaign, name: 'Test session', status, createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', version: 1 };
    return id;
  }
  return { context, service, run, users, campaign, foreignCampaign, create, build, save, approve, seedSession,
    state: () => clone(state), failCommit: () => { failCommit = true; },
    mutate: fn => fn(state),
    bootstrap: actor => run(actor, 'bootstrap', { campaignId: campaign.id }) };
}

const errorCode = expected => error => error.code === expected;

test('draft ownership, immutable identity and other-player background isolation are server enforced', () => {
  const h = harness();
  let character = h.create();
  assert.equal(character.ownerUserId, h.users.B.id);
  assert.equal(character.status, 'DRAFT');
  assert.equal(character.buildValidation.errors.length > 0, true);
  character = h.save(character);
  assert.equal(character.build.background.narrative, 'Owner-only supernatural secret.');
  assert.throws(() => h.run('C', 'saveInvestigator', { campaignId: h.campaign.id, characterId: character.id, name: 'Forged' }, character.version), errorCode('FORBIDDEN'));
  assert.throws(() => h.run('B', 'saveInvestigator', { campaignId: h.campaign.id, characterId: character.id, ownerUserId: h.users.C.id }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('B', 'saveInvestigator', { campaignId: h.foreignCampaign.id, characterId: character.id, name: 'Forged' }, character.version), errorCode('FORBIDDEN'));
  const party = h.bootstrap('C').activeCampaign.characters.find(c => c.id === character.id);
  assert.equal(Object.hasOwn(party, 'build'), false);
  assert.equal(JSON.stringify(party).includes('supernatural secret'), false);
  assert.equal(h.bootstrap('A').activeCampaign.characters[0].build.background.narrative, character.build.background.narrative);
});

test('server validates distinct free skills, catalog provenance, purchases and creation budgets', () => {
  const h = harness();
  const invalidBuilds = [
    h.build({ skills: { agility: 5, intuition: 5, knowledge: 4 } }),
    h.build({ skills: { agility: 5, intuition: 5, resolve: 5, knowledge: 3 } }),
    h.build({ personalityId: 'missing' }),
    h.build({ startingKnackId: 'two-a' }),
    h.build({ equipment: [{ entityId: 'coat', quantity: 4 }] }),
    h.build({ equipment: [{ entityId: 'unknown-price', quantity: 1 }] }),
    h.build({ equipment: [{ entityId: 'notebook', quantity: 1 }, { entityId: 'notebook', quantity: 1 }] })
  ];
  for (const value of invalidBuilds) {
    const draft = h.save(h.create(), value);
    assert.equal(draft.buildValidation.errors.length > 0, true);
    assert.throws(() => h.run('B', 'submitInvestigator', { campaignId: h.campaign.id, characterId: draft.id }, draft.version), errorCode('VALIDATION'));
  }
  assert.throws(() => h.save(h.create(), h.build({ skills: { spoofedSkill: 5 } })), errorCode('VALIDATION'));
  h.context.Arkham.catalog.personalities[0].verificationStatus = 'NEEDS_REVIEW';
  assert.equal(h.save(h.create()).buildValidation.errors.some(error => error.includes('personality')), true);
});

test('starting XP is consumed using source costs and does not change the free allocation budget', () => {
  const h = harness();
  const character = h.approve(h.build({ advancements: [{ kind: 'SKILL', entityId: 'agility' }] }));
  assert.equal(character.skills.agility, 4);
  assert.equal(character.build.skills.agility, 5);
  assert.equal(character.xpEarned, 5);
  assert.equal(character.xpSpent, 4);
  assert.equal(character.money, 4800);
  assert.equal(character.moneyUnit, 'USD_CENTS');
  const startingLedger = Object.values(h.state().xpLedger).filter(record => record.characterId === character.id);
  assert.equal(startingLedger.reduce((total, record) => total + record.spentDelta, 0), character.xpSpent);
  assert.ok(startingLedger.some(record => record.kind === 'STARTING_SKILL' && record.entityId === 'agility'));
  const invalid = h.save(h.create(), h.build({ advancements: [{ kind: 'SKILL', entityId: 'knowledge' }] }));
  assert.ok(invalid.buildValidation.errors.some(error => error.includes('Not enough')));
  const gear = h.approve(h.build({ package: 'gear', equipment: [{ entityId: 'coat', quantity: 10 }] }));
  assert.equal(gear.money, 0);
  assert.equal(gear.xpEarned, 0);
  const insight = h.approve(h.build({ package: 'insight' }));
  assert.equal(insight.insightLimit, 2);
});

test('specific relic and tome permissions are separate from invalid builds and require GM approval', () => {
  const h = harness();
  let character = h.save(h.create(), h.build({ equipment: [{ entityId: 'relic', quantity: 1 }, { entityId: 'tome', quantity: 1 }] }));
  assert.deepEqual(character.buildValidation.errors, []);
  assert.deepEqual(character.buildValidation.permissionItems.map(item => item.entityId), ['relic', 'tome']);
  character = h.run('B', 'submitInvestigator', { campaignId: h.campaign.id, characterId: character.id }, character.version).character;
  assert.throws(() => h.run('B', 'reviewInvestigator', { campaignId: h.campaign.id, characterId: character.id, decision: 'APPROVE', approvedItemIds: ['relic', 'tome'] }, character.version), errorCode('FORBIDDEN'));
  assert.throws(() => h.run('A', 'reviewInvestigator', { campaignId: h.campaign.id, characterId: character.id, decision: 'APPROVE', approvedItemIds: ['relic'] }, character.version), errorCode('VALIDATION'));
  const approved = h.run('A', 'reviewInvestigator', { campaignId: h.campaign.id, characterId: character.id, decision: 'APPROVE', approvedItemIds: ['relic', 'tome'], notes: 'Each item explicitly allowed.' }, character.version).character;
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedBy, h.users.A.id);
  assert.equal(approved.permissionExceptions.length, 2);
  assert.equal(approved.normalDice, 6);
  assert.equal(approved.horrorDice, 0);
  assert.equal(approved.insightCurrent, approved.insightLimit);
  assert.equal(Object.hasOwn(approved, 'hp'), false);
});

test('rejection requires an explanation, drafts resume, and approved builds cannot reset state', () => {
  const h = harness();
  let character = h.save(h.create());
  character = h.run('B', 'submitInvestigator', { campaignId: h.campaign.id, characterId: character.id }, character.version).character;
  assert.throws(() => h.run('A', 'reviewInvestigator', { campaignId: h.campaign.id, characterId: character.id, decision: 'REJECT' }, character.version), errorCode('VALIDATION'));
  character = h.run('A', 'reviewInvestigator', { campaignId: h.campaign.id, characterId: character.id, decision: 'REJECT', notes: 'Expand your background.' }, character.version).character;
  assert.equal(character.status, 'REJECTED');
  character = h.save(character, h.build({ background: { narrative: 'Expanded history.' } }));
  assert.equal(character.status, 'DRAFT');
  const approved = h.approve();
  assert.throws(() => h.save(approved), errorCode('CONFLICT'));
  assert.throws(() => h.run('B', 'adjustInvestigator', { campaignId: h.campaign.id, characterId: approved.id, reason: 'Give myself money', changes: { money: 100000 } }, approved.version), errorCode('FORBIDDEN'));
});

test('XP awards are GM-only and advancement honors cost, archetype limits and stale versions', () => {
  const h = harness();
  let character = h.approve();
  assert.throws(() => h.run('B', 'awardXP', { campaignId: h.campaign.id, characterId: character.id, amount: 100, reason: 'Forged award' }, character.version), errorCode('FORBIDDEN'));
  character = h.run('A', 'awardXP', { campaignId: h.campaign.id, characterId: character.id, amount: 40, reason: 'A completed investigation.' }, character.version).character;
  const stale = character.version;
  let result = h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'knowledge', reason: 'Study' }, character.version);
  character = result.character;
  assert.equal(character.skills.knowledge, 3);
  assert.equal(result.ledger.spentDelta, 7);
  assert.equal(result.ledger.source.printedPage, 67);
  assert.throws(() => h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'knowledge', reason: 'Concurrent study' }, stale), errorCode('CONFLICT'));
  character = h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'knowledge', reason: 'Advanced study' }, character.version).character;
  assert.equal(character.skills.knowledge, 2);
  assert.throws(() => h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'knowledge', reason: 'Too far' }, character.version), errorCode('VALIDATION'));
  character = h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'agility', reason: 'Training' }, character.version).character;
  assert.throws(() => h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'agility', reason: 'Wrong archetype' }, character.version), errorCode('VALIDATION'));
  assert.equal(h.state().characters[character.id].skills.agility, 4);
});

test('knacks enforce each preceding tier, specific prerequisites, duplicates and tier maximums', () => {
  const h = harness();
  let character = h.approve();
  character = h.run('A', 'awardXP', { campaignId: h.campaign.id, characterId: character.id, amount: 100, reason: 'Tier validation test' }, character.version).character;
  function buy(id) { return h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'KNACK', entityId: id, reason: 'Verified training' }, character.version).character; }
  assert.throws(() => buy('three-a'), errorCode('VALIDATION'));
  assert.throws(() => buy('two-b'), errorCode('VALIDATION'));
  character = buy('one-b');
  character = buy('one-c');
  assert.throws(() => buy('one-d'), errorCode('VALIDATION'));
  assert.throws(() => buy('one-a'), errorCode('VALIDATION'));
  character = buy('two-b');
  character = buy('two-a');
  assert.throws(() => buy('two-c'), errorCode('VALIDATION'));
  character = buy('three-a');
  character = buy('four-a');
  assert.throws(() => buy('four-b'), errorCode('VALIDATION'));
  assert.equal(character.knacks.length, 7);
});

test('Insight advancement needs GM qualification, completed matching session and one purchase per session', () => {
  const h = harness();
  let character = h.approve();
  const completed = h.seedSession();
  const active = h.seedSession('session:active', h.campaign.id, 'ACTIVE');
  const foreign = h.seedSession('session:foreign', h.foreignCampaign.id);
  const payload = { campaignId: h.campaign.id, characterId: character.id, kind: 'INSIGHT', sessionId: completed, qualifier: 'background', reason: 'The investigator confronted their lost family.' };
  assert.throws(() => h.run('B', 'advanceInvestigator', payload, character.version), errorCode('FORBIDDEN'));
  assert.throws(() => h.run('A', 'advanceInvestigator', { ...payload, qualifier: 'anything' }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('A', 'advanceInvestigator', { ...payload, sessionId: active }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('A', 'advanceInvestigator', { ...payload, sessionId: foreign }, character.version), errorCode('FORBIDDEN'));
  character = h.run('A', 'advanceInvestigator', payload, character.version).character;
  assert.equal(character.insightLimit, 2);
  assert.equal(character.insightCurrent, 1);
  assert.equal(character.xpSpent, 1);
  assert.throws(() => h.run('A', 'advanceInvestigator', payload, character.version), errorCode('VALIDATION'));
});

test('equipment uses verified cents prices, quantity accounting and explicit GM restricted acquisitions', () => {
  const h = harness();
  let character = h.approve();
  const buy = { campaignId: h.campaign.id, characterId: character.id, entityId: 'notebook', quantity: 2, action: 'BUY', reason: 'Bought from a shop.' };
  character = h.run('B', 'manageEquipment', buy, character.version).character;
  assert.equal(character.money, 4400);
  assert.equal(character.equipment[0].quantity, 3);
  assert.throws(() => h.run('B', 'manageEquipment', { ...buy, entityId: 'relic' }, character.version), errorCode('FORBIDDEN'));
  assert.throws(() => h.run('B', 'manageEquipment', { ...buy, action: 'ADD' }, character.version), errorCode('FORBIDDEN'));
  assert.throws(() => h.run('B', 'manageEquipment', { ...buy, entityId: 'coat', quantity: 100 }, character.version), errorCode('VALIDATION'));
  character = h.run('B', 'manageEquipment', { ...buy, quantity: 3, action: 'REMOVE' }, character.version).character;
  assert.equal(character.equipment.length, 0);
  assert.equal(character.money, 4400);
  character = h.run('A', 'manageEquipment', { ...buy, entityId: 'relic', quantity: 1, action: 'ADD' }, character.version).character;
  assert.equal(character.permissionExceptions[0].entityId, 'relic');
  assert.ok(Object.values(h.state().events).some(event => event.kind === 'EQUIPMENT' && event.details.costCents === 400));
});

test('GM corrections require reasons, validate invariants and retain bonus dice over the pool maximum', () => {
  const h = harness();
  let character = h.approve();
  const payload = { campaignId: h.campaign.id, characterId: character.id, reason: 'Apply documented bonus dice.', changes: { normalDice: 8, horrorDice: 1, horrorLimit: 1 } };
  character = h.run('A', 'adjustInvestigator', payload, character.version).character;
  assert.equal(character.normalDice + character.horrorDice, 9);
  assert.equal(character.poolMaximum, 6);
  assert.throws(() => h.run('A', 'adjustInvestigator', { ...payload, reason: '' }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('A', 'adjustInvestigator', { ...payload, changes: { poolLimit: 7 } }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('A', 'adjustInvestigator', { ...payload, changes: { insightCurrent: 2 } }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('A', 'adjustInvestigator', { ...payload, changes: { xpEarned: 1000 } }, character.version), errorCode('VALIDATION'));
  assert.throws(() => h.run('A', 'adjustInvestigator', { ...payload, changes: { injuries: [] } }, character.version), errorCode('VALIDATION'));
  assert.ok(Object.values(h.state().events).some(event => event.kind === 'MANUAL_CORRECTION' && event.details.reason === payload.reason));
});

test('advancement receipts replay once, atomic failures leave XP unchanged and retirement preserves history', () => {
  const h = harness();
  let character = h.approve();
  const purchase = { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'agility', reason: 'Train safely.' };
  const before = h.state();
  h.failCommit();
  assert.throws(() => h.run('B', 'advanceInvestigator', purchase, character.version, 'retry-advance'), /atomic commit failure/);
  assert.deepEqual(h.state(), before);
  const first = h.run('B', 'advanceInvestigator', purchase, character.version, 'retry-advance');
  const again = h.run('B', 'advanceInvestigator', purchase, character.version, 'retry-advance');
  assert.deepEqual(again, first);
  assert.equal(Object.values(h.state().xpLedger).filter(entry => entry.kind === 'SKILL').length, 1);
  character = first.character;
  const ledgerCount = Object.keys(h.state().xpLedger).length;
  character = h.run('B', 'retireInvestigator', { campaignId: h.campaign.id, characterId: character.id, reason: 'Investigator moved away.' }, character.version).character;
  assert.equal(character.status, 'RETIRED');
  assert.equal(character.skills.agility, 4);
  assert.equal(Object.keys(h.state().xpLedger).length, ledgerCount);
  assert.throws(() => h.run('B', 'advanceInvestigator', purchase, character.version), errorCode('CONFLICT'));
});

test('canonical source catalog creates an approved investigator and rejects non-purchasable equipment', () => {
  const h = harness(true);
  const catalog = h.context.Arkham.catalog;
  const archetype = catalog.archetypes[0];
  const skillIds = catalog.skills.map(skill => skill.id);
  const equipment = catalog.equipment.find(item => item.purchasable !== false && item.civilianSale !== false && !item.requiresGMApproval && Number.isInteger(item.priceCents) && item.priceCents > 0 && item.priceCents < 5000);
  const value = {
    background: { narrative: 'A private original investigator history.' }, personalityId: catalog.personalities[0].id,
    archetypeId: archetype.id, skills: { [skillIds[0]]: 5, [skillIds[1]]: 5, [skillIds[2]]: 5, [skillIds[3]]: 4 },
    startingKnackId: archetype.knacks[1][0], package: 'xp', equipment: [{ entityId: equipment.id, quantity: 1 }], advancements: []
  };
  const character = h.approve(value);
  assert.equal(character.rulesVersion, catalog.sourceVersion);
  assert.equal(character.money, 5000 - equipment.priceCents);
  assert.equal(character.skills[skillIds[0]], 5);
  const nonPurchasable = catalog.equipment.find(item => item.purchasable === false);
  const draft = h.save(h.create(), { ...value, equipment: [{ entityId: nonPurchasable.id, quantity: 1 }] });
  assert.ok(draft.buildValidation.errors.some(error => error.includes('not available for purchase')));
  assert.throws(() => h.run('B', 'manageEquipment', { campaignId: h.campaign.id, characterId: character.id, entityId: nonPurchasable.id, quantity: 1, action: 'BUY', reason: 'Not sold' }, character.version), errorCode('VALIDATION'));
});

test('GM XP reversal restores latest award or purchase, preserves immutable receipts and replays once', () => {
  const h = harness();
  let character = h.approve();
  const award = h.run('A', 'awardXP', { campaignId: h.campaign.id, characterId: character.id, amount: 10, reason: 'Mistaken award.' }, character.version);
  character = award.character;
  const payload = { campaignId: h.campaign.id, characterId: character.id, ledgerId: award.ledger.id, reason: 'Correct a duplicate manual award.' };
  const original = h.state().xpLedger[award.ledger.id];
  assert.throws(() => h.run('B', 'reverseXP', payload, character.version), errorCode('FORBIDDEN'));
  const reversed = h.run('A', 'reverseXP', payload, character.version, 'reverse-award');
  assert.equal(reversed.character.xpEarned, 5);
  assert.equal(reversed.ledger.earnedDelta, -10);
  assert.equal(reversed.ledger.reversalOf, award.ledger.id);
  assert.deepEqual(h.state().xpLedger[award.ledger.id], original);
  assert.deepEqual(h.run('A', 'reverseXP', payload, character.version, 'reverse-award'), reversed);
  assert.throws(() => h.run('A', 'reverseXP', payload, reversed.character.version), errorCode('CONFLICT'));
  character = reversed.character;
  const purchase = h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'SKILL', entityId: 'agility', reason: 'Accidental skill improvement.' }, character.version);
  const undo = h.run('A', 'reverseXP', { ...payload, ledgerId: purchase.ledger.id }, purchase.character.version);
  assert.equal(undo.character.skills.agility, 5);
  assert.equal(undo.character.xpSpent, 0);
  assert.equal(undo.ledger.spentDelta, -4);
});

test('XP reversal refuses old state after later purchases or corrections and mismatched character IDs', () => {
  const h = harness();
  let character = h.approve();
  const other = h.approve(h.build(), [], 'C');
  const award = h.run('A', 'awardXP', { campaignId: h.campaign.id, characterId: character.id, amount: 10, reason: 'Later consumed XP.' }, character.version);
  character = h.run('B', 'advanceInvestigator', { campaignId: h.campaign.id, characterId: character.id, kind: 'KNACK', entityId: 'one-b', reason: 'Training after award.' }, award.character.version).character;
  const payload = { campaignId: h.campaign.id, characterId: character.id, ledgerId: award.ledger.id, reason: 'Unsafe old reversal.' };
  assert.throws(() => h.run('A', 'reverseXP', payload, character.version), errorCode('CONFLICT'));
  assert.throws(() => h.run('A', 'reverseXP', { ...payload, characterId: other.id }, other.version), errorCode('FORBIDDEN'));
  const before = h.state();
  const latest = Object.values(before.xpLedger).find(record => record.characterId === character.id && record.kind === 'KNACK');
  h.failCommit();
  assert.throws(() => h.run('A', 'reverseXP', { ...payload, ledgerId: latest.id }, character.version, 'reverse-atomic'), /atomic commit failure/);
  assert.deepEqual(h.state(), before);
  const reversed = h.run('A', 'reverseXP', { ...payload, ledgerId: latest.id }, character.version, 'reverse-atomic');
  assert.deepEqual(reversed.character.knacks, ['one-a']);
  assert.equal(reversed.character.xpSpent, 0);
});

test('reversing Insight restores the prior limit and releases that session purchase allowance', () => {
  const h = harness();
  const character = h.approve();
  const payload = { campaignId: h.campaign.id, characterId: character.id, kind: 'INSIGHT',
    sessionId: h.seedSession(), qualifier: 'background', reason: 'A qualifying background event.' };
  const purchased = h.run('A', 'advanceInvestigator', payload, character.version);
  const undone = h.run('A', 'reverseXP', { campaignId: h.campaign.id, characterId: character.id,
    ledgerId: purchased.ledger.id, reason: 'Correct the purchase before continuing play.' }, purchased.character.version);
  assert.equal(undone.character.insightLimit, 1);
  assert.equal(undone.character.insightCurrent, 1);
  assert.equal(undone.character.xpSpent, 0);
  const corrected = h.run('A', 'advanceInvestigator', payload, undone.character.version);
  assert.equal(corrected.character.insightLimit, 2);
  assert.equal(corrected.character.xpSpent, 1);
});
