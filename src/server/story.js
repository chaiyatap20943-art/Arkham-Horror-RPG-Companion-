/* Campaign-scoped sessions, immutable history, private story content and recovery. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;
(function (A) {
  'use strict';
  A.handlers = A.handlers || {};
  var has = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  var VISIBILITY = ['GM_ONLY', 'CO_GM', 'CAMPAIGN_PLAYERS', 'SELECTED_PLAYERS', 'OWNER_ONLY'];
  var ASSET_KINDS = ['SCENE', 'NPC', 'ENEMY', 'LOCATION', 'CLUE', 'HANDOUT'];
  var BACKUP_TABLES = ['members', 'invites', 'characters', 'sessions', 'attendance', 'snapshots',
    'scenes', 'assets', 'events', 'rolls', 'xpLedger', 'books', 'entities', 'translations',
    'materials', 'aiHistory', 'imports', 'mutations', 'audit'];
  var IMMUTABLE = ['snapshots', 'events', 'rolls', 'xpLedger', 'audit', 'mutations'];
  var UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype', 'sessionToken', 'access_token',
    'refresh_token', 'id_token', 'accessToken', 'refreshToken', 'clientSecret', 'apiKey', 'credentials'];

  function values(ctx, name) { return ctx.records(name); }
  function store(ctx, name, record) {
    if (!ctx.state[name]) ctx.state[name] = {};
    ctx.state[name][record.id] = record;
    return record;
  }
  function newRecord(ctx, table, prefix, data) {
    var record = { id: ctx.id(prefix, table), campaignId: ctx.campaign.id,
      createdAt: ctx.at, updatedAt: ctx.at, version: 1 };
    Object.keys(data).forEach(function (key) { record[key] = data[key]; });
    return store(ctx, table, record);
  }
  function enumValue(ctx, value, allowed, label) {
    if (typeof value !== 'string' || allowed.indexOf(value.toUpperCase()) < 0) ctx.fail('VALIDATION', 'Invalid ' + label + '.');
    return value.toUpperCase();
  }
  function memberFor(ctx, userId, allowInactive) {
    var record = values(ctx, 'members').filter(function (row) {
      return row.campaignId === ctx.campaign.id && row.userId === userId;
    })[0];
    if (!record || (!allowInactive && record.status !== 'ACTIVE') || !has(ctx.state.users, userId)) {
      ctx.fail('FORBIDDEN', 'Campaign member not available.');
    }
    return record;
  }
  function chooseVisibility(ctx, value, fallback, selected, allowOwner) {
    var visibility = enumValue(ctx, value || fallback, allowOwner ? VISIBILITY : VISIBILITY.slice(0, 4), 'visibility');
    if (selected !== undefined && selected !== null && (!Array.isArray(selected) || selected.length > 100)) {
      ctx.fail('VALIDATION', 'Select at most 100 campaign members.');
    }
    var selectedIds = [];
    (selected || []).forEach(function (id) {
      if (typeof id !== 'string' || selectedIds.indexOf(id) >= 0) ctx.fail('VALIDATION', 'Invalid selected player.');
      memberFor(ctx, id, false);
      selectedIds.push(id);
    });
    if (visibility === 'SELECTED_PLAYERS' && !selectedIds.length) ctx.fail('VALIDATION', 'Select at least one player.');
    return { visibility: visibility, selectedUserIds: visibility === 'SELECTED_PLAYERS' ? selectedIds : [] };
  }
  function permitted(ctx, record) {
    if (!record || record.campaignId !== ctx.campaign.id) return false;
    var visibility = record.visibility || 'GM_ONLY';
    if (visibility === 'OWNER_ONLY') return record.ownerUserId === ctx.user.id;
    if (visibility === 'GM_ONLY') return ctx.membership.role === 'GM';
    if (visibility === 'CO_GM') return !!ctx.isGM;
    if (visibility === 'CAMPAIGN_PLAYERS') return true;
    if (visibility === 'SELECTED_PLAYERS') return !!ctx.isGM ||
      (Array.isArray(record.selectedUserIds) && record.selectedUserIds.indexOf(ctx.user.id) >= 0);
    return false;
  }
  function playerSafe(value) {
    if (Array.isArray(value)) return value.map(playerSafe);
    if (!value || typeof value !== 'object') return value;
    var safe = {};
    Object.keys(value).forEach(function (key) {
      if (/^(gmNotes|gmSecret|gmSecrets|gmData|gmDataJSON|gmSummary|privateNotes|secret|secrets|credentials)$/i.test(key)) return;
      safe[key] = playerSafe(value[key]);
    });
    return safe;
  }
  function characterProjection(ctx, record) {
    var result = typeof A.characterView === 'function' ? A.characterView(ctx, record) : ctx.clone(record);
    if (!result) return null;
    if (!ctx.isGM) result = playerSafe(result);
    if (!ctx.isGM && record.ownerUserId !== ctx.user.id) {
      result = playerSafe(result);
      ['background', 'notes', 'reviewNotes', 'approvalNotes', 'submittedBuild', 'build'].forEach(function (key) { delete result[key]; });
    }
    return result;
  }
  A.storyView = function (ctx, record) {
    if (!permitted(ctx, record)) return null;
    if (record.kind === 'EVENT' && record.data) {
      var sourceId = record.data.assetId || record.data.sceneId;
      if (sourceId) {
        var source = ctx.state.assets && ctx.state.assets[sourceId] || ctx.state.scenes && ctx.state.scenes[sourceId];
        if (!source || !permitted(ctx, source)) return null;
      }
    }
    if (record.kind === 'SNAPSHOT_FRAGMENT') return null;
    if (record.kind === 'SNAPSHOT') return A.snapshotView(ctx, record);
    var result = ctx.clone(record);
    if (!ctx.isGM) {
      result = playerSafe(result);
      delete result.selectedUserIds;
      delete result.driveFileId;
      delete result.imageFileId;
    }
    return result;
  };
  A.sessionView = function (ctx, record) {
    if (!record || record.campaignId !== ctx.campaign.id) return null;
    var projected = ctx.clone(record);
    if (!ctx.isGM) {
      projected = playerSafe(projected);
      if (projected.currentSceneId && !permitted(ctx, ctx.state.scenes[projected.currentSceneId])) projected.currentSceneId = null;
      if (projected.sceneStatuses) Object.keys(projected.sceneStatuses).forEach(function (id) {
        if (!permitted(ctx, ctx.state.scenes[id])) delete projected.sceneStatuses[id];
      });
    }
    return projected;
  };
  A.snapshotView = function (ctx, snapshot) {
    if (!snapshot || snapshot.campaignId !== ctx.campaign.id || snapshot.kind !== 'SNAPSHOT') return null;
    var result = A.sessionView(ctx, snapshot);
    var groups = { CHARACTER: 'characters', ATTENDANCE: 'attendance', SCENE: 'scenes', ASSET: 'assets',
      EVENT: 'events', ROLL: 'rolls', XP: 'xpLedger' };
    Object.keys(groups).forEach(function (type) { result[groups[type]] = []; });
    values(ctx, 'snapshots').filter(function (fragment) {
      return fragment.campaignId === ctx.campaign.id && fragment.kind === 'SNAPSHOT_FRAGMENT' && fragment.snapshotId === snapshot.id;
    }).sort(function (left, right) { return left.sequence - right.sequence; }).forEach(function (fragment) {
      var type = fragment.fragmentType;
      if (!has(groups, type)) return;
      var data = fragment.data;
      var projected;
      if (type === 'CHARACTER') projected = characterProjection(ctx, data);
      else if (type === 'ATTENDANCE') projected = ctx.clone(data);
      else if (type === 'XP') projected = ctx.isGM || data.characterId &&
        result.characters.some(function (character) { return character.id === data.characterId && character.ownerUserId === ctx.user.id; })
        ? ctx.clone(data) : null;
      else {
        var current = type === 'SCENE' ? ctx.state.scenes[data.id] : type === 'ASSET' ? ctx.state.assets[data.id] : null;
        projected = (type === 'SCENE' || type === 'ASSET') && (!current || !permitted(ctx, current))
          ? null : A.storyView(ctx, data);
      }
      if (projected) result[groups[type]].push(projected);
    });
    // Counts are calculated after projection so hidden events/assets do not leak through totals.
    result.counts = {};
    Object.keys(groups).forEach(function (type) { result.counts[groups[type]] = result[groups[type]].length; });
    return result;
  };

  function event(ctx, type, sessionId, data, visibility) {
    return newRecord(ctx, 'events', 'event', { kind: 'EVENT', eventType: type,
      sessionId: sessionId || null, actorUserId: ctx.user.id, ownerUserId: ctx.user.id,
      visibility: visibility || 'CAMPAIGN_PLAYERS', text: data.text || '', data: data, at: ctx.at });
  }
  function getSession(ctx, id) { return ctx.record('sessions', id); }
  function writableSession(ctx, id) {
    var record = getSession(ctx, id);
    if (record.status === 'COMPLETED') ctx.fail('CONFLICT', 'Completed sessions are immutable. Add a journal amendment instead.');
    return record;
  }
  function getAsset(ctx, id) {
    if (ctx.state.scenes && has(ctx.state.scenes, id)) return ctx.record('scenes', id);
    return ctx.record('assets', id);
  }
  function date(ctx, value) {
    var normalized = ctx.text(value, 'session date', 40, true);
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(normalized) || !isFinite(Date.parse(normalized))) {
      ctx.fail('VALIDATION', 'Use an ISO session date.');
    }
    if (normalized.length === 10 && new Date(normalized).toISOString().slice(0, 10) !== normalized) ctx.fail('VALIDATION', 'That calendar date does not exist.');
    return normalized;
  }
  function register(name, fields, mutation, authorize, run) {
    A.handlers[name] = { fields: ['campaignId'].concat(fields), mutation: mutation, authorize: authorize, run: run,
      replay: function (ctx, p, previous) {
        var result = ctx.clone(previous);
        if (result.asset) result.asset = A.storyView(ctx, result.asset);
        if (result.session) result.session = A.sessionView(ctx, result.session);
        if (result.event) result.event = A.storyView(ctx, result.event);
        if (result.snapshot) result.snapshot = A.snapshotView(ctx, ctx.record('snapshots', result.snapshot.id));
        return result;
      } };
  }
  function gm(ctx) { ctx.mustGM(); }
  function owner(ctx) { if (!ctx.isOwner) ctx.fail('FORBIDDEN', 'Only the campaign owner can export or restore campaign data.'); }

  register('createSession', ['name', 'description', 'date'], true, gm, function (ctx, p) {
    var number = values(ctx, 'sessions').filter(function (row) { return row.campaignId === ctx.campaign.id; })
      .reduce(function (largest, row) { return Math.max(largest, row.number || 0); }, 0) + 1;
    var record = newRecord(ctx, 'sessions', 'session', { kind: 'SESSION', visibility: 'CAMPAIGN_PLAYERS',
      name: ctx.text(p.name, 'session name', 120, true), description: ctx.text(p.description || '', 'description', 4000, false),
      date: date(ctx, p.date || ctx.at.slice(0, 10)), number: number, status: 'PREPARING', currentSceneId: null,
      sceneStatuses: {}, startedAt: null, endedAt: null, snapshotId: null, summary: '', gmNotes: '' });
    event(ctx, 'SESSION_CREATED', record.id, { name: record.name });
    return { session: A.sessionView(ctx, record) };
  });
  register('updateSession', ['sessionId', 'name', 'description', 'date'], true, gm, function (ctx, p) {
    var record = writableSession(ctx, p.sessionId);
    ctx.version(record);
    if (has(p, 'name')) record.name = ctx.text(p.name, 'session name', 120, true);
    if (has(p, 'description')) record.description = ctx.text(p.description, 'description', 4000, false);
    if (has(p, 'date')) record.date = date(ctx, p.date);
    ctx.touch(record);
    return { session: A.sessionView(ctx, record) };
  });
  register('setAttendance', ['sessionId', 'userId', 'characterId', 'attendance'], true, function (ctx, p) {
    if (!ctx.isGM && p.userId !== ctx.user.id) ctx.fail('FORBIDDEN', 'Only your own attendance can be changed.');
  }, function (ctx, p) {
    var session = writableSession(ctx, p.sessionId);
    var status = enumValue(ctx, p.attendance, ['INVITED', 'PRESENT', 'ABSENT', 'LEFT'], 'attendance');
    if (!ctx.isGM && ['PRESENT', 'LEFT'].indexOf(status) < 0) ctx.fail('FORBIDDEN', 'Players may join or leave their own attendance.');
    memberFor(ctx, p.userId, false);
    var character = null;
    if (p.characterId) {
      character = ctx.record('characters', p.characterId);
      if (character.ownerUserId !== p.userId || character.status !== 'APPROVED') {
        ctx.fail('VALIDATION', 'Attendance requires an approved investigator belonging to that member.');
      }
    }
    if (status === 'PRESENT' && !character) ctx.fail('VALIDATION', 'Choose an approved investigator to join.');
    var previous = values(ctx, 'attendance').filter(function (row) {
      return row.campaignId === ctx.campaign.id && row.sessionId === session.id && row.userId === p.userId;
    })[0];
    if (character && values(ctx, 'attendance').some(function (row) {
      return row.campaignId === ctx.campaign.id && row.sessionId === session.id && row.userId !== p.userId &&
        row.characterId === character.id && row.attendance === 'PRESENT';
    })) ctx.fail('CONFLICT', 'That investigator is already attending for another member.');
    var record;
    if (previous) { ctx.version(previous); record = previous; ctx.touch(record); }
    else record = newRecord(ctx, 'attendance', 'attendance', { kind: 'ATTENDANCE', visibility: 'CAMPAIGN_PLAYERS',
      sessionId: session.id, userId: p.userId, joinedAt: null, leftAt: null });
    record.characterId = character ? character.id : null;
    record.attendance = status;
    if (status === 'PRESENT' && character && ['ACTIVE', 'PAUSED'].indexOf(session.status) >= 0 && character.insightSessionId !== session.id) {
      character.insightCurrent = ctx.integer(character.insightLimit, 0, 10, 'Insight limit');
      character.insightSessionId = session.id;
      var currentScene = session.currentSceneId && ctx.state.scenes[session.currentSceneId];
      if (currentScene && currentScene.sceneType !== 'STRUCTURED') refill(character);
      ctx.touch(character);
    }
    if (status === 'PRESENT' && !record.joinedAt) record.joinedAt = ctx.at;
    if (status === 'LEFT') record.leftAt = ctx.at;
    event(ctx, 'ATTENDANCE', session.id, { userId: p.userId, characterId: record.characterId, attendance: status });
    return { attendance: ctx.clone(record) };
  });

  function snapshot(ctx, session) {
    var manifest = newRecord(ctx, 'snapshots', 'snapshot', { kind: 'SNAPSHOT', visibility: 'CAMPAIGN_PLAYERS',
      sessionId: session.id, name: session.name, number: session.number, date: session.date,
      summary: session.summary, gmNotes: session.gmNotes, endedAt: ctx.at, schemaVersion: 1,
      sourceVersion: A.catalog && A.catalog.sourceVersion || 'corebook-2024', counts: {} });
    var attended = values(ctx, 'attendance').filter(function (row) { return row.campaignId === ctx.campaign.id && row.sessionId === session.id; });
    var present = attended.filter(function (row) { return row.attendance === 'PRESENT' || row.attendance === 'LEFT'; });
    var characterIds = present.map(function (row) { return row.characterId; }).filter(Boolean);
    var sceneIds = Object.keys(session.sceneStatuses || {});
    if (session.currentSceneId && sceneIds.indexOf(session.currentSceneId) < 0) sceneIds.push(session.currentSceneId);
    var sequence = 0;
    function fragments(type, records) {
      manifest.counts[type.toLowerCase()] = records.length;
      records.forEach(function (record) {
        newRecord(ctx, 'snapshots', 'fragment', { kind: 'SNAPSHOT_FRAGMENT', snapshotId: manifest.id,
          fragmentType: type, sequence: ++sequence, data: ctx.clone(record), visibility: 'GM_ONLY' });
      });
    }
    fragments('CHARACTER', characterIds.filter(function (id, index, all) { return all.indexOf(id) === index; })
      .map(function (id) { return ctx.record('characters', id); }));
    fragments('ATTENDANCE', attended);
    fragments('SCENE', sceneIds.map(function (id) { return ctx.record('scenes', id); }));
    fragments('ASSET', values(ctx, 'assets').filter(function (row) {
      return row.campaignId === ctx.campaign.id && ((row.sceneId && sceneIds.indexOf(row.sceneId) >= 0) || row.revealedSessionId === session.id);
    }));
    fragments('EVENT', values(ctx, 'events').filter(function (row) { return row.campaignId === ctx.campaign.id && row.sessionId === session.id; }));
    fragments('ROLL', values(ctx, 'rolls').filter(function (row) { return row.campaignId === ctx.campaign.id && row.sessionId === session.id; }));
    fragments('XP', values(ctx, 'xpLedger').filter(function (row) { return row.campaignId === ctx.campaign.id && row.sessionId === session.id; }));
    return manifest;
  }
  function expireRuleEffects(ctx, sessionId, sceneId, reason, touched) {
    touched = touched || {};
    values(ctx, 'characters').forEach(function (character) {
      var changed = false;
      (character.effects || []).forEach(function (effect) {
        if (effect.type !== 'GM_RULE_EFFECT' || effect.sessionId !== sessionId || effect.resolvedAt || effect.expiredAt) return;
        if (sceneId !== null && (!effect.parameters || effect.parameters.duration !== 'SCENE' || effect.sceneId !== sceneId)) return;
        effect.expiredAt = ctx.at; effect.expiryReason = reason; changed = true;
      });
      if (changed && !touched[character.id]) { ctx.touch(character); touched[character.id] = true; }
    });
    return touched;
  }
  register('sessionAction', ['sessionId', 'action', 'summary', 'gmNotes', 'xpAwards'], true, gm, function (ctx, p) {
    var session = writableSession(ctx, p.sessionId);
    ctx.version(session);
    var action = enumValue(ctx, p.action, ['START', 'PAUSE', 'RESUME', 'END'], 'session action');
    if (p.xpAwards !== undefined && (!Array.isArray(p.xpAwards) || p.xpAwards.length > 100)) ctx.fail('VALIDATION', 'Invalid XP awards.');
    var transition = { START: ['PREPARING', 'ACTIVE'], PAUSE: ['ACTIVE', 'PAUSED'], RESUME: ['PAUSED', 'ACTIVE'] };
    if (action !== 'END') {
      if (has(p, 'xpAwards') && p.xpAwards.length) ctx.fail('VALIDATION', 'Award XP only when ending a session.');
      if (session.status !== transition[action][0]) ctx.fail('CONFLICT', 'That session transition is not available.');
      if (action === 'START' && values(ctx, 'sessions').some(function (row) {
        return row.campaignId === ctx.campaign.id && row.id !== session.id && ['ACTIVE', 'PAUSED'].indexOf(row.status) >= 0;
      })) ctx.fail('CONFLICT', 'Another session is already active or paused.');
      if (action === 'START') {
        values(ctx, 'attendance').filter(function (row) {
          return row.campaignId === ctx.campaign.id && row.sessionId === session.id && row.attendance === 'PRESENT';
        }).forEach(function (row) {
          memberFor(ctx, row.userId, false);
          var character = ctx.record('characters', row.characterId);
          if (character.status !== 'APPROVED' || character.ownerUserId !== row.userId) ctx.fail('VALIDATION', 'An attendee needs an approved investigator.');
          character.insightCurrent = ctx.integer(character.insightLimit, 0, 10, 'Insight limit');
          character.insightSessionId = session.id;
          ctx.touch(character);
        });
        session.startedAt = ctx.at;
      }
      session.status = transition[action][1];
      ctx.touch(session);
      event(ctx, 'SESSION_' + action, session.id, { action: action,
        source: action === 'START' ? { rule: 'insight-session-refill', printedPage: 38, pdfPageIndex: 38 } : null });
      return { session: A.sessionView(ctx, session) };
    }
    if (['ACTIVE', 'PAUSED'].indexOf(session.status) < 0) ctx.fail('CONFLICT', 'Start a session before completing it.');
    session.summary = ctx.text(p.summary || '', 'summary', 10000, false);
    session.gmNotes = ctx.text(p.gmNotes || '', 'GM notes', 10000, false);
    var attendingCharacters = values(ctx, 'attendance').filter(function (row) {
      return row.sessionId === session.id && ['PRESENT', 'LEFT'].indexOf(row.attendance) >= 0 && row.characterId;
    }).map(function (row) { return ctx.record('characters', row.characterId); });
    attendingCharacters.forEach(function (character) {
      if ((character.effects || []).some(function (effect) {
        return effect.sessionId === session.id && !effect.resolvedAt && !effect.expiredAt &&
          ['PENDING_TRAUMA', 'STRAIN', 'PENDING_STRAIN', 'STRAIN_INJURY_DUE'].indexOf(effect.type) >= 0;
      })) ctx.fail('CONFLICT', 'Resolve pending trauma or strain consequences before ending the session.');
    });
    var awarded = [];
    var touchedCharacters = {};
    (p.xpAwards || []).forEach(function (award) {
      ctx.fields(award, ['characterId', 'amount', 'reason'], 'XP award');
      var character = ctx.record('characters', award.characterId);
      var amount = ctx.integer(award.amount, 0, 10000, 'XP award');
      if (awarded.indexOf(character.id) >= 0 || character.status !== 'APPROVED' || !values(ctx, 'attendance').some(function (row) {
        return row.campaignId === ctx.campaign.id && row.sessionId === session.id && row.characterId === character.id &&
          ['PRESENT', 'LEFT'].indexOf(row.attendance) >= 0;
      })) ctx.fail('VALIDATION', 'Award XP once per approved attending investigator.');
      awarded.push(character.id);
      var before = ctx.integer(character.xpEarned || 0, 0, 100000000, 'earned XP');
      character.xpEarned = ctx.integer(before + amount, 0, 100000000, 'earned XP');
      ctx.touch(character);
      touchedCharacters[character.id] = true;
      newRecord(ctx, 'xpLedger', 'xp', { kind: 'AWARD', characterId: character.id, sessionId: session.id,
        amount: amount, reason: ctx.text(award.reason || 'Session completion', 'award reason', 1000, true),
        actorUserId: ctx.user.id, xpEarnedBefore: before, xpEarnedAfter: character.xpEarned,
        characterVersion: character.version, earnedDelta: amount, spentDelta: 0,
        before: { xpEarned: before, xpSpent: character.xpSpent || 0 },
        after: { xpEarned: character.xpEarned, xpSpent: character.xpSpent || 0 },
        visibility: 'OWNER_ONLY', ownerUserId: character.ownerUserId });
    });
    attendingCharacters.forEach(function (character) {
      var changed = false;
      (character.traumas || []).forEach(function (trauma) {
        if (trauma.sessionId === session.id && trauma.duration === 'SESSION' && !trauma.expiredAt) {
          trauma.expiredAt = ctx.at; changed = true;
        }
      });
      (character.effects || []).forEach(function (effect) {
        if (effect.sessionId === session.id && effect.type === 'PERSONALITY_NEGATIVE' && !effect.resolvedAt) {
          effect.resolvedAt = ctx.at; changed = true;
        }
      });
      if (changed && !touchedCharacters[character.id]) { ctx.touch(character); touchedCharacters[character.id] = true; }
    });
    expireRuleEffects(ctx, session.id, null, 'SESSION_ENDED', touchedCharacters);
    session.status = 'COMPLETED'; session.endedAt = ctx.at; ctx.touch(session);
    event(ctx, 'SESSION_END', session.id, { action: 'END', text: session.summary });
    var saved = snapshot(ctx, session);
    session.snapshotId = saved.id;
    ctx.campaign.lastPlayedAt = ctx.at; ctx.touch(ctx.campaign);
    return { session: A.sessionView(ctx, session), snapshot: A.snapshotView(ctx, saved) };
  });
  A.handlers.sessionAction.receipt = function (ctx, result) {
    return result.snapshot ? { sessionId: result.session.id, snapshotId: result.snapshot.id } : result;
  };
  var defaultSessionReplay = A.handlers.sessionAction.replay;
  A.handlers.sessionAction.replay = function (ctx, p, stored) {
    if (!stored.snapshotId) return defaultSessionReplay(ctx, p, stored);
    return { session: A.sessionView(ctx, getSession(ctx, stored.sessionId)), snapshot: A.snapshotView(ctx, ctx.record('snapshots', stored.snapshotId)) };
  };

  function assetFields(ctx, p, previous) {
    var kind = enumValue(ctx, p.kind || previous && previous.kind, ASSET_KINDS, 'story kind');
    if (previous && kind !== previous.kind) ctx.fail('VALIDATION', 'A story object cannot change its kind.');
    var data = { kind: kind };
    if (kind === 'SCENE' && (has(p, 'sceneType') || !previous)) data.sceneType = enumValue(ctx, p.sceneType || 'NARRATIVE', ['NARRATIVE', 'STRUCTURED'], 'scene type');
    else if (has(p, 'sceneType')) ctx.fail('VALIDATION', 'Scene type is supported for scenes only.');
    ['name', 'description', 'gmNotes', 'translation'].forEach(function (key) {
      if (has(p, key) || !previous) data[key] = ctx.text(p[key] || '', key, key === 'name' ? 200 : 10000, key === 'name');
    });
    var visibility = chooseVisibility(ctx, p.visibility || previous && previous.visibility, ctx.membership.role === 'GM' ? 'GM_ONLY' : 'CO_GM',
      has(p, 'selectedUserIds') ? p.selectedUserIds : previous && previous.selectedUserIds, false);
    if (visibility.visibility === 'GM_ONLY' && ctx.membership.role !== 'GM') ctx.fail('FORBIDDEN', 'GM-only content is reserved for a GM.');
    data.visibility = visibility.visibility; data.selectedUserIds = visibility.selectedUserIds;
    if (has(p, 'sceneId') || !previous) {
      if (kind === 'SCENE' && p.sceneId) ctx.fail('VALIDATION', 'A scene cannot be nested in another scene.');
      data.sceneId = p.sceneId ? ctx.record('scenes', p.sceneId).id : null;
    }
    if (has(p, 'materialId')) {
      if (['HANDOUT', 'CLUE'].indexOf(kind) < 0) ctx.fail('VALIDATION', 'Attach images to handouts or clues.');
      if (p.materialId) {
        var material = ctx.record('materials', p.materialId);
        var canAccess = typeof A.libraryCanView === 'function' ? A.libraryCanView(ctx, material) : ctx.canView(material);
        if (!canAccess) ctx.fail('FORBIDDEN', 'Material access denied.');
        data.materialId = material.id;
      } else data.materialId = null;
    }
    if (kind === 'SCENE' && (has(p, 'status') || !previous)) data.status = enumValue(ctx, p.status || 'NOT_STARTED',
      ['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'SKIPPED'], 'scene status');
    else if (has(p, 'status')) ctx.fail('VALIDATION', 'Status is supported for scenes only.');
    return data;
  }
  var assetPayload = ['kind', 'name', 'description', 'gmNotes', 'visibility', 'selectedUserIds', 'sceneId', 'translation', 'status', 'sceneType', 'materialId'];
  function assetManager(ctx, p) {
    ctx.mustGM();
    if (!permitted(ctx, getAsset(ctx, p.assetId))) ctx.fail('FORBIDDEN', 'Story object access denied.');
  }
  register('createStoryAsset', assetPayload, true, gm, function (ctx, p) {
    var data = assetFields(ctx, p, null);
    var record = newRecord(ctx, data.kind === 'SCENE' ? 'scenes' : 'assets', data.kind.toLowerCase(), data);
    return { asset: A.storyView(ctx, record) };
  });
  register('updateStoryAsset', ['assetId'].concat(assetPayload), true, assetManager, function (ctx, p) {
    var record = getAsset(ctx, p.assetId); ctx.version(record);
    var data = assetFields(ctx, p, record);
    Object.keys(data).forEach(function (key) { record[key] = data[key]; });
    ctx.touch(record);
    return { asset: A.storyView(ctx, record) };
  });
  register('revealStoryAsset', ['assetId', 'visibility', 'selectedUserIds'], true, assetManager, function (ctx, p) {
    var record = getAsset(ctx, p.assetId); ctx.version(record);
    var access = chooseVisibility(ctx, p.visibility, 'CAMPAIGN_PLAYERS', p.selectedUserIds, false);
    record.visibility = access.visibility; record.selectedUserIds = access.selectedUserIds;
    record.revealedAt = ctx.at; record.revealedBy = ctx.user.id;
    var session = values(ctx, 'sessions').filter(function (row) {
      return row.campaignId === ctx.campaign.id && ['ACTIVE', 'PAUSED'].indexOf(row.status) >= 0;
    })[0];
    record.revealedSessionId = session ? session.id : null;
    ctx.touch(record);
    var journal = event(ctx, 'REVEAL', session && session.id, { assetId: record.id, kind: record.kind, name: record.name }, record.visibility);
    // The event inherits selected access so history cannot reveal a selected-only clue's name.
    journal.selectedUserIds = ctx.clone(record.selectedUserIds);
    return { asset: A.storyView(ctx, record) };
  });
  register('setScene', ['sessionId', 'sceneId', 'status'], true, gm, function (ctx, p) {
    var session = writableSession(ctx, p.sessionId); ctx.version(session);
    if (['ACTIVE', 'PAUSED'].indexOf(session.status) < 0) ctx.fail('VALIDATION', 'Start the session before changing its live scene.');
    var scene = ctx.record('scenes', p.sceneId);
    if (!permitted(ctx, scene)) ctx.fail('FORBIDDEN', 'Scene access denied.');
    var status = enumValue(ctx, p.status || 'ACTIVE', ['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'SKIPPED'], 'scene status');
    var touchedCharacters = {};
    if (session.currentSceneId && (session.currentSceneId !== scene.id || status !== 'ACTIVE')) {
      expireRuleEffects(ctx, session.id, session.currentSceneId, 'SCENE_ENDED', touchedCharacters);
    }
    var enteringNarrative = status === 'ACTIVE' && scene.sceneType !== 'STRUCTURED' &&
      (session.currentSceneId !== scene.id || !session.sceneStatuses || session.sceneStatuses[scene.id] !== 'ACTIVE');
    if (enteringNarrative) values(ctx, 'attendance').filter(function (row) {
      return row.sessionId === session.id && row.attendance === 'PRESENT' && row.characterId;
    }).forEach(function (row) {
      var character = ctx.record('characters', row.characterId);
      memberFor(ctx, row.userId, false);
      if (character.status !== 'APPROVED' || character.ownerUserId !== row.userId) ctx.fail('VALIDATION', 'A scene attendee requires an approved investigator.');
      var before = character.normalDice + character.horrorDice;
      refill(character);
      if (before !== character.normalDice + character.horrorDice && !touchedCharacters[character.id]) {
        ctx.touch(character); touchedCharacters[character.id] = true;
      }
    });
    session.currentSceneId = scene.id; session.sceneStatuses = session.sceneStatuses || {}; session.sceneStatuses[scene.id] = status;
    ctx.touch(session);
    var journal = event(ctx, 'SCENE', session.id, { sceneId: scene.id, name: scene.name, status: status }, scene.visibility);
    journal.selectedUserIds = ctx.clone(scene.selectedUserIds || []);
    return { session: A.sessionView(ctx, session) };
  });
  function refill(character) {
    if (typeof A.refillPool === 'function') { A.refillPool(character); return; }
    var missing = Math.max(0, character.poolLimit - character.normalDice - character.horrorDice);
    var horror = Math.min(missing, Math.max(0, Math.min(character.horrorLimit, character.poolLimit) - character.horrorDice));
    character.horrorDice += horror; character.normalDice += missing - horror;
  }
  register('addJournalEvent', ['sessionId', 'text', 'visibility'], true, function (ctx, p) {
    if (!ctx.isGM && p.visibility && ['OWNER_ONLY', 'CAMPAIGN_PLAYERS'].indexOf(p.visibility) < 0) {
      ctx.fail('FORBIDDEN', 'Players may write private or campaign journal entries.');
    }
  }, function (ctx, p) {
    var session = p.sessionId ? getSession(ctx, p.sessionId) : null;
    var visibility = enumValue(ctx, p.visibility || (ctx.isGM ? 'CO_GM' : 'OWNER_ONLY'), VISIBILITY, 'visibility');
    if (visibility === 'SELECTED_PLAYERS') ctx.fail('VALIDATION', 'Use a story asset for selected-player notes.');
    var record = event(ctx, session && session.status === 'COMPLETED' ? 'AMENDMENT' : 'JOURNAL', session && session.id, {}, visibility);
    record.text = ctx.text(p.text, 'journal text', 10000, true); record.data = { text: record.text };
    return { event: A.storyView(ctx, record) };
  });
  register('getHistory', ['offset', 'limit'], false, function () {}, function (ctx, p) {
    var offset = ctx.integer(p.offset === undefined ? 0 : p.offset, 0, 1000000, 'offset');
    var limit = ctx.integer(p.limit === undefined ? 25 : p.limit, 1, 100, 'limit');
    var events = values(ctx, 'events').filter(function (row) { return row.campaignId === ctx.campaign.id; })
      .map(function (row) { return A.storyView(ctx, row); }).filter(Boolean)
      .sort(function (left, right) { return (right.at || right.createdAt).localeCompare(left.at || left.createdAt); });
    var sessions = values(ctx, 'sessions').filter(function (row) { return row.campaignId === ctx.campaign.id; })
      .sort(function (left, right) { return right.number - left.number; }).map(function (row) { return A.sessionView(ctx, row); });
    var snapshots = values(ctx, 'snapshots').filter(function (row) { return row.campaignId === ctx.campaign.id && row.kind === 'SNAPSHOT'; })
      .sort(function (left, right) { return right.number - left.number; }).slice(offset, offset + limit)
      .map(function (row) { return A.snapshotView(ctx, row); });
    return { events: events.slice(offset, offset + limit), sessions: sessions.slice(offset, offset + limit),
      snapshots: snapshots, total: events.length, offset: offset, limit: limit };
  });

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonical(value[key]);
    }).join(',') + '}';
    return JSON.stringify(value);
  }
  function unsafeTree(ctx, value, depth) {
    if (depth > 30) ctx.fail('VALIDATION', 'Backup nesting is too deep.');
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(function (key) {
      if (UNSAFE_KEYS.indexOf(key) >= 0) ctx.fail('VALIDATION', 'Backups cannot contain credentials or unsafe keys.');
      unsafeTree(ctx, value[key], depth + 1);
    });
  }
  function digestBackup(ctx, backup) {
    var copy = ctx.clone(backup); delete copy.checksum;
    return ctx.dependencies.digest(canonical(copy));
  }
  function canonicalSeed(ctx) {
    var seed = { books: {}, entities: {} };
    if (typeof A.seedCatalogForCampaign === 'function') A.seedCatalogForCampaign(seed, ctx.campaign, ctx.at);
    return seed;
  }
  function sourceIdentity(record) {
    var identity = {};
    ['id', 'campaignId', 'bookId', 'type', 'name', 'title', 'edition', 'checksum', 'sourceVersion',
      'englishText', 'englishDescription', 'description', 'summary', 'source', 'sourceChecksum',
      'printedPage', 'pdfPageIndex', 'sourcePages', 'canonicalCatalogId', 'canonicalProperties',
      'extractionStatus', 'driveFileId'].forEach(function (key) {
      if (has(record, key)) identity[key] = record[key];
    });
    return canonical(identity);
  }
  function restoredSource(ctx, name, source, seed, backupBooks) {
    var record = ctx.clone(source);
    var compiled = seed[name] && seed[name][record.id];
    var known = ctx.state[name] && ctx.state[name][record.id];
    var isCanonical = name === 'entities' && !!record.canonicalCatalogId ||
      name === 'books' && record.importStatus === 'CANONICAL_CATALOG';
    if (compiled && sourceIdentity(record) === sourceIdentity(compiled)) {
      // A compiled reference is reconstructed from reviewed server facts, never promoted by JSON.
      var rebuilt = ctx.clone(compiled);
      rebuilt.createdAt = known && known.createdAt || record.createdAt || ctx.at;
      rebuilt.version = record.version || 1;
      return rebuilt;
    }
    var knownVerified = known && known.campaignId === ctx.campaign.id && known.verificationStatus === 'VERIFIED' &&
      known.version === record.version && sourceIdentity(known) === sourceIdentity(record);
    if (knownVerified && record.bookId) {
      var currentBook = ctx.state.books[record.bookId];
      var restoredBook = backupBooks[record.bookId];
      knownVerified = !!currentBook && !!restoredBook && sourceIdentity(currentBook) === sourceIdentity(restoredBook);
    }
    if (knownVerified) ['reviewedBy', 'reviewedAt', 'reviewNotes'].forEach(function (key) {
      if (has(known, key)) record[key] = ctx.clone(known[key]);
      else delete record[key];
    });
    if (isCanonical || !knownVerified && (record.verificationStatus === 'VERIFIED' || record.statusSource === 'VERIFIED' || record.status === 'VERIFIED')) {
      record.verificationStatus = 'NEEDS_REVIEW';
      if (has(record, 'statusSource')) record.statusSource = 'NEEDS_REVIEW';
      if (record.status === 'VERIFIED') record.status = 'NEEDS_REVIEW';
      record.restoreReviewStatus = 'REVIEW_REQUIRED_AFTER_RESTORE';
      delete record.reviewedBy; delete record.reviewedAt;
      if (name === 'entities') {
        delete record.canonicalCatalogId; delete record.canonicalProperties;
        if (record.extractionStatus === 'COMPILED_REFERENCE_FACTS') record.extractionStatus = 'RESTORED_UNVERIFIED';
      }
      if (name === 'books' && record.importStatus === 'CANONICAL_CATALOG') record.importStatus = 'RESTORED_UNVERIFIED';
    }
    return record;
  }
  register('exportCampaign', [], false, owner, function (ctx) {
    var backup = { format: 'arkham-campaign-backup', schemaVersion: 1, campaignId: ctx.campaign.id,
      exportedAt: ctx.at, campaign: ctx.clone(ctx.campaign), tables: {} };
    var userIds = [ctx.campaign.ownerUserId];
    BACKUP_TABLES.forEach(function (name) {
      backup.tables[name] = values(ctx, name).filter(function (row) { return row.campaignId === ctx.campaign.id; }).map(function (row) {
        ['userId', 'ownerUserId', 'actorUserId', 'actor', 'invitedBy', 'acceptedBy', 'approvedBy'].forEach(function (key) {
          if (typeof row[key] === 'string' && has(ctx.state.users, row[key]) && userIds.indexOf(row[key]) < 0) userIds.push(row[key]);
        });
        return ctx.clone(row);
      });
    });
    backup.tables.users = userIds.map(function (id) {
      var user = ctx.state.users[id];
      return { id: user.id, googleSubjectId: user.googleSubjectId, displayName: user.displayName,
        email: user.email, preferredLanguage: user.preferredLanguage, createdAt: user.createdAt };
    });
    unsafeTree(ctx, backup, 0);
    backup.checksum = digestBackup(ctx, backup);
    return { backup: backup };
  });

  function validateBackup(ctx, backup) {
    unsafeTree(ctx, backup, 0);
    ctx.text(backup.campaign && backup.campaign.name, 'campaign name', 120, true);
    if (!backup.campaign || ['en', 'th'].indexOf(backup.campaign.defaultLanguage) < 0 ||
        !Number.isInteger(backup.campaign.version) || backup.campaign.version < 1) ctx.fail('VALIDATION', 'Invalid backed-up campaign schema.');
    ctx.fields(backup, ['format', 'schemaVersion', 'campaignId', 'exportedAt', 'campaign', 'tables', 'checksum'], 'backup');
    if (backup.format !== 'arkham-campaign-backup' || backup.schemaVersion !== 1 || backup.campaignId !== ctx.campaign.id ||
        !backup.campaign || backup.campaign.id !== ctx.campaign.id || backup.campaign.ownerUserId !== ctx.campaign.ownerUserId ||
        typeof backup.checksum !== 'string' || backup.checksum !== digestBackup(ctx, backup)) {
      ctx.fail('VALIDATION', 'Backup identity, schema, owner or checksum does not match this campaign.');
    }
    ctx.fields(backup.tables, BACKUP_TABLES.concat(['users']), 'backup tables');
    var indexed = {};
    BACKUP_TABLES.concat(['users']).forEach(function (name) {
      if (!Array.isArray(backup.tables[name]) || backup.tables[name].length > 10000) ctx.fail('VALIDATION', 'Invalid backup table.');
      indexed[name] = Object.create(null);
      backup.tables[name].forEach(function (record) {
        if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' ||
            !/^[A-Za-z0-9:._-]{1,512}$/.test(record.id) || UNSAFE_KEYS.indexOf(record.id) >= 0 || has(indexed[name], record.id) ||
            name !== 'users' && record.campaignId !== ctx.campaign.id ||
            JSON.stringify(record).length > 39000 || (record.version !== undefined && (!Number.isInteger(record.version) || record.version < 1))) {
          ctx.fail('VALIDATION', 'Invalid, duplicated or cross-campaign backup record.');
        }
        if (name !== 'users' && ctx.state[name] && Object.keys(ctx.state[name]).some(function (key) {
          return ctx.state[name][key].id === record.id && ctx.state[name][key].campaignId !== ctx.campaign.id;
        })) {
          ctx.fail('FORBIDDEN', 'A backup ID belongs to another campaign.');
        }
        indexed[name][record.id] = record;
        if (IMMUTABLE.indexOf(name) >= 0 && ctx.state[name] && has(ctx.state[name], record.id) &&
            canonical(ctx.state[name][record.id]) !== canonical(record)) {
          ctx.fail('VALIDATION', 'A restore cannot rewrite an existing immutable history record.');
        }
      });
    });
    function reference(table, id, optional) {
      if (optional && (id === null || id === undefined || id === '')) return;
      if (typeof id !== 'string' || !has(indexed[table], id)) ctx.fail('VALIDATION', 'Backup foreign key is missing.');
    }
    function user(id, optional) { reference('users', id, optional); }
    function sourceReference(id, optional) {
      if (optional && (id === null || id === undefined || id === '')) return;
      if (typeof id !== 'string') ctx.fail('VALIDATION', 'Invalid backed-up source reference.');
      if (['entities', 'materials', 'assets', 'scenes'].some(function (name) { return has(indexed[name], id); })) return;
      if (id.indexOf('catalog:') === 0 && A.catalog && ['ruleEntries', 'skills', 'personalities', 'archetypes', 'knacks', 'equipment', 'injuries', 'traumas']
        .some(function (group) { return (A.catalog[group] || []).some(function (record) { return 'catalog:' + record.id === id; }); })) return;
      ctx.fail('VALIDATION', 'Backed-up source is missing.');
    }
    function nestedReferences(record) {
      if (!record || typeof record !== 'object') return;
      if (Array.isArray(record)) { record.forEach(nestedReferences); return; }
      if (has(record, 'campaignId') && record.campaignId !== ctx.campaign.id) ctx.fail('FORBIDDEN', 'A nested backup record belongs to another campaign.');
      ['userId', 'ownerUserId', 'actorUserId', 'actor', 'invitedBy', 'acceptedBy', 'approvedBy', 'reviewedBy'].forEach(function (key) {
        if (record[key]) user(record[key]);
      });
      var foreignKeys = { characterId: 'characters', sessionId: 'sessions', sceneId: 'scenes', assetId: 'assets',
        materialId: 'materials', rollId: 'rolls', snapshotId: 'snapshots', reversalOf: 'xpLedger' };
      Object.keys(foreignKeys).forEach(function (key) {
        if (record[key]) {
          if (key === 'assetId' && has(indexed.scenes, record[key])) return;
          reference(foreignKeys[key], record[key]);
        }
      });
      Object.keys(record).forEach(function (key) { if (record[key] && typeof record[key] === 'object') nestedReferences(record[key]); });
    }
    function fileBinding(name, record) {
      if (!record || typeof record !== 'object') return;
      if (Array.isArray(record)) { record.forEach(function (row) { fileBinding(null, row); }); return; }
      ['driveFileId', 'imageFileId'].forEach(function (key) {
        if (!record[key]) return;
        if (typeof record[key] !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(record[key])) ctx.fail('VALIDATION', 'Invalid backed-up private file.');
        var crossCampaign = Object.keys(ctx.state).some(function (table) {
          return Object.keys(ctx.state[table] || {}).some(function (id) {
            var current = ctx.state[table][id];
            return current && current.campaignId && current.campaignId !== ctx.campaign.id &&
              (current.driveFileId === record[key] || current.imageFileId === record[key]);
          });
        });
        var existing = name && ctx.state[name] && ctx.state[name][record.id];
        if (!name && !existing && record.id) Object.keys(ctx.state).some(function (table) {
          if (ctx.state[table] && has(ctx.state[table], record.id) && ctx.state[table][record.id].campaignId === ctx.campaign.id) {
            existing = ctx.state[table][record.id]; return true;
          }
          return false;
        });
        if (crossCampaign || !existing || existing.campaignId !== ctx.campaign.id || existing[key] !== record[key]) {
          ctx.fail('FORBIDDEN', 'A backup cannot introduce or rebind a private file. Register or upload the file again.');
        }
      });
      Object.keys(record).forEach(function (key) {
        if (record[key] && typeof record[key] === 'object') fileBinding(null, record[key]);
      });
    }
    backup.tables.users.forEach(function (record) {
      if (typeof record.googleSubjectId !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(record.googleSubjectId) ||
          record.id !== 'google:' + record.googleSubjectId || typeof record.email !== 'string' || record.email.length > 254 ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) ctx.fail('VALIDATION', 'Invalid backed-up Google identity.');
      ctx.text(record.displayName, 'display name', 120, true);
      if (['en', 'th'].indexOf(record.preferredLanguage) < 0) ctx.fail('VALIDATION', 'Invalid backed-up language.');
    });
    user(backup.campaign.ownerUserId);
    var memberUsers = {};
    backup.tables.members.forEach(function (record) {
      user(record.userId);
      if (has(memberUsers, record.userId)) ctx.fail('VALIDATION', 'Duplicate campaign membership.');
      memberUsers[record.userId] = record;
      enumValue(ctx, record.role, ['GM', 'CO_GM', 'PLAYER'], 'member role');
      enumValue(ctx, record.status, ['ACTIVE', 'INVITED', 'LEFT', 'REMOVED'], 'member status');
    });
    var ownerMember = memberUsers[backup.campaign.ownerUserId];
    if (!ownerMember || ownerMember.role !== 'GM' || ownerMember.status !== 'ACTIVE') ctx.fail('VALIDATION', 'The backup must retain its active owner/GM.');
    backup.tables.users.forEach(function (profile) {
      if (!memberUsers[profile.id]) ctx.fail('VALIDATION', 'A backup cannot contain unrelated user profiles.');
    });
    backup.tables.invites.forEach(function (record) {
      user(record.invitedBy); user(record.acceptedBy, true);
      if (typeof record.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email) ||
          !isFinite(Date.parse(record.expiresAt))) ctx.fail('VALIDATION', 'Invalid invitation identity or expiry.');
      enumValue(ctx, record.role, ['PLAYER', 'CO_GM'], 'invitation role');
      enumValue(ctx, record.status, ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'], 'invitation status');
      if (record.status === 'ACCEPTED' && !record.acceptedBy) ctx.fail('VALIDATION', 'An accepted invitation lacks its user.');
    });
    backup.tables.characters.forEach(function (record) {
      user(record.ownerUserId);
      if (!memberUsers[record.ownerUserId]) ctx.fail('VALIDATION', 'Investigator owner lacks campaign membership.');
      enumValue(ctx, record.status, ['DRAFT', 'SUBMITTED', 'REJECTED', 'APPROVED', 'RETIRED'], 'investigator status');
      ['xpEarned', 'xpSpent', 'money', 'poolMaximum', 'poolLimit', 'normalDice', 'horrorDice', 'horrorLimit', 'insightLimit', 'insightCurrent'].forEach(function (key) {
        if (record[key] !== undefined) ctx.integer(record[key], 0, 100000000, key);
        else if (record.status === 'APPROVED') ctx.fail('VALIDATION', 'Approved investigator state is incomplete.');
      });
      if (record.xpSpent > record.xpEarned || record.poolLimit > record.poolMaximum || record.horrorLimit > record.poolMaximum ||
          record.insightLimit > 10 || record.insightCurrent > record.insightLimit) ctx.fail('VALIDATION', 'Contradictory investigator state in backup.');
      ['injuries', 'traumas', 'effects'].forEach(function (key) {
        if (record[key] !== undefined && !Array.isArray(record[key])) ctx.fail('VALIDATION', 'Invalid investigator effects.');
      });
    });
    var activeSessions = 0;
    var sessionNumbers = {};
    backup.tables.sessions.forEach(function (record) {
      enumValue(ctx, record.status, ['PREPARING', 'ACTIVE', 'PAUSED', 'COMPLETED'], 'session status');
      if (['ACTIVE', 'PAUSED'].indexOf(record.status) >= 0) activeSessions += 1;
      ctx.integer(record.number, 1, 100000000, 'session number');
      if (has(sessionNumbers, record.number)) ctx.fail('VALIDATION', 'Duplicate session number.');
      sessionNumbers[record.number] = true;
      reference('scenes', record.currentSceneId, true);
      if (record.status === 'COMPLETED') {
        reference('snapshots', record.snapshotId, false);
        if (indexed.snapshots[record.snapshotId].kind !== 'SNAPSHOT' || indexed.snapshots[record.snapshotId].sessionId !== record.id) ctx.fail('VALIDATION', 'Invalid completed-session snapshot.');
      }
      if (record.sceneStatuses !== undefined) {
        if (!record.sceneStatuses || typeof record.sceneStatuses !== 'object' || Array.isArray(record.sceneStatuses)) ctx.fail('VALIDATION', 'Invalid session scene links.');
        Object.keys(record.sceneStatuses).forEach(function (id) {
          reference('scenes', id);
          enumValue(ctx, record.sceneStatuses[id], ['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'SKIPPED'], 'scene status');
        });
      }
    });
    if (activeSessions > 1) ctx.fail('VALIDATION', 'The backup contains multiple live sessions.');
    var attendanceKeys = {};
    backup.tables.attendance.forEach(function (record) {
      user(record.userId); reference('sessions', record.sessionId); reference('characters', record.characterId, true);
      enumValue(ctx, record.attendance, ['INVITED', 'PRESENT', 'ABSENT', 'LEFT'], 'attendance');
      var key = record.sessionId + ':' + record.userId;
      if (has(attendanceKeys, key) || record.characterId && indexed.characters[record.characterId].ownerUserId !== record.userId) ctx.fail('VALIDATION', 'Invalid attendance ownership or uniqueness.');
      if (record.attendance === 'PRESENT' && !record.characterId) ctx.fail('VALIDATION', 'Present attendance lacks an investigator.');
      attendanceKeys[key] = true;
    });
    backup.tables.snapshots.forEach(function (record) {
      if (record.kind === 'SNAPSHOT') reference('sessions', record.sessionId);
      else if (record.kind === 'SNAPSHOT_FRAGMENT') {
        reference('snapshots', record.snapshotId);
        if (indexed.snapshots[record.snapshotId].kind !== 'SNAPSHOT' || !record.data || record.data.campaignId !== ctx.campaign.id ||
            ['CHARACTER', 'ATTENDANCE', 'SCENE', 'ASSET', 'EVENT', 'ROLL', 'XP'].indexOf(record.fragmentType) < 0) ctx.fail('VALIDATION', 'Invalid immutable snapshot fragment.');
        var originalTable = { CHARACTER: 'characters', ATTENDANCE: 'attendance', SCENE: 'scenes', ASSET: 'assets', EVENT: 'events', ROLL: 'rolls', XP: 'xpLedger' }[record.fragmentType];
        reference(originalTable, record.data.id);
        if (record.data.ownerUserId) user(record.data.ownerUserId);
        if (record.data.userId) user(record.data.userId);
      } else ctx.fail('VALIDATION', 'Invalid snapshot kind.');
    });
    BACKUP_TABLES.forEach(function (name) {
      backup.tables[name].forEach(function (record) {
        nestedReferences(record);
        fileBinding(name, record);
        if (record.visibility !== undefined) enumValue(ctx, record.visibility, VISIBILITY, 'visibility');
        if (record.selectedUserIds !== undefined) {
          if (!Array.isArray(record.selectedUserIds)) ctx.fail('VALIDATION', 'Invalid selected access.');
          record.selectedUserIds.forEach(function (id) { user(id); if (!memberUsers[id]) ctx.fail('VALIDATION', 'Selected access has no campaign membership.'); });
        }
        if (['characters', 'attendance', 'snapshots'].indexOf(name) >= 0) return;
        if (record.userId) user(record.userId);
        if (record.ownerUserId) user(record.ownerUserId);
        if (record.actorUserId) user(record.actorUserId);
        if (record.actor) user(record.actor);
        if (record.invitedBy) user(record.invitedBy);
        if (record.acceptedBy) user(record.acceptedBy);
        if (record.approvedBy) user(record.approvedBy);
        if (record.sessionId) reference('sessions', record.sessionId);
        if (record.characterId) reference('characters', record.characterId);
        if (record.sceneId) reference('scenes', record.sceneId);
        if (record.materialId) reference('materials', record.materialId);
        if (record.rollId) reference('rolls', record.rollId);
        if (record.sourceType && record.sourceId) {
          var sourceTable = { ENTITY: 'entities', MATERIAL: 'materials', ASSET: 'assets', SCENE: 'scenes',
            entity: 'entities', material: 'materials', asset: 'assets', scene: 'scenes' }[record.sourceType];
          if (sourceTable && record.sourceId.indexOf('catalog:') !== 0) reference(sourceTable, record.sourceId);
          else sourceReference(record.sourceId);
        }
      });
    });
    backup.tables.entities.forEach(function (record) { reference('books', record.bookId); });
    backup.tables.imports.forEach(function (record) {
      reference('books', record.bookId);
      if (!Array.isArray(record.entityIds)) ctx.fail('VALIDATION', 'Invalid imported entity links.');
      record.entityIds.forEach(function (id) {
        reference('entities', id);
        if (indexed.entities[id].bookId !== record.bookId) ctx.fail('VALIDATION', 'Import entities belong to another book.');
      });
    });
    backup.tables.aiHistory.forEach(function (record) {
      ['citations', 'contextSources'].forEach(function (key) {
        if (record[key] !== undefined && !Array.isArray(record[key])) ctx.fail('VALIDATION', 'Invalid assistant source links.');
        (record[key] || []).forEach(function (ref) { sourceReference(ref && ref.sourceId); });
      });
    });
    return indexed;
  }
  register('restoreCampaign', ['backup', 'reason'], true, owner, function (ctx, p) {
    ctx.version(ctx.campaign);
    var reason = ctx.text(p.reason, 'restore reason', 1000, true);
    var indexed = validateBackup(ctx, p.backup);
    var counts = {};
    var retainedCounts = {};
    var skippedMutationReceipts = 0;
    var pendingMemberships = 0;
    var seed = canonicalSeed(ctx);
    // Existing verified profiles are never overwritten by data supplied in a backup.
    Object.keys(indexed.users).forEach(function (id) {
      if (!has(ctx.state.users, id)) {
        var profile = ctx.clone(indexed.users[id]);
        profile.emailVerified = false; profile.version = 1; profile.updatedAt = ctx.at;
        ctx.state.users[id] = profile;
      }
    });
    BACKUP_TABLES.forEach(function (name) {
      if (!ctx.state[name]) ctx.state[name] = {};
      var previous = ctx.state[name];
      var oldVersions = {};
      Object.keys(previous).forEach(function (key) {
        if (previous[key].campaignId === ctx.campaign.id) oldVersions[previous[key].id] = previous[key].version || 0;
      });
      p.backup.tables[name].forEach(function (source) {
        var record = ctx.clone(source);
        var key = name === 'members' ? ctx.campaign.id + ':' + record.userId : record.id;
        if (name === 'mutations') {
          // A checksum authenticates neither the caller nor an operation receipt.
          if (!has(previous, key)) skippedMutationReceipts += 1;
          return;
        }
        if (IMMUTABLE.indexOf(name) >= 0 && has(previous, key)) return;
        if ((name === 'members' || name === 'invites') && has(previous, key)) return;
        if (name === 'members' && !has(previous, key) && record.status === 'ACTIVE') {
          // Imported identity and role assertions need a fresh invitation/acceptance.
          record.status = 'INVITED'; record.role = 'PLAYER'; pendingMemberships += 1;
        }
        if (['books', 'entities', 'materials'].indexOf(name) >= 0) record = restoredSource(ctx, name, source, seed, indexed.books);
        if (has(previous, key)) {
          var current = previous[key];
          if (current.ownerUserId !== undefined) record.ownerUserId = current.ownerUserId;
          if (current.visibility !== undefined) record.visibility = current.visibility;
          if (current.selectedUserIds !== undefined) record.selectedUserIds = ctx.clone(current.selectedUserIds);
          if (current.createdAt !== undefined) record.createdAt = current.createdAt;
        }
        if (IMMUTABLE.indexOf(name) < 0) { record.version = Math.max(record.version || 1, oldVersions[record.id] || 0) + 1; record.updatedAt = ctx.at; }
        previous[key] = record;
      });
      counts[name] = p.backup.tables[name].length;
      retainedCounts[name] = Object.keys(previous).filter(function (key) {
        return previous[key].campaignId === ctx.campaign.id && !has(indexed[name], previous[key].id);
      }).length;
    });
    var restoredCampaign = ctx.clone(p.backup.campaign);
    restoredCampaign.version = ctx.campaign.version + 1; restoredCampaign.updatedAt = ctx.at;
    ctx.state.campaigns[ctx.campaign.id] = restoredCampaign;
    event(ctx, 'CAMPAIGN_RESTORE', null, { text: reason, checksum: p.backup.checksum }, 'CO_GM');
    return { restored: true, campaignId: restoredCampaign.id, counts: counts, retainedCounts: retainedCounts,
      skippedMutationReceipts: skippedMutationReceipts, pendingMemberships: pendingMemberships, campaign: ctx.clone(restoredCampaign) };
  });
})(Arkham);
if (typeof module !== 'undefined' && module.exports) module.exports = Arkham;
