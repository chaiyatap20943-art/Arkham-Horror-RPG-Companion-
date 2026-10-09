'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gmCatalog, seedGMCatalogForCampaign } = require('../src/server/gm-catalog.js');

const checksum = '7901c7c8cf0657d6cc2f65104ad6c7b46077cc489f653c6310897d5f2cd86d7a';
const groups = ['npcs', 'creatures', 'ancientOnes', 'locations'];
const entries = groups.flatMap(group => gmCatalog[group]);
const at = '2026-10-09T10:00:00.000Z';
function profile(id) { return entries.find(record => record.id === id); }

test('GM catalog contains checked source profiles with private visibility and complete provenance', () => {
  assert.equal(gmCatalog.npcs.length, 16);
  assert.equal(gmCatalog.creatures.length, 19);
  assert.equal(gmCatalog.ancientOnes.length, 15);
  assert.ok(gmCatalog.locations.length >= 100);
  assert.equal(new Set(entries.map(record => record.id)).size, entries.length);
  assert.equal(gmCatalog.provenance.sha256, checksum);
  for (const record of entries) {
    assert.match(record.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(record.visibility, 'CO_GM');
    assert.equal(record.verificationStatus, 'VERIFIED');
    assert.equal(record.statusSource, 'VERIFIED');
    assert.equal(record.sourceVersion, gmCatalog.sourceVersion);
    assert.equal(record.source.sha256, checksum);
    assert.ok(Number.isInteger(record.printedPage));
    assert.equal(record.pdfPageIndex, record.printedPage);
    assert.equal(record.source.pdfPageIndex, record.pdfPageIndex);
    assert.equal(record.automation, 'REFERENCE_ONLY');
    assert.ok(record.description.length > 20 && record.description.length < 350);
  }
});

test('reference combat facts preserve visually checked dice pools and unavailable skill dashes', () => {
  for (const record of [...gmCatalog.npcs, ...gmCatalog.creatures]) {
    assert.equal(Object.keys(record.statFacts.skills).length, 10);
    assert.equal(record.statFacts.poolVerification, 'PROFILE_DICE_ICONS_VISUALLY_CHECKED');
    for (const threshold of Object.values(record.statFacts.skills)) {
      assert.ok(threshold === null || (Number.isInteger(threshold) && threshold >= 2 && threshold <= 6));
    }
  }
  assert.equal(profile('arcane-initiate').statFacts.poolMaximum, 5);
  assert.equal(profile('cultist').statFacts.poolMaximum, 3);
  assert.equal(profile('hune-mist').statFacts.npcClass, 'MINOR');
  assert.equal(profile('hune-mist').statFacts.poolMaximum, 7);
  assert.equal(profile('shoggoth').statFacts.poolMaximum, 10);
  assert.equal(profile('star-spawn').statFacts.poolMaximum, 12);
  assert.equal(profile('star-spawn').statFacts.skills.lore, 2);
  assert.equal(profile('trylogog-swarm').statFacts.poolMaximum, 9);
  assert.equal(profile('wild-or-guard-dog').statFacts.skills.knowledge, null);
  assert.equal(profile('hound-of-tindalos').statFacts.skills['ranged-combat'], null);
  assert.equal(profile('zombie').statFacts.skills.presence, null);
  for (const record of gmCatalog.ancientOnes) {
    assert.equal(record.statFacts.combatProfile, 'NOT_PROVIDED');
    assert.equal(record.statFacts.poolMaximum, undefined);
    assert.equal(record.statFacts.skills, undefined);
  }
});

test('setting hierarchy references real location IDs and shared Ancient One profiles keep independent IDs', () => {
  const locationIds = new Set(gmCatalog.locations.map(record => record.id));
  for (const record of gmCatalog.locations) {
    if (record.statFacts.parentLocationId) assert.ok(locationIds.has(record.statFacts.parentLocationId));
  }
  assert.equal(profile('mother-hydra').printedPage, 175);
  assert.equal(profile('father-dagon').printedPage, 175);
  assert.notEqual(profile('mother-hydra').id, profile('father-dagon').id);
  assert.equal(profile('tsocathra').printedPage, 180);
  assert.equal(profile('yig').printedPage, 184);
});

test('profile attacks retain source-specific skill, range, ammunition, and injury distinctions', () => {
  const get = (id, name) => profile(id).statFacts.attackProfiles.find(attack => attack.name === name);
  assert.equal(get('deep-one', 'Teeth and Claws').skillId, 'athletics');
  assert.equal(get('deep-one', 'Harpoon (Thrown)').ammunition, 'SINGLE_SHOT');
  assert.equal(get('deep-one', 'Harpoon (Thrown)').rangeFeet, 30);
  assert.equal(get('cultist', '.32 ACP Pistol').ammunition, 2);
  assert.equal(get('townsperson', 'Unarmed').injuryRating, null);
  assert.equal(get('zombie', 'Rotting Teeth').injuryRating, null);
  assert.equal(get('star-spawn', 'Titanic Talons').damage, 6);
  assert.equal(get('hunting-deep-one', 'Bite/Claw').rangeFeet, 5);
  for (const record of [...gmCatalog.npcs, ...gmCatalog.creatures]) {
    for (const attack of record.statFacts.attackProfiles) {
      assert.ok(Object.keys(record.statFacts.skills).includes(attack.skillId));
      assert.equal(attack.automation, 'REFERENCE_ONLY');
      assert.equal(attack.rangeKind === 'ENGAGED', attack.rangeFeet === null);
    }
  }
});

test('authoritative GM facts are frozen and do not change the player-safe catalog export', () => {
  assert.ok(Object.isFrozen(gmCatalog));
  assert.ok(Object.isFrozen(profile('cultist').statFacts.skills));
  assert.throws(() => { profile('cultist').statFacts.skills.lore = 2; }, TypeError);
  const sandbox = vm.createContext({ JSON, Object, Array, String, TypeError });
  for (const name of ['catalog', 'gm-catalog']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/server', name + '.js'), 'utf8'), sandbox);
  const playerPayload = JSON.stringify(sandbox.Arkham.playerCatalog());
  assert.equal(playerPayload.includes('canonicalCatalogId":"gm:'), false);
  assert.equal(sandbox.Arkham.playerCatalog().npcs, undefined);
  assert.equal(sandbox.Arkham.playerCatalog().creatures, undefined);
  assert.equal(sandbox.Arkham.playerCatalog().ancientOnes, undefined);
  assert.notEqual(sandbox.Arkham.catalog, sandbox.Arkham.gmCatalog);
});

test('campaign registration is idempotent, scoped, private, and preserves prior player source registration', () => {
  const campaign = { id: 'campaign-a', ownerUserId: 'google:gm-a' };
  const book = { id: 'campaign-a:corebook', title: 'Existing registered corebook', checksum, visibility: 'CO_GM' };
  const state = { books: { [book.id]: book }, entities: { 'campaign-a:catalog:agility': { id: 'campaign-a:catalog:agility', visibility: 'CAMPAIGN_PLAYERS' } } };
  const first = seedGMCatalogForCampaign(state, campaign, at);
  assert.equal(first.booksCreated, 0);
  assert.equal(first.entitiesCreated, entries.length);
  assert.equal(state.books[book.id], book);
  const row = state.entities['campaign-a:catalog:gm:cultist'];
  assert.equal(row.canonicalCatalogId, 'gm:cultist');
  assert.equal(row.entityId, 'gm:cultist');
  assert.equal(row.visibility, 'CO_GM');
  assert.equal(row.sourceChecksum, checksum);
  assert.equal(row.ownerUserId, campaign.ownerUserId);
  assert.equal(row.version, 1);
  const snapshot = JSON.stringify(state);
  const repeat = seedGMCatalogForCampaign(state, campaign, '2026-10-10T10:00:00.000Z');
  assert.equal(repeat.entitiesCreated, 0);
  assert.equal(repeat.entitiesPreserved, entries.length);
  assert.equal(JSON.stringify(state), snapshot);
  seedGMCatalogForCampaign(state, { id: 'campaign-b', ownerUserId: 'google:gm-b' }, at);
  assert.equal(state.entities['campaign-b:catalog:gm:cultist'].campaignId, 'campaign-b');
  assert.equal(state.entities['campaign-b:catalog:gm:cultist'].ownerUserId, 'google:gm-b');
  assert.notEqual(state.entities['campaign-b:catalog:gm:cultist'], row);
  row.statFacts.skills.lore = 2;
  assert.equal(profile('cultist').statFacts.skills.lore, 5);
});

test('catalog registration rejects malformed table structures before writing', () => {
  const state = { books: {}, entities: [] };
  assert.throws(() => seedGMCatalogForCampaign(state, { id: 'campaign' }, at), TypeError);
  assert.deepEqual(state, { books: {}, entities: [] });
  assert.throws(() => seedGMCatalogForCampaign({}, { id: '' }, at), TypeError);
});
