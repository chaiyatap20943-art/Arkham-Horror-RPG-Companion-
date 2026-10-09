'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { catalog, playerCatalog, seedCatalogForCampaign } = require('../src/server/catalog.js');

const checksum = '7901c7c8cf0657d6cc2f65104ad6c7b46077cc489f653c6310897d5f2cd86d7a';
const groups = ['skills', 'personalities', 'archetypes', 'knacks', 'equipment', 'injuries', 'traumas', 'ruleEntries'];
function find(group, id) {
  const record = catalog[group].find((entry) => entry.id === id);
  assert.ok(record, `${group}/${id} must exist`);
  return record;
}

test('compiled catalog has complete selected player catalogs and traceable source identity', () => {
  assert.equal(catalog.provenance.sha256, checksum);
  assert.equal(catalog.provenance.pdfIndexBase, 0);
  assert.equal(catalog.skills.length, 10);
  assert.equal(catalog.personalities.length, 11);
  assert.equal(catalog.archetypes.length, 8);
  assert.equal(catalog.knacks.length, 117);
  assert.equal(catalog.equipment.length, 120);
  for (const group of groups) {
    assert.equal(new Set(catalog[group].map((entry) => entry.id)).size, catalog[group].length);
    for (const entry of catalog[group]) {
      assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(entry.verificationStatus, 'VERIFIED');
      assert.equal(entry.statusSource, 'VERIFIED');
      assert.equal(entry.visibility, 'PLAYER');
      assert.equal(entry.source.sha256, checksum);
      assert.equal(entry.sourceVersion, catalog.sourceVersion);
      assert.ok(Number.isInteger(entry.printedPage));
      assert.equal(entry.pdfPageIndex, entry.printedPage);
      assert.equal(entry.source.printedPage, entry.printedPage);
      assert.ok(entry.description.length > 0);
      assert.ok(entry.description.length < 650, 'catalog summaries must stay short');
    }
  }
  assert.equal(catalog.npcs, undefined);
  assert.equal(catalog.ancientOnes, undefined);
});

test('archetype advancement references resolve and shared knacks preserve per-archetype tiers', () => {
  const skillIds = new Set(catalog.skills.map((entry) => entry.id));
  const knackIds = new Set(catalog.knacks.map((entry) => entry.id));
  for (const archetype of catalog.archetypes) {
    assert.equal(Object.values(archetype.skillLimits).filter((value) => value === 3).length, 3);
    assert.equal(Object.values(archetype.skillLimits).filter((value) => value === 2).length, 1);
    for (const skillId of Object.keys(archetype.skillLimits)) assert.ok(skillIds.has(skillId));
    for (const tier of [1, 2, 3, 4]) {
      const ids = archetype.knacks[tier];
      assert.ok(ids.length > 0);
      assert.equal(new Set(ids).size, ids.length);
      for (const id of ids) {
        assert.ok(knackIds.has(id));
        assert.equal(find('knacks', id).availability[archetype.id].tier, tier);
      }
    }
  }
  assert.equal(find('archetypes', 'adventurer').skillLimits.wits, 2);
  assert.equal(find('archetypes', 'mystic').skillLimits.lore, 2);
  assert.equal(find('archetypes', 'rogue').skillLimits.intuition, 2);
  assert.equal(find('knacks', 'scrappy').availability.adventurer.tier, 1);
  assert.equal(find('knacks', 'scrappy').availability.believer.tier, 3);
  for (const knack of catalog.knacks) {
    assert.ok(Object.keys(knack.availability).length > 0);
    for (const id of knack.prerequisites) assert.ok(knackIds.has(id));
  }
  assert.deepEqual(find('knacks', 'very-accurate').prerequisites, ['accurate']);
  assert.deepEqual(find('knacks', 'improved-come-and-get-me').prerequisites, ['come-and-get-me']);
  assert.deepEqual(find('knacks', 'improved-tracker').prerequisites, []);
});

test('creation and advancement costs preserve source distinctions', () => {
  assert.equal(catalog.rules.creation.gearBudgetCents, 5000);
  assert.equal(catalog.rules.creation.packages.gear.additionalMoneyCents, 10000);
  assert.equal(catalog.rules.creation.packages.xp.xp, 5);
  assert.equal(catalog.rules.creation.packages.insight.insightLimit, 2);
  assert.equal(catalog.rules.creation.skillAllocation.normalCount, 3);
  assert.equal(catalog.rules.creation.skillAllocation.goodCount, 1);
  assert.deepEqual(catalog.rules.skillCosts, { 6: 2, 5: 4, 4: 7, 3: 12 });
  assert.deepEqual(catalog.rules.knackCosts, { 1: 3, 2: 6, 3: 10, 4: 15 });
  assert.deepEqual(catalog.rules.knackLimits, { 1: 3, 2: 2, 3: 2, 4: 1 });
  assert.equal(catalog.rules.insight.maxIncreasesPerSession, 1);
  assert.equal(catalog.rules.insight.maxLimit, 10);
  assert.equal(catalog.rules.multiclass.poolMaximumIncrease, 1);
});

test('personality effects preserve timing, costs, and specific trauma exceptions', () => {
  assert.equal(find('personalities', 'ambitious').mechanics.positive.amount, 2);
  assert.equal(find('personalities', 'ambitious').mechanics.positive.requiresSuccessfulCheck, true);
  assert.equal(find('personalities', 'analytical').mechanics.positive.timing, 'BEFORE_TRAUMA');
  assert.equal(find('personalities', 'analytical').mechanics.negative.rollCount, 2);
  assert.equal(find('personalities', 'imaginative').mechanics.positive.bonusDice, 2);
  assert.equal(find('personalities', 'imaginative').mechanics.positive.discardLowest, 2);
  assert.equal(find('personalities', 'optimistic').mechanics.positive.amount, 3);
  assert.equal(find('personalities', 'stubborn').mechanics.positive.minimum, 0);
  assert.equal(find('personalities', 'skeptical').mechanics.positive.poolCost, 0);
});

test('equipment records preserve price precision, variants, magical approval, and unpriced restrictions', () => {
  for (const entry of catalog.equipment) {
    assert.ok(['WEAPON', 'PROTECTIVE', 'USEFUL', 'RELIC', 'TOME'].includes(entry.category));
    if (entry.price === null) assert.equal(entry.priceCents, null);
    else {
      assert.ok(entry.price >= 0);
      assert.equal(entry.priceCents, Math.round(entry.price * 100));
      assert.ok(Number.isSafeInteger(entry.priceCents));
    }
    if (['RELIC', 'TOME'].includes(entry.category)) assert.equal(entry.requiresGMApproval, true);
  }
  assert.equal(find('equipment', 'colt-1903-pocket-hammerless').priceCents, 2050);
  assert.equal(find('equipment', 'candle').priceCents, 10);
  assert.equal(find('equipment', 'gold-pocket-watch').category, 'USEFUL');
  assert.equal(find('equipment', 'the-gold-pocket-watch').category, 'RELIC');
  assert.equal(find('equipment', 'the-gold-pocket-watch').priceCents, null);
  assert.equal(find('equipment', 'unarmed').purchasable, false);
  assert.equal(find('equipment', 'hatchet').mechanics.damage, 3);
  assert.equal(find('equipment', 'hatchet').mechanics.injuryRating, 3);
});

test('injury and trauma tables cover every positive severity exactly once', () => {
  for (const group of ['injuries', 'traumas']) {
    for (let result = 1; result <= 30; result += 1) {
      const matching = catalog[group].filter((entry) => result >= entry.min && (entry.max === null || result <= entry.max));
      assert.equal(matching.length, 1, `${group} result ${result}`);
    }
  }
  assert.equal(find('injuries', 'comatose').mechanics.poolLimit, 0);
  assert.equal(find('injuries', 'dire').healingSuccesses, 3);
  assert.equal(find('traumas', 'shocked').mechanics.emptyPoolFutureTraumaModifier, 1);
  assert.equal(find('traumas', 'mind-undone').mechanics.insightToPrevent, 2);
  assert.equal(find('traumas', 'mind-undone').mechanics.extendsDuration.NEXT_TURN, 'SCENE');
});

test('consumer snapshots cannot corrupt the immutable authoritative catalog', () => {
  assert.ok(Object.isFrozen(catalog));
  assert.ok(Object.isFrozen(catalog.archetypes[0].knacks[1]));
  const snapshot = playerCatalog();
  snapshot.archetypes[0].knacks[1].length = 0;
  snapshot.rules.creation.gearBudgetCents = 0;
  snapshot.skills[0].name = 'Changed';
  assert.ok(catalog.archetypes[0].knacks[1].length > 0);
  assert.equal(catalog.rules.creation.gearBudgetCents, 5000);
  assert.equal(catalog.skills[0].name, 'Agility');
});

test('campaign catalog registration uses stable IDs, private source metadata, and independent reference facts', () => {
  const state = {};
  const at = '2026-10-07T10:00:00.000Z';
  const campaign = { id: 'campaign-a', ownerUserId: 'owner-a' };
  const result = seedCatalogForCampaign(state, campaign, at);
  assert.deepEqual(result, { bookId: 'campaign-a:corebook', booksCreated: 1, entitiesCreated: 297, entitiesPreserved: 0 });
  const book = state.books['campaign-a:corebook'];
  assert.equal(book.campaignId, campaign.id);
  assert.equal(book.ownerUserId, campaign.ownerUserId);
  assert.equal(book.checksum, checksum);
  assert.equal(book.visibility, 'CO_GM');
  assert.equal(book.driveFileId, null);
  assert.equal(book.version, 1);
  for (const record of Object.values(state.entities)) {
    assert.equal(record.id, `${campaign.id}:catalog:${record.entityId}`);
    assert.equal(record.campaignId, campaign.id);
    assert.equal(record.canonicalCatalogId, record.entityId);
    assert.equal(record.bookId, book.id);
    assert.equal(record.verificationStatus, 'VERIFIED');
    assert.equal(record.visibility, 'CAMPAIGN_PLAYERS');
    assert.equal(record.createdAt, at);
    assert.equal(record.version, 1);
    assert.equal(record.source.bookId, book.id);
    assert.equal(record.source.sha256, undefined, 'checksum belongs to the source book, not repeated source metadata');
    assert.ok(record.englishDescription.length > 0);
  }
  const mystic = state.entities['campaign-a:catalog:mystic'];
  assert.equal(mystic.canonicalProperties.skillLimits.lore, 2);
  assert.equal(state.entities['campaign-a:catalog:hatchet'].type, 'WEAPON');
  assert.match(state.entities['campaign-a:catalog:imaginative'].englishDescription, /Positive:/);
  mystic.canonicalProperties.skillLimits.lore = 6;
  assert.equal(find('archetypes', 'mystic').skillLimits.lore, 2, 'persistent reference edits cannot replace the engine catalog');
});

test('registration preserves existing books and custom entities and is idempotent across migrations', () => {
  const customBook = { id: 'campaign-a:corebook', campaignId: 'campaign-a', title: 'Reviewed private source', version: 5, notes: 'Keep this edit' };
  const customAgility = { id: 'campaign-a:catalog:agility', campaignId: 'campaign-a', entityId: 'agility', englishDescription: 'Reviewed glossary', version: 4, visibility: 'CO_GM' };
  const customEntity = { id: 'custom-house-rule', campaignId: 'campaign-a', verificationStatus: 'NEEDS_REVIEW', version: 2 };
  const state = { books: { [customBook.id]: customBook }, entities: { [customAgility.id]: customAgility, [customEntity.id]: customEntity }, audit: { retained: { reason: 'User audit record' } } };
  const first = seedCatalogForCampaign(state, { id: 'campaign-a', ownerUserId: 'owner-a' }, '2026-10-07T10:00:00.000Z');
  assert.equal(first.booksCreated, 0);
  assert.equal(first.entitiesCreated, 296);
  assert.equal(first.entitiesPreserved, 1);
  assert.equal(state.books[customBook.id], customBook);
  assert.equal(state.entities[customAgility.id], customAgility);
  assert.equal(state.entities[customEntity.id], customEntity);
  const snapshot = JSON.stringify(state);
  const again = seedCatalogForCampaign(state, { id: 'campaign-a', ownerUserId: 'owner-a' }, '2026-10-08T10:00:00.000Z');
  assert.equal(again.booksCreated, 0);
  assert.equal(again.entitiesCreated, 0);
  assert.equal(again.entitiesPreserved, 297);
  assert.equal(JSON.stringify(state), snapshot);
  const second = seedCatalogForCampaign(state, { id: 'campaign-b', ownerUserId: 'owner-b' }, '2026-10-08T10:00:00.000Z');
  assert.equal(second.entitiesCreated, 297);
  assert.equal(state.entities['campaign-b:catalog:agility'].campaignId, 'campaign-b');
  assert.equal(state.entities[customAgility.id], customAgility);
  assert.deepEqual(state.audit, { retained: { reason: 'User audit record' } });
});

test('invalid registration input leaves existing state untouched', () => {
  const state = { books: {}, entities: {}, untouched: true };
  const before = JSON.stringify(state);
  assert.throws(() => seedCatalogForCampaign(state, { id: '' }, '2026-10-07T10:00:00.000Z'), TypeError);
  assert.throws(() => seedCatalogForCampaign(state, { id: 'campaign-a' }, ''), TypeError);
  assert.equal(JSON.stringify(state), before);
});
