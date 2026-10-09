/* Investigator creation, approval and advancement use the verified source catalog. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;
Arkham.handlers = Arkham.handlers || {};

(function (A) {
  'use strict';
  var has = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  var backgroundFields = ['placeOfOrigin', 'localVisitor', 'family', 'friends', 'employment',
    'lifestyle', 'firstSupernaturalEncounter', 'notableEnemies', 'narrative'];

  function catalog(ctx) {
    var value = A.catalog;
    if (!value || !value.sourceVersion || !value.rules || !value.rules.creation ||
        !value.rules.skillCosts || !value.rules.knackCosts || !value.rules.knackLimits || !value.rules.insight) {
      ctx.fail('RULE_NOT_VERIFIED', 'The verified creation and advancement catalog is unavailable.');
    }
    return value;
  }

  function verified(record) {
    return !!record && record.verificationStatus === 'VERIFIED' && (!has(record, 'status') || record.status === 'VERIFIED');
  }

  function entity(ctx, kind, id) {
    var list = catalog(ctx)[kind] || [];
    var result = list.filter(function (record) { return record.id === id; })[0];
    if (!verified(result)) ctx.fail('RULE_NOT_VERIFIED', 'This selection does not have a verified catalog source.');
    return result;
  }

  function source(ctx, printedPage, entityId) {
    return {
      title: 'Arkham Horror — The Roleplaying Game Core Rulebook',
      printedPage: printedPage, pdfPageIndex: printedPage,
      sourceVersion: catalog(ctx).sourceVersion, entityId: entityId || null
    };
  }

  function emptyBuild() {
    return { background: {}, personalityId: '', archetypeId: '', skills: {},
      startingKnackId: '', package: '', equipment: [], advancements: [] };
  }

  function buildInput(ctx, value) {
    ctx.fields(value, ['background', 'personalityId', 'archetypeId', 'skills', 'startingKnackId',
      'package', 'equipment', 'advancements'], 'investigator build');
    var result = emptyBuild();
    if (has(value, 'background')) {
      ctx.fields(value.background, backgroundFields, 'background');
      Object.keys(value.background).forEach(function (key) {
        result.background[key] = ctx.text(value.background[key], key, key === 'narrative' ? 10000 : 2000, false);
      });
      if (result.background.localVisitor && ['LOCAL', 'VISITOR'].indexOf(result.background.localVisitor) < 0) {
        ctx.fail('VALIDATION', 'Choose LOCAL or VISITOR for background residence.');
      }
    }
    ['personalityId', 'archetypeId', 'startingKnackId', 'package'].forEach(function (key) {
      if (has(value, key)) result[key] = ctx.text(value[key], key, 128, false);
    });
    if (has(value, 'skills')) {
      ctx.fields(value.skills, (catalog(ctx).skills || []).map(function (skill) { return skill.id; }), 'skills');
      Object.keys(value.skills).forEach(function (skillId) {
        result.skills[skillId] = ctx.integer(value.skills[skillId], 2, 6, 'skill threshold');
      });
    }
    if (has(value, 'equipment')) {
      if (!Array.isArray(value.equipment) || value.equipment.length > 100) ctx.fail('VALIDATION', 'Invalid starting equipment list.');
      result.equipment = value.equipment.map(function (item) {
        ctx.fields(item, ['entityId', 'quantity'], 'starting equipment');
        return { entityId: ctx.text(item.entityId, 'equipment ID', 128, true), quantity: ctx.integer(item.quantity, 1, 100000, 'equipment quantity') };
      });
    }
    if (has(value, 'advancements')) {
      if (!Array.isArray(value.advancements) || value.advancements.length > 10) ctx.fail('VALIDATION', 'Invalid starting XP purchases.');
      result.advancements = value.advancements.map(function (purchase) {
        ctx.fields(purchase, ['kind', 'entityId'], 'starting advancement');
        if (['SKILL', 'KNACK'].indexOf(purchase.kind) < 0) ctx.fail('VALIDATION', 'Starting XP can buy verified skills or knacks.');
        return { kind: purchase.kind, entityId: ctx.text(purchase.entityId, 'advancement selection', 128, true) };
      });
    }
    return result;
  }

  function tierFor(archetype, knackId) {
    for (var tier = 1; tier <= 4; tier += 1) {
      if (((archetype.knacks || {})[tier] || []).indexOf(knackId) >= 0) return tier;
    }
    return null;
  }

  function purchase(ctx, mechanics, archetype, kind, entityId) {
    var rules = catalog(ctx).rules;
    var cost;
    var before;
    var after;
    if (kind === 'SKILL') {
      entity(ctx, 'skills', entityId);
      before = mechanics.skills[entityId];
      if (!Number.isInteger(before) || before <= 2) ctx.fail('VALIDATION', 'This skill cannot be improved further.');
      after = before - 1;
      var minimum = has(archetype.skillLimits || {}, entityId) ? archetype.skillLimits[entityId] : 4;
      if (after < minimum) ctx.fail('VALIDATION', 'This improvement exceeds the archetype skill limit.');
      cost = rules.skillCosts[before];
    } else if (kind === 'KNACK') {
      var selectedKnack = entity(ctx, 'knacks', entityId);
      if (mechanics.knacks.indexOf(entityId) >= 0) ctx.fail('VALIDATION', 'This knack is already owned.');
      if ((selectedKnack.prerequisites || []).some(function (id) { return mechanics.knacks.indexOf(id) < 0; })) {
        ctx.fail('VALIDATION', 'This knack requires its verified prerequisite knack.');
      }
      var tier = tierFor(archetype, entityId);
      if (!tier) ctx.fail('VALIDATION', 'This knack is unavailable to the chosen archetype.');
      var counts = {};
      mechanics.knacks.forEach(function (id) { var ownedTier = tierFor(archetype, id); counts[ownedTier] = (counts[ownedTier] || 0) + 1; });
      if ((counts[tier] || 0) >= rules.knackLimits[tier]) ctx.fail('VALIDATION', 'The knack tier maximum has been reached.');
      for (var preceding = 1; preceding < tier; preceding += 1) {
        if (!counts[preceding]) ctx.fail('VALIDATION', 'A knack from every preceding tier is required.');
      }
      cost = rules.knackCosts[tier];
      before = mechanics.knacks.slice();
      after = before.concat([entityId]);
    } else {
      ctx.fail('VALIDATION', 'Unsupported advancement kind.');
    }
    if (!Number.isInteger(cost) || cost < 1) ctx.fail('RULE_NOT_VERIFIED', 'The advancement cost is unavailable.');
    if (mechanics.xpEarned - mechanics.xpSpent < cost) ctx.fail('VALIDATION', 'Not enough available XP.');
    if (kind === 'SKILL') mechanics.skills[entityId] = after;
    else mechanics.knacks = after;
    mechanics.xpSpent += cost;
    return { cost: cost, before: before, after: after, tier: tier || null };
  }

  function validateBuild(ctx, build) {
    var data = catalog(ctx);
    var rules = data.rules.creation;
    var errors = [];
    var permissions = [];
    var mechanics = { skills: {}, knacks: [], equipment: [], money: 0, xpEarned: 0, xpSpent: 0,
      insightLimit: rules.insightLimit, poolMaximum: rules.poolMaximum, purchases: [] };
    var personality = (data.personalities || []).filter(function (record) { return record.id === build.personalityId; })[0];
    var archetype = (data.archetypes || []).filter(function (record) { return record.id === build.archetypeId; })[0];
    if (!verified(personality)) errors.push('Choose a verified personality.');
    if (!verified(archetype)) errors.push('Choose a verified archetype.');
    var allocation = rules.skillAllocation;
    var normalCount = 0;
    var goodCount = 0;
    (data.skills || []).forEach(function (skill) {
      if (!verified(skill)) { errors.push('The skill catalog contains an unverified selection.'); return; }
      var threshold = has(build.skills, skill.id) ? build.skills[skill.id] : allocation.baseThreshold;
      mechanics.skills[skill.id] = threshold;
      if (threshold === allocation.normalThreshold) normalCount += 1;
      else if (threshold === allocation.goodThreshold) goodCount += 1;
      else if (threshold !== allocation.baseThreshold) errors.push('Starting skill improvements must follow the free allocation. Use starting XP purchases for further improvements.');
    });
    if (normalCount !== allocation.normalCount || goodCount !== allocation.goodCount) {
      errors.push('Choose exactly ' + allocation.normalCount + ' distinct skills at ' + allocation.normalThreshold + '+ and ' + allocation.goodCount + ' different skill at ' + allocation.goodThreshold + '+.');
    }
    var initialKnack = (data.knacks || []).filter(function (record) { return record.id === build.startingKnackId; })[0];
    if (!verified(initialKnack) || !verified(archetype) || tierFor(archetype, build.startingKnackId) !== rules.startingKnackTier) {
      errors.push('Choose a verified Tier ' + rules.startingKnackTier + ' knack from the selected archetype.');
    } else mechanics.knacks.push(build.startingKnackId);
    var chosenPackage = (rules.packages || {})[build.package];
    if (!has(rules.packages || {}, build.package)) errors.push('Choose one starting package: gear, xp, or insight.');
    else {
      mechanics.money = rules.gearBudgetCents + chosenPackage.additionalMoneyCents;
      mechanics.xpEarned = chosenPackage.xp;
      mechanics.insightLimit = chosenPackage.insightLimit;
    }
    var spent = 0;
    var itemIds = {};
    build.equipment.forEach(function (item) {
      var equipment = (data.equipment || []).filter(function (record) { return record.id === item.entityId; })[0];
      if (has(itemIds, item.entityId)) { errors.push('Starting equipment must list each item once with its total quantity.'); return; }
      itemIds[item.entityId] = true;
      if (!verified(equipment)) { errors.push('Choose only verified starting equipment.'); return; }
      if (equipment.purchasable === false) { errors.push('This equipment is not available for purchase.'); return; }
      if (!Number.isInteger(equipment.priceCents) || equipment.priceCents < 0) { errors.push('This equipment has no verified purchase price.'); return; }
      spent += equipment.priceCents * item.quantity;
      mechanics.equipment.push({ entityId: item.entityId, quantity: item.quantity });
      if (equipment.requiresGMApproval || equipment.civilianSale === false || ['RELIC', 'TOME'].indexOf(equipment.category) >= 0) {
        permissions.push({ entityId: equipment.id, name: equipment.name, category: equipment.category, source: source(ctx, equipment.printedPage, equipment.id) });
      }
    });
    if (spent > mechanics.money) errors.push('Starting equipment exceeds the verified gear budget.');
    mechanics.money -= spent;
    if (verified(archetype) && mechanics.knacks.length && chosenPackage) {
      build.advancements.forEach(function (selection) {
        try {
          var purchased = purchase(ctx, mechanics, archetype, selection.kind, selection.entityId);
          mechanics.purchases.push({ kind: selection.kind, entityId: selection.entityId, cost: purchased.cost,
            before: purchased.before, after: purchased.after, source: source(ctx, 67, selection.entityId) });
        } catch (error) {
          if (error.code !== 'VALIDATION' && error.code !== 'RULE_NOT_VERIFIED') throw error;
          errors.push(error.message);
        }
      });
    }
    return {
      errors: errors, permissionItems: permissions,
      summary: { moneyRemaining: mechanics.money, moneySpent: spent, moneyUnit: 'USD_CENTS',
        xpAvailable: mechanics.xpEarned - mechanics.xpSpent, xpSpent: mechanics.xpSpent,
        insightLimit: mechanics.insightLimit, source: source(ctx, 66) },
      mechanics: mechanics
    };
  }

  function validationView(ctx, validation) {
    var result = ctx.clone(validation);
    delete result.mechanics;
    return result;
  }

  function owned(ctx, payload) {
    var character = ctx.record('characters', payload.characterId);
    ctx.own(character);
    return character;
  }

  function ready(ctx, character) {
    if (character.status !== 'APPROVED') ctx.fail('CONFLICT', 'This action requires an approved, active investigator.');
  }

  function session(ctx, sessionId, requiredCompleted) {
    if (!sessionId) {
      if (requiredCompleted) ctx.fail('VALIDATION', 'Choose the qualifying completed session.');
      return null;
    }
    var record = ctx.record('sessions', sessionId);
    if (requiredCompleted && record.status !== 'COMPLETED') ctx.fail('VALIDATION', 'Insight advancement requires a completed session.');
    return record;
  }

  function ledger(ctx, character, details) {
    var id = ctx.id('xp', 'xpLedger');
    var record = {
      id: id, campaignId: ctx.campaign.id, characterId: character.id, userId: character.ownerUserId,
      kind: details.kind, entityId: details.entityId || null, sessionId: details.sessionId || null,
      characterVersion: details.characterVersion || character.version, reversalOf: details.reversalOf || null,
      earnedDelta: details.earnedDelta || 0, spentDelta: details.spentDelta || 0,
      before: details.before, after: details.after, reason: details.reason,
      qualifier: details.qualifier || null, source: details.source || null,
      actorUserId: ctx.user.id, requestId: ctx.request.requestId, createdAt: ctx.at, updatedAt: ctx.at, version: 1
    };
    ctx.state.xpLedger[id] = record;
    return record;
  }

  function event(ctx, character, kind, details) {
    var id = ctx.id('event', 'events');
    ctx.state.events[id] = {
      id: id, campaignId: ctx.campaign.id, characterId: character.id, ownerUserId: character.ownerUserId,
      kind: kind, details: ctx.clone(details), visibility: 'OWNER_ONLY', actor: ctx.user.id,
      requestId: ctx.request.requestId, createdAt: ctx.at, updatedAt: ctx.at, version: 1
    };
  }

  function response(ctx, character) { return { character: A.characterView(ctx, character) }; }

  A.characterView = function (ctx, character) {
    if (character.campaignId !== ctx.campaign.id) return null;
    if (ctx.isGM || character.ownerUserId === ctx.user.id) return ctx.clone(character);
    // Campaign party information excludes background, review notes and build drafts.
    var view = {};
    ['id', 'campaignId', 'ownerUserId', 'name', 'status', 'personalityId', 'archetypeId', 'poolMaximum',
      'poolLimit', 'normalDice', 'horrorDice', 'horrorLimit', 'insightCurrent', 'insightLimit', 'version',
      'createdAt', 'updatedAt'].forEach(function (key) { if (has(character, key)) view[key] = character[key]; });
    ['injuries', 'traumas'].forEach(function (key) {
      view[key] = (character[key] || []).map(function (condition) {
        var summary = {};
        ['id', 'entityId', 'name', 'severity', 'source', 'expiresAt', 'status'].forEach(function (field) {
          if (has(condition, field)) summary[field] = ctx.clone(condition[field]);
        });
        return summary;
      });
    });
    return view;
  };

  A.handlers.createInvestigator = {
    fields: ['campaignId', 'name'], mutation: true,
    run: function (ctx, payload) {
      var id = ctx.id('character', 'characters');
      var character = {
        id: id, campaignId: ctx.campaign.id, ownerUserId: ctx.user.id,
        name: ctx.text(payload.name, 'investigator name', 120, true), status: 'DRAFT',
        build: emptyBuild(), skills: {}, knacks: [], equipment: [], money: 0, moneyUnit: 'USD_CENTS',
        xpEarned: 0, xpSpent: 0, injuries: [], traumas: [], effects: [], mundaneResources: [], supernaturalResources: [],
        createdAt: ctx.at, updatedAt: ctx.at, version: 1
      };
      character.buildValidation = validationView(ctx, validateBuild(ctx, character.build));
      ctx.state.characters[id] = character;
      return response(ctx, character);
    }
  };

  A.handlers.saveInvestigator = {
    fields: ['campaignId', 'characterId', 'name', 'build'], mutation: true, authorize: owned,
    run: function (ctx, payload) {
      var character = owned(ctx, payload);
      ctx.version(character);
      if (['DRAFT', 'REJECTED'].indexOf(character.status) < 0) ctx.fail('CONFLICT', 'Request changes before editing a submitted build. Approved mechanics use advancement or correction actions.');
      if (!has(payload, 'name') && !has(payload, 'build')) ctx.fail('VALIDATION', 'Choose investigator fields to save.');
      if (has(payload, 'name')) character.name = ctx.text(payload.name, 'investigator name', 120, true);
      if (has(payload, 'build')) character.build = buildInput(ctx, payload.build);
      character.buildValidation = validationView(ctx, validateBuild(ctx, character.build));
      character.status = 'DRAFT';
      ctx.touch(character);
      return response(ctx, character);
    }
  };

  A.handlers.submitInvestigator = {
    fields: ['campaignId', 'characterId'], mutation: true, authorize: owned,
    run: function (ctx, payload) {
      var character = owned(ctx, payload);
      ctx.version(character);
      if (character.status !== 'DRAFT') ctx.fail('CONFLICT', 'Only a draft investigator can be submitted.');
      var validation = validateBuild(ctx, character.build);
      if (validation.errors.length) ctx.fail('VALIDATION', validation.errors.join(' '));
      character.buildValidation = validationView(ctx, validation);
      character.status = 'SUBMITTED';
      character.submittedAt = ctx.at;
      character.submittedBuildVersion = character.version;
      ctx.touch(character);
      return response(ctx, character);
    }
  };

  A.handlers.reviewInvestigator = {
    fields: ['campaignId', 'characterId', 'decision', 'notes', 'approvedItemIds'], mutation: true,
    authorize: function (ctx, payload) { ctx.mustGM(); ctx.record('characters', payload.characterId); },
    run: function (ctx, payload) {
      ctx.mustGM();
      var character = ctx.record('characters', payload.characterId);
      ctx.version(character);
      if (character.status !== 'SUBMITTED') ctx.fail('CONFLICT', 'Only a submitted build can be reviewed.');
      if (['APPROVE', 'REJECT'].indexOf(payload.decision) < 0) ctx.fail('VALIDATION', 'Choose APPROVE or REJECT.');
      var notes = has(payload, 'notes') ? ctx.text(payload.notes, 'review notes', 4000, payload.decision === 'REJECT') : '';
      if (payload.decision === 'REJECT' && !notes) ctx.fail('VALIDATION', 'Explain the requested changes.');
      var allowed = payload.approvedItemIds || [];
      if (!Array.isArray(allowed) || allowed.length > 100 || allowed.some(function (id) { return typeof id !== 'string'; })) {
        ctx.fail('VALIDATION', 'Invalid explicit equipment permissions.');
      }
      var validation = validateBuild(ctx, character.build);
      if (payload.decision === 'APPROVE') {
        if (validation.errors.length) ctx.fail('VALIDATION', validation.errors.join(' '));
        var required = validation.permissionItems.map(function (item) { return item.entityId; });
        if (required.some(function (id) { return allowed.indexOf(id) < 0; }) || allowed.some(function (id) { return required.indexOf(id) < 0; })) {
          ctx.fail('VALIDATION', 'Approve each specific relic or tome explicitly.');
        }
        var mechanics = validation.mechanics;
        character.skills = ctx.clone(mechanics.skills);
        character.knacks = mechanics.knacks.slice();
        character.equipment = ctx.clone(mechanics.equipment);
        character.money = mechanics.money;
        character.xpEarned = mechanics.xpEarned;
        character.xpSpent = mechanics.xpSpent;
        character.insightLimit = mechanics.insightLimit;
        character.insightCurrent = mechanics.insightLimit;
        character.poolMaximum = mechanics.poolMaximum;
        character.poolLimit = mechanics.poolMaximum;
        character.normalDice = mechanics.poolMaximum;
        character.horrorDice = 0;
        character.horrorLimit = 0;
        character.personalityId = character.build.personalityId;
        character.archetypeId = character.build.archetypeId;
        character.rulesVersion = catalog(ctx).sourceVersion;
        character.approvedBuildVersion = character.submittedBuildVersion;
        character.approvedBy = ctx.user.id;
        character.approvedAt = ctx.at;
        character.permissionExceptions = required.map(function (id) {
          return { entityId: id, approvedBy: ctx.user.id, approvedAt: ctx.at, notes: notes };
        });
        character.status = 'APPROVED';
        ledger(ctx, character, { kind: 'STARTING_XP', earnedDelta: mechanics.xpEarned,
          characterVersion: character.version + 1,
          before: { xpEarned: 0, xpSpent: 0 }, after: { xpEarned: mechanics.xpEarned, xpSpent: 0 },
          reason: 'Approved verified starting package.', source: source(ctx, 66) });
        var startingSpent = 0;
        mechanics.purchases.forEach(function (purchased) {
          ledger(ctx, character, { kind: 'STARTING_' + purchased.kind, entityId: purchased.entityId,
            characterVersion: character.version + 1,
            spentDelta: purchased.cost, before: { xpEarned: mechanics.xpEarned, xpSpent: startingSpent, value: purchased.before },
            after: { xpEarned: mechanics.xpEarned, xpSpent: startingSpent + purchased.cost, value: purchased.after },
            reason: 'Approved starting XP purchase.', source: purchased.source });
          startingSpent += purchased.cost;
        });
        event(ctx, character, 'STARTING_EQUIPMENT', { equipment: character.equipment, money: character.money, permissionExceptions: character.permissionExceptions, source: source(ctx, 66) });
      } else character.status = 'REJECTED';
      character.reviewNotes = notes;
      character.reviewedBy = ctx.user.id;
      character.reviewedAt = ctx.at;
      character.buildValidation = validationView(ctx, validation);
      ctx.touch(character);
      return response(ctx, character);
    }
  };

  A.handlers.retireInvestigator = {
    fields: ['campaignId', 'characterId', 'reason'], mutation: true, authorize: owned,
    run: function (ctx, payload) {
      var character = owned(ctx, payload);
      ctx.version(character);
      ready(ctx, character);
      var reason = ctx.text(payload.reason, 'retirement reason', 2000, true);
      character.status = 'RETIRED';
      character.retiredAt = ctx.at;
      character.retiredBy = ctx.user.id;
      character.retirementReason = reason;
      ctx.touch(character);
      event(ctx, character, 'RETIREMENT', { reason: reason });
      return response(ctx, character);
    }
  };

  A.handlers.advanceInvestigator = {
    fields: ['campaignId', 'characterId', 'kind', 'entityId', 'sessionId', 'reason', 'qualifier'], mutation: true,
    authorize: function (ctx, payload) { owned(ctx, payload); if (payload.kind === 'INSIGHT') ctx.mustGM(); },
    run: function (ctx, payload) {
      var character = owned(ctx, payload);
      ctx.version(character);
      ready(ctx, character);
      var reason = ctx.text(payload.reason, 'advancement reason', 2000, true);
      var completed = session(ctx, payload.sessionId, payload.kind === 'INSIGHT');
      var xpBefore = { xpEarned: character.xpEarned, xpSpent: character.xpSpent };
      var result;
      if (payload.kind === 'INSIGHT') {
        ctx.mustGM();
        var rules = catalog(ctx).rules.insight;
        var qualifiers = (rules.qualifiers || []).map(function (item) { return typeof item === 'string' ? item : item.id; });
        if (qualifiers.indexOf(payload.qualifier) < 0) ctx.fail('VALIDATION', 'Confirm a verified Insight advancement qualification.');
        var allReceipts = ctx.records('xpLedger');
        var previous = allReceipts.filter(function (record) {
          return record.characterId === character.id && record.kind === 'INSIGHT' && record.sessionId === completed.id &&
            !allReceipts.some(function (reversal) { return reversal.reversalOf === record.id; });
        });
        if (previous.length >= rules.maxIncreasesPerSession) ctx.fail('VALIDATION', 'This investigator already increased Insight for that session.');
        if (character.insightLimit >= rules.maxLimit) ctx.fail('VALIDATION', 'The Insight limit maximum has been reached.');
        if (character.xpEarned - character.xpSpent < rules.cost) ctx.fail('VALIDATION', 'Not enough available XP.');
        result = { cost: rules.cost, before: character.insightLimit, after: character.insightLimit + 1 };
        character.insightLimit += 1;
        character.xpSpent += rules.cost;
        // Increasing the limit does not itself grant current Insight.
      } else {
        var archetype = entity(ctx, 'archetypes', character.archetypeId);
        result = purchase(ctx, character, archetype, payload.kind, payload.entityId);
      }
      ctx.touch(character);
      var receipt = ledger(ctx, character, { kind: payload.kind, entityId: payload.entityId,
        sessionId: completed ? completed.id : null, spentDelta: result.cost,
        before: { xp: xpBefore, value: result.before },
        after: { xpEarned: character.xpEarned, xpSpent: character.xpSpent, value: result.after },
        reason: reason, qualifier: payload.qualifier, source: source(ctx, 67, payload.entityId) });
      event(ctx, character, 'ADVANCEMENT', { ledgerId: receipt.id, kind: payload.kind, sessionId: payload.sessionId || null, qualifier: payload.qualifier || null, reason: reason, source: receipt.source });
      return { character: A.characterView(ctx, character), ledger: ctx.clone(receipt) };
    }
  };

  A.handlers.awardXP = {
    fields: ['campaignId', 'characterId', 'amount', 'reason', 'sessionId'], mutation: true,
    authorize: function (ctx, payload) { ctx.mustGM(); ctx.record('characters', payload.characterId); },
    run: function (ctx, payload) {
      ctx.mustGM();
      var character = ctx.record('characters', payload.characterId);
      ctx.version(character);
      ready(ctx, character);
      var amount = ctx.integer(payload.amount, 1, 1000000, 'XP award');
      var reason = ctx.text(payload.reason, 'XP award reason', 2000, true);
      var referenced = session(ctx, payload.sessionId, false);
      var before = { xpEarned: character.xpEarned, xpSpent: character.xpSpent };
      character.xpEarned += amount;
      ctx.touch(character);
      var receipt = ledger(ctx, character, { kind: 'AWARD', earnedDelta: amount, before: before,
        after: { xpEarned: character.xpEarned, xpSpent: character.xpSpent }, reason: reason,
        sessionId: referenced ? referenced.id : null });
      return { character: A.characterView(ctx, character), ledger: ctx.clone(receipt) };
    }
  };

  A.handlers.reverseXP = {
    fields: ['campaignId', 'characterId', 'ledgerId', 'reason'], mutation: true,
    authorize: function (ctx, payload) {
      ctx.mustGM();
      var character = ctx.record('characters', payload.characterId);
      var original = ctx.record('xpLedger', payload.ledgerId);
      if (original.characterId !== character.id) ctx.fail('FORBIDDEN', 'XP receipt access denied.');
    },
    run: function (ctx, payload) {
      ctx.mustGM();
      var character = ctx.record('characters', payload.characterId);
      ctx.version(character);
      ready(ctx, character);
      var original = ctx.record('xpLedger', payload.ledgerId);
      if (original.characterId !== character.id) ctx.fail('FORBIDDEN', 'XP receipt access denied.');
      var reason = ctx.text(payload.reason, 'XP reversal reason', 2000, true);
      if (['AWARD', 'SKILL', 'KNACK', 'INSIGHT'].indexOf(original.kind) < 0) {
        ctx.fail('VALIDATION', 'Only an award or post-approval advancement can be reversed.');
      }
      if (ctx.records('xpLedger').some(function (record) { return record.reversalOf === original.id; })) {
        ctx.fail('CONFLICT', 'This XP action was already reversed.');
      }
      if (character.version !== original.characterVersion || !original.before || !original.after) {
        ctx.fail('CONFLICT', 'Later investigator changes prevent a safe reversal of this XP action.');
      }
      var beforeXP = original.before.xp || original.before;
      var afterXP = original.after.xp || original.after;
      if (!Number.isInteger(beforeXP.xpEarned) || !Number.isInteger(beforeXP.xpSpent) ||
          beforeXP.xpEarned < beforeXP.xpSpent || beforeXP.xpSpent < 0 ||
          character.xpEarned !== afterXP.xpEarned || character.xpSpent !== afterXP.xpSpent) {
        ctx.fail('CONFLICT', 'The XP receipt does not match a recoverable investigator state.');
      }
      var valueBefore = has(original.before, 'value') ? original.before.value : null;
      var valueAfter = has(original.after, 'value') ? original.after.value : null;
      if (original.kind === 'SKILL') {
        if (character.skills[original.entityId] !== valueAfter || !Number.isInteger(valueBefore)) {
          ctx.fail('CONFLICT', 'The skill changed after this purchase.');
        }
        character.skills[original.entityId] = valueBefore;
      } else if (original.kind === 'KNACK') {
        if (!Array.isArray(valueBefore) || JSON.stringify(character.knacks) !== JSON.stringify(valueAfter)) {
          ctx.fail('CONFLICT', 'Knacks changed after this purchase.');
        }
        character.knacks = ctx.clone(valueBefore);
      } else if (original.kind === 'INSIGHT') {
        if (character.insightLimit !== valueAfter || !Number.isInteger(valueBefore) || character.insightCurrent > valueBefore) {
          ctx.fail('CONFLICT', 'Insight changed after this purchase.');
        }
        character.insightLimit = valueBefore;
      }
      var earnedBefore = character.xpEarned;
      var spentBefore = character.xpSpent;
      character.xpEarned = beforeXP.xpEarned;
      character.xpSpent = beforeXP.xpSpent;
      ctx.touch(character);
      var receipt = ledger(ctx, character, {
        kind: 'REVERSAL', reversalOf: original.id, entityId: original.entityId, sessionId: original.sessionId,
        earnedDelta: character.xpEarned - earnedBefore, spentDelta: character.xpSpent - spentBefore,
        before: { xpEarned: earnedBefore, xpSpent: spentBefore, value: valueAfter },
        after: { xpEarned: character.xpEarned, xpSpent: character.xpSpent, value: valueBefore },
        reason: reason, source: original.source
      });
      event(ctx, character, 'XP_REVERSAL', { ledgerId: receipt.id, reversalOf: original.id, reason: reason });
      return { character: A.characterView(ctx, character), ledger: ctx.clone(receipt) };
    }
  };

  A.handlers.adjustInvestigator = {
    fields: ['campaignId', 'characterId', 'reason', 'changes'], mutation: true,
    authorize: function (ctx, payload) { ctx.mustGM(); ctx.record('characters', payload.characterId); },
    run: function (ctx, payload) {
      ctx.mustGM();
      var character = ctx.record('characters', payload.characterId);
      ctx.version(character);
      ready(ctx, character);
      var reason = ctx.text(payload.reason, 'correction reason', 2000, true);
      var allowed = ['normalDice', 'horrorDice', 'poolLimit', 'horrorLimit', 'insightCurrent', 'money', 'mundaneResources', 'supernaturalResources'];
      ctx.fields(payload.changes, allowed, 'investigator correction');
      if (!Object.keys(payload.changes).length) ctx.fail('VALIDATION', 'Choose fields to correct.');
      var before = {};
      var after = {};
      Object.keys(payload.changes).forEach(function (key) {
        before[key] = ctx.clone(character[key]);
        if (key === 'mundaneResources' || key === 'supernaturalResources') {
          if (!Array.isArray(payload.changes[key]) || payload.changes[key].length > 100) ctx.fail('VALIDATION', 'Invalid resource list.');
          after[key] = payload.changes[key].map(function (value) { return ctx.text(value, 'resource', 500, true); });
        } else {
          var maximum = key === 'poolLimit' || key === 'horrorLimit' ? character.poolMaximum :
            key === 'insightCurrent' ? character.insightLimit : 1000000000;
          after[key] = ctx.integer(payload.changes[key], 0, maximum, key);
        }
      });
      Object.keys(after).forEach(function (key) { character[key] = after[key]; });
      ctx.touch(character);
      event(ctx, character, 'MANUAL_CORRECTION', { before: before, after: after, reason: reason, classification: 'GM_CORRECTION' });
      return response(ctx, character);
    }
  };

  A.handlers.manageEquipment = {
    fields: ['campaignId', 'characterId', 'entityId', 'quantity', 'action', 'reason'], mutation: true,
    authorize: function (ctx, payload) { owned(ctx, payload); if (payload.action === 'ADD') ctx.mustGM(); },
    run: function (ctx, payload) {
      var character = owned(ctx, payload);
      ctx.version(character);
      ready(ctx, character);
      if (['ADD', 'REMOVE', 'BUY'].indexOf(payload.action) < 0) ctx.fail('VALIDATION', 'Choose ADD, REMOVE or BUY equipment.');
      var item = entity(ctx, 'equipment', payload.entityId);
      if (payload.action === 'BUY' && item.purchasable === false) ctx.fail('VALIDATION', 'This equipment is not available for purchase.');
      var quantity = ctx.integer(payload.quantity, 1, 100000, 'equipment quantity');
      var reason = ctx.text(payload.reason, 'equipment reason', 2000, true);
      var before = { equipment: ctx.clone(character.equipment), money: character.money };
      var existing = character.equipment.filter(function (entry) { return entry.entityId === item.id; })[0];
      if (payload.action === 'ADD') ctx.mustGM();
      if (payload.action !== 'REMOVE' && (item.requiresGMApproval || item.civilianSale === false || ['RELIC', 'TOME'].indexOf(item.category) >= 0)) {
        ctx.mustGM();
        character.permissionExceptions = character.permissionExceptions || [];
        character.permissionExceptions.push({ entityId: item.id, approvedBy: ctx.user.id, approvedAt: ctx.at, notes: reason });
      }
      var cost = 0;
      if (payload.action === 'BUY') {
        if (!Number.isInteger(item.priceCents) || item.priceCents < 0) ctx.fail('RULE_NOT_VERIFIED', 'This item does not have a verified purchase price.');
        cost = item.priceCents * quantity;
        if (cost > character.money) ctx.fail('VALIDATION', 'Not enough money for this equipment purchase.');
        character.money -= cost;
      }
      if (payload.action === 'REMOVE') {
        if (!existing || existing.quantity < quantity) ctx.fail('VALIDATION', 'Not enough of this equipment to remove.');
        existing.quantity -= quantity;
        if (!existing.quantity) character.equipment = character.equipment.filter(function (entry) { return entry.entityId !== item.id; });
      } else if (existing) existing.quantity += quantity;
      else character.equipment.push({ entityId: item.id, quantity: quantity });
      ctx.touch(character);
      event(ctx, character, 'EQUIPMENT', { action: payload.action, entityId: item.id, quantity: quantity,
        costCents: cost, before: before, after: { equipment: character.equipment, money: character.money },
        reason: reason, source: source(ctx, item.printedPage, item.id) });
      return response(ctx, character);
    }
  };
})(Arkham);

if (typeof module !== 'undefined' && module.exports) module.exports = Arkham;
