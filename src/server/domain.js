/* Campaign domain shared by Apps Script V8 and the Node test runner. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;

Arkham.createService = function (dependencies) {
  'use strict';

  var store = dependencies.store;
  var now = dependencies.now;
  var makeId = dependencies.id;
  var digest = dependencies.digest;
  var DAY = 24 * 60 * 60 * 1000;
  var mutations = ['createCampaign', 'updateCampaign', 'inviteMember', 'respondInvite',
    'revokeInvite', 'setMemberRole', 'removeMember', 'updatePreferences'];
  var has = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  var clone = function (value) { return JSON.parse(JSON.stringify(value)); };

  function fail(code, message, status) {
    var error = new Error(message);
    error.code = code;
    error.status = status || 400;
    throw error;
  }

  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('VALIDATION', label + ' must be an object.');
    }
  }

  function fields(value, allowed, label) {
    object(value, label);
    Object.keys(value).forEach(function (key) {
      if (allowed.indexOf(key) === -1) fail('VALIDATION', 'Unsupported ' + label + ' field.');
    });
  }

  function text(value, label, maximum, required, singleLine, literalAngles) {
    if (typeof value !== 'string') fail('VALIDATION', label + ' must be text.');
    var result = value.trim();
    if ((required && !result) || result.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
      fail('VALIDATION', 'Invalid ' + label + '.');
    }
    if (singleLine && (/[\r\n\t]/.test(result) || (!literalAngles && /[<>]/.test(result)))) {
      fail('VALIDATION', label + ' must be plain text on one line.');
    }
    return result;
  }

  function identifier(value, label) {
    if (typeof value !== 'string' || !value || value.length > 512 || /[\s\u0000-\u001f]/.test(value)) {
      fail('VALIDATION', 'Invalid ' + label + '.');
    }
    return value;
  }

  function email(value) {
    var result = text(value, 'email', 254, true, true).toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result)) fail('VALIDATION', 'Invalid email address.');
    return result;
  }

  function language(value) {
    if (value !== 'en' && value !== 'th') fail('VALIDATION', 'Language must be en or th.');
    return value;
  }

  function role(value) {
    if (['GM', 'CO_GM', 'PLAYER'].indexOf(value) === -1) fail('VALIDATION', 'Invalid campaign role.');
    return value;
  }

  function timestamp() {
    var value = now();
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      fail('INTERNAL', 'The server clock is unavailable.', 500);
    }
    return value;
  }

  function tables(state) {
    ['users', 'campaigns', 'members', 'invites', 'mutations', 'audit'].forEach(function (name) {
      if (!has(state, name)) state[name] = {};
      object(state[name], name);
    });
    return state;
  }

  function uniqueId(prefix, table) {
    for (var attempt = 0; attempt < 5; attempt += 1) {
      var suffix = makeId();
      if (typeof suffix !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(suffix)) {
        fail('INTERNAL', 'The server ID generator is unavailable.', 500);
      }
      var key = prefix + ':' + suffix;
      if (!has(table, key) && !records(table).some(function (record) { return record.id === key; })) return key;
    }
    fail('INTERNAL', 'The server could not allocate an ID.', 500);
  }

  function records(table) { return Object.keys(table).map(function (key) { return table[key]; }); }
  function memberKey(campaignId, userId) { return campaignId + ':' + userId; }
  function member(state, campaignId, userId) { return state.members[memberKey(campaignId, userId)]; }
  function active(record) { return !!record && record.status === 'ACTIVE'; }

  function currentUser(state, userId) {
    if (typeof userId !== 'string' || !has(state.users, userId) || !state.users[userId].emailVerified) {
      fail('AUTH_REQUIRED', 'Sign in with a verified Google account.', 401);
    }
    return state.users[userId];
  }

  function access(state, user, campaignId) {
    var campaign = state.campaigns[campaignId];
    var membership = member(state, campaignId, user.id);
    if (!has(state.campaigns, campaignId) || !active(membership)) {
      fail('FORBIDDEN', 'Campaign access denied.', 403);
    }
    return { campaign: campaign, member: membership, owner: campaign.ownerUserId === user.id };
  }

  function managing(context) {
    if (context.member.role !== 'GM') fail('FORBIDDEN', 'Campaign management permission required.', 403);
  }

  function elevated(context, targetRole) {
    managing(context);
    if (targetRole !== 'PLAYER' && !context.owner) fail('FORBIDDEN', 'Only the owner can manage elevated roles.', 403);
  }

  function requiredVersion(request) {
    if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
      fail('VALIDATION', 'A positive expectedVersion is required.');
    }
  }

  function version(request, record) {
    requiredVersion(request);
    if (request.expectedVersion !== record.version) fail('CONFLICT', 'This record changed. Refresh before saving.', 409);
  }

  function effectiveStatus(invitation, at) {
    return invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) <= Date.parse(at)
      ? 'EXPIRED' : invitation.status;
  }

  function invitationView(invitation, at) {
    var result = clone(invitation);
    result.status = effectiveStatus(invitation, at);
    return result;
  }

  function campaignView(campaign, membership) {
    var result = clone(campaign);
    if (membership.role === 'PLAYER') delete result.notes;
    return result;
  }

  function memberView(state, membership) {
    var result = clone(membership);
    var profile = state.users[membership.userId];
    result.user = { id: membership.userId, displayName: profile ? profile.displayName : 'Campaign member' };
    return result;
  }

  function publicInvitation(state, invitation, at) {
    var result = invitationView(invitation, at);
    result.campaignName = state.campaigns[invitation.campaignId].name;
    var inviter = state.users[invitation.invitedBy];
    result.inviterName = inviter ? inviter.displayName : 'Campaign GM';
    return result;
  }

  function bootstrap(state, user, payload) {
    var at = timestamp();
    var campaigns = records(state.members).filter(function (record) {
      return record.userId === user.id && active(record) && has(state.campaigns, record.campaignId);
    }).map(function (membership) {
      var campaign = campaignView(state.campaigns[membership.campaignId], membership);
      campaign.role = membership.role;
      campaign.memberCount = records(state.members).filter(function (record) {
        return record.campaignId === campaign.id && active(record);
      }).length;
      campaign.sessionCount = 0;
      return campaign;
    }).sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id); });
    var invitations = records(state.invites).filter(function (invitation) {
      return invitation.email === user.email && effectiveStatus(invitation, at) === 'PENDING' &&
        has(state.campaigns, invitation.campaignId);
    }).map(function (invitation) { return publicInvitation(state, invitation, at); });
    var selected = null;
    if (has(payload, 'campaignId')) {
      var context = access(state, user, payload.campaignId);
      selected = {
        campaign: campaignView(context.campaign, context.member),
        role: context.member.role,
        isOwner: context.owner,
        members: records(state.members).filter(function (record) {
          return record.campaignId === context.campaign.id && active(record);
        }).map(function (record) { return memberView(state, record); }),
        invites: context.member.role === 'PLAYER' ? [] : records(state.invites).filter(function (record) {
          return record.campaignId === context.campaign.id;
        }).map(function (record) { return publicInvitation(state, record, at); })
      };
    }
    return { user: clone(user), campaigns: campaigns, invitations: invitations, activeCampaign: selected };
  }

  function validate(request) {
    fields(request, ['operation', 'payload', 'requestId', 'expectedVersion'], 'request');
    if (request.operation !== 'bootstrap' && mutations.indexOf(request.operation) === -1) {
      fail('VALIDATION', 'Unsupported operation.');
    }
    var payload = request.payload;
    var schemas = {
      bootstrap: ['campaignId'],
      createCampaign: ['name', 'description', 'defaultLanguage', 'setting', 'notes'],
      updateCampaign: ['campaignId', 'name', 'description', 'defaultLanguage', 'setting', 'notes'],
      inviteMember: ['campaignId', 'email', 'role'],
      respondInvite: ['inviteId', 'decision'],
      revokeInvite: ['inviteId'],
      setMemberRole: ['campaignId', 'userId', 'role'],
      removeMember: ['campaignId', 'userId'],
      updatePreferences: ['preferredLanguage']
    };
    fields(payload, schemas[request.operation], 'payload');
    ['campaignId', 'userId', 'inviteId'].forEach(function (name) {
      if (has(payload, name)) identifier(payload[name], name);
    });
    if (request.operation === 'createCampaign' || request.operation === 'updateCampaign') {
      if (has(payload, 'name') || request.operation === 'createCampaign') text(payload.name, 'campaign name', 120, true, true);
      if (has(payload, 'description')) text(payload.description, 'description', 2000, false, false);
      if (has(payload, 'setting')) text(payload.setting, 'setting', 200, false, true);
      if (has(payload, 'notes')) text(payload.notes, 'notes', 10000, false, false);
      if (has(payload, 'defaultLanguage')) language(payload.defaultLanguage);
      if (request.operation === 'updateCampaign' && Object.keys(payload).length < 2) fail('VALIDATION', 'Choose fields to update.');
    }
    if (request.operation === 'inviteMember') {
      email(payload.email);
      if (has(payload, 'role')) {
        role(payload.role);
        if (payload.role === 'GM') fail('VALIDATION', 'Invite a Player or Co-GM; the owner can promote an active member later.');
      }
    }
    if (request.operation === 'setMemberRole') role(payload.role);
    if (request.operation === 'respondInvite' && ['ACCEPT', 'DECLINE'].indexOf(payload.decision) === -1) {
      fail('VALIDATION', 'Invitation decision must be ACCEPT or DECLINE.');
    }
    if (request.operation === 'updatePreferences') language(payload.preferredLanguage);
    if (['updateCampaign', 'inviteMember', 'setMemberRole', 'removeMember'].indexOf(request.operation) !== -1) {
      identifier(payload.campaignId, 'campaignId');
    }
    if (['setMemberRole', 'removeMember'].indexOf(request.operation) !== -1) identifier(payload.userId, 'userId');
    if (['respondInvite', 'revokeInvite'].indexOf(request.operation) !== -1) identifier(payload.inviteId, 'inviteId');
    if (request.operation !== 'bootstrap') {
      if (typeof request.requestId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(request.requestId)) {
        fail('VALIDATION', 'A unique requestId is required.');
      }
      if (['updateCampaign', 'revokeInvite', 'setMemberRole', 'removeMember', 'updatePreferences'].indexOf(request.operation) !== -1) {
        requiredVersion(request);
      } else if (has(request, 'expectedVersion') && (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1)) {
        fail('VALIDATION', 'Invalid expectedVersion.');
      }
    }
  }

  function authorize(state, user, operation, payload, replay) {
    var context;
    if (['updateCampaign', 'inviteMember', 'setMemberRole', 'removeMember'].indexOf(operation) !== -1) {
      context = access(state, user, payload.campaignId);
      managing(context);
    }
    if (operation === 'inviteMember') elevated(context, payload.role || 'PLAYER');
    if (operation === 'setMemberRole' || operation === 'removeMember') {
      var target = member(state, payload.campaignId, payload.userId);
      if (!target || (!replay && !active(target))) fail('NOT_FOUND', 'Active member not found.', 404);
      if (target.userId === context.campaign.ownerUserId) fail('FORBIDDEN', 'The campaign owner must remain GM.', 403);
      elevated(context, target.role);
      if (operation === 'setMemberRole') elevated(context, payload.role);
      context.target = target;
    }
    if (operation === 'revokeInvite' || operation === 'respondInvite') {
      var invitation = state.invites[payload.inviteId];
      if (!has(state.invites, payload.inviteId)) fail('FORBIDDEN', 'Invitation access denied.', 403);
      if (operation === 'revokeInvite') {
        var invitedCampaign = state.campaigns[invitation.campaignId];
        var manager = member(state, invitation.campaignId, user.id);
        if (!invitedCampaign || !active(manager) || manager.role !== 'GM' ||
            (invitation.role !== 'PLAYER' && invitedCampaign.ownerUserId !== user.id)) {
          fail('FORBIDDEN', 'Invitation access denied.', 403);
        }
        context = { campaign: invitedCampaign, member: manager, owner: invitedCampaign.ownerUserId === user.id };
      } else {
        if (!user.emailVerified || user.email !== invitation.email) fail('FORBIDDEN', 'Invitation access denied.', 403);
        if (replay && invitation.status === 'ACCEPTED' && !active(member(state, invitation.campaignId, user.id))) {
          fail('FORBIDDEN', 'Invitation access denied.', 403);
        }
        context = { campaign: state.campaigns[invitation.campaignId] };
        if (!context.campaign) fail('FORBIDDEN', 'Invitation access denied.', 403);
      }
      context.invitation = invitation;
    }
    if (replay && operation === 'createCampaign') {
      // The caller's stored mutation result supplies its campaign below.
      return null;
    }
    return context;
  }

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonical(value[key]);
    }).join(',') + '}';
    return JSON.stringify(value);
  }

  function mutate(state, user, request, context, at) {
    var payload = request.payload;
    var campaign;
    var membership;
    var invitation;
    var result;
    var target;
    var campaignId = null;
    switch (request.operation) {
      case 'createCampaign':
        campaign = {
          id: uniqueId('campaign', state.campaigns), ownerUserId: user.id,
          name: text(payload.name, 'campaign name', 120, true, true),
          description: has(payload, 'description') ? payload.description.trim() : '',
          defaultLanguage: payload.defaultLanguage || 'en', setting: payload.setting ? payload.setting.trim() : '',
          notes: payload.notes ? payload.notes.trim() : '', status: 'ACTIVE', createdAt: at, updatedAt: at, version: 1
        };
        membership = {
          id: uniqueId('member', state.members), campaignId: campaign.id, userId: user.id,
          role: 'GM', status: 'ACTIVE', createdAt: at, joinedAt: at, invitedBy: user.id, updatedAt: at, version: 1
        };
        state.campaigns[campaign.id] = campaign;
        state.members[memberKey(campaign.id, user.id)] = membership;
        result = { campaign: clone(campaign) };
        target = campaign.id;
        campaignId = campaign.id;
        break;
      case 'updateCampaign':
        campaign = context.campaign;
        version(request, campaign);
        ['name', 'description', 'defaultLanguage', 'setting', 'notes'].forEach(function (name) {
          if (has(payload, name)) campaign[name] = payload[name].trim();
        });
        campaign.version += 1;
        campaign.updatedAt = at;
        result = { campaign: campaignView(campaign, context.member) };
        target = campaign.id;
        campaignId = campaign.id;
        break;
      case 'inviteMember':
        campaignId = context.campaign.id;
        var invitedEmail = email(payload.email);
        var duplicateMember = records(state.users).some(function (profile) {
          return profile.emailVerified && profile.email === invitedEmail && active(member(state, campaignId, profile.id));
        });
        var duplicateInvite = records(state.invites).some(function (record) {
          return record.campaignId === campaignId && record.email === invitedEmail && effectiveStatus(record, at) === 'PENDING';
        });
        if (duplicateMember || duplicateInvite) fail('CONFLICT', 'This account is already a member or has a pending invitation.', 409);
        invitation = {
          id: uniqueId('invite', state.invites), campaignId: campaignId, email: invitedEmail,
          role: payload.role || 'PLAYER', status: 'PENDING', invitedBy: user.id,
          createdAt: at, updatedAt: at, expiresAt: new Date(Date.parse(at) + 7 * DAY).toISOString(), version: 1
        };
        state.invites[invitation.id] = invitation;
        result = { invitation: publicInvitation(state, invitation, at) };
        target = invitation.id;
        break;
      case 'respondInvite':
        invitation = context.invitation;
        campaignId = invitation.campaignId;
        var status = effectiveStatus(invitation, at);
        var desired = payload.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
        if (status !== 'PENDING') {
          if (status !== desired || (desired === 'ACCEPTED' && invitation.acceptedBy !== user.id)) {
            fail('CONFLICT', 'This invitation is no longer pending.', 409);
          }
          membership = member(state, campaignId, user.id);
          if (desired === 'ACCEPTED' && !active(membership)) fail('FORBIDDEN', 'Campaign access denied.', 403);
          result = { invitation: publicInvitation(state, invitation, at) };
          if (desired === 'ACCEPTED') result.membership = memberView(state, membership);
          target = invitation.id;
          break;
        }
        invitation.status = desired;
        invitation.version += 1;
        invitation.updatedAt = at;
        if (desired === 'ACCEPTED') {
          invitation.acceptedBy = user.id;
          invitation.acceptedAt = at;
          membership = member(state, campaignId, user.id);
          if (!active(membership)) {
            var previous = membership;
            membership = {
              id: previous ? previous.id : uniqueId('member', state.members), campaignId: campaignId,
              userId: user.id, role: invitation.role, status: 'ACTIVE', createdAt: previous ? previous.createdAt : at, joinedAt: at,
              invitedBy: invitation.invitedBy, updatedAt: at, version: previous ? previous.version + 1 : 1
            };
            state.members[memberKey(campaignId, user.id)] = membership;
          }
        }
        result = { invitation: publicInvitation(state, invitation, at) };
        if (desired === 'ACCEPTED') result.membership = memberView(state, membership);
        target = invitation.id;
        break;
      case 'revokeInvite':
        invitation = context.invitation;
        version(request, invitation);
        if (effectiveStatus(invitation, at) !== 'PENDING') fail('CONFLICT', 'This invitation is no longer pending.', 409);
        invitation.status = 'REVOKED';
        invitation.version += 1;
        invitation.updatedAt = at;
        result = { invitation: publicInvitation(state, invitation, at) };
        target = invitation.id;
        campaignId = invitation.campaignId;
        break;
      case 'setMemberRole':
      case 'removeMember':
        membership = context.target;
        version(request, membership);
        if (request.operation === 'setMemberRole') membership.role = payload.role;
        else membership.status = 'REMOVED';
        membership.version += 1;
        membership.updatedAt = at;
        result = { member: memberView(state, membership) };
        target = membership.id;
        campaignId = membership.campaignId;
        break;
      case 'updatePreferences':
        version(request, user);
        user.preferredLanguage = payload.preferredLanguage;
        user.version += 1;
        user.updatedAt = at;
        result = { user: clone(user) };
        target = user.id;
        break;
    }
    var auditId = uniqueId('audit', state.audit);
    state.audit[auditId] = {
      id: auditId, actor: user.id, operation: request.operation, target: target,
      campaignId: campaignId, requestId: request.requestId, at: at
    };
    return { result: result, campaignId: campaignId };
  }

  function upsertUser(profile) {
    fields(profile, ['sub', 'email', 'emailVerified', 'name'], 'verified profile');
    if (profile.emailVerified !== true || typeof profile.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(profile.sub)) {
      fail('AUTH_REQUIRED', 'A verified Google identity is required.', 401);
    }
    var normalizedEmail = email(profile.email);
    var displayName = text(profile.name, 'display name', 120, true, true, true);
    return store.transact(function (rawState) {
      var state = tables(rawState);
      var userId = 'google:' + profile.sub;
      var at = timestamp();
      var existing = state.users[userId];
      var user;
      if (has(state.users, userId)) {
        user = existing;
        if (user.email !== normalizedEmail || user.displayName !== displayName || !user.emailVerified) {
          user.version += 1;
          user.updatedAt = at;
        }
        user.email = normalizedEmail;
        user.emailVerified = true;
        user.displayName = displayName;
        user.lastLoginAt = at;
      } else {
        user = {
          id: userId, googleSubjectId: profile.sub, email: normalizedEmail, emailVerified: true,
          displayName: displayName, preferredLanguage: 'en', createdAt: at, updatedAt: at,
          lastLoginAt: at, version: 1
        };
        state.users[userId] = user;
      }
      return clone(user);
    });
  }

  function execute(userId, request) {
    validate(request);
    if (request.operation === 'bootstrap') {
      return store.read(function (rawState) {
        var state = tables(rawState);
        return bootstrap(state, currentUser(state, userId), request.payload);
      });
    }
    var fingerprint = digest(canonical({ operation: request.operation, payload: request.payload,
      expectedVersion: has(request, 'expectedVersion') ? request.expectedVersion : null }));
    return store.transact(function (rawState) {
      var state = tables(rawState);
      var user = currentUser(state, userId);
      var key = user.id + ':' + request.requestId;
      var previous = state.mutations[key];
      if (has(state.mutations, key)) {
        if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'This requestId was already used for another request.', 409);
        authorize(state, user, request.operation, request.payload, true);
        if (previous.campaignId && request.operation === 'createCampaign') access(state, user, previous.campaignId);
        return clone(previous.result);
      }
      var context = authorize(state, user, request.operation, request.payload, false);
      var at = timestamp();
      var output = mutate(state, user, request, context, at);
      state.mutations[key] = {
        id: key, userId: user.id, requestId: request.requestId, fingerprint: fingerprint,
        operation: request.operation, campaignId: output.campaignId, result: clone(output.result), createdAt: at
      };
      return clone(output.result);
    });
  }

  return { upsertUser: upsertUser, execute: execute };
};

if (typeof module !== 'undefined' && module.exports) module.exports = Arkham;
