const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createService } = require('../src/server/domain.js');

function harness() {
  let state = { users: {}, campaigns: {}, members: {}, invites: {}, mutations: {}, audit: {} };
  let clock = '2026-10-07T00:00:00.000Z';
  let sequence = 0;
  let failCommit = false;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const store = {
    read(fn) { return fn(copy(state)); },
    transact(fn) {
      const next = copy(state);
      const result = fn(next);
      if (failCommit) {
        failCommit = false;
        throw new Error('Simulated storage commit failure');
      }
      state = next;
      return result;
    }
  };
  const service = createService({
    store, now: () => clock, id: () => String(++sequence),
    digest: (text) => createHash('sha256').update(text).digest('hex')
  });
  const accounts = {};
  for (const sub of ['A', 'B', 'C', 'D']) {
    accounts[sub] = service.upsertUser({ sub, email: `${sub.toLowerCase()}@example.com`, emailVerified: true, name: `User ${sub}` });
  }
  function run(account, operation, payload, expectedVersion, requestId) {
    const request = { operation, payload, requestId: requestId || `request-${++sequence}` };
    if (expectedVersion !== undefined) request.expectedVersion = expectedVersion;
    return service.execute(accounts[account].id, request);
  }
  function read(account, campaignId) {
    return service.execute(accounts[account].id, { operation: 'bootstrap', payload: campaignId ? { campaignId } : {} });
  }
  function campaign(owner = 'A', name = 'The Miskatonic Case') {
    return run(owner, 'createCampaign', { name, defaultLanguage: 'en', notes: 'The professor is a cultist.' }).campaign;
  }
  function join(campaignId, account = 'B', role = 'PLAYER', owner = 'A') {
    const invitation = run(owner, 'inviteMember', { campaignId, email: `${account.toLowerCase()}@example.com`, role }).invitation;
    return run(account, 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' }).membership;
  }
  return { service, accounts, run, read, campaign, join,
    state: () => copy(state),
    at: (value) => { clock = value; },
    failCommit: () => { failCommit = true; }
  };
}

function code(expectedCode) {
  return (error) => error.code === expectedCode && Number.isInteger(error.status);
}

test('verified immutable Google subject identifies users across logins and preserves language', () => {
  const h = harness();
  const a = h.accounts.A;
  assert.notEqual(a.id, h.accounts.B.id);
  const changed = h.run('A', 'updatePreferences', { preferredLanguage: 'th' }, a.version).user;
  h.at('2026-10-08T00:00:00.000Z');
  const loggedIn = h.service.upsertUser({ sub: 'A', email: 'A@EXAMPLE.COM', emailVerified: true, name: 'User A' });
  assert.equal(loggedIn.id, a.id);
  assert.equal(loggedIn.preferredLanguage, 'th');
  assert.equal(loggedIn.version, changed.version);
  assert.equal(loggedIn.email, 'a@example.com');
  assert.equal(loggedIn.lastLoginAt, '2026-10-08T00:00:00.000Z');
  assert.throws(() => h.service.upsertUser({ sub: 'X', email: 'x@example.com', emailVerified: false, name: 'X' }), code('AUTH_REQUIRED'));
  assert.throws(() => h.service.execute('google:unknown', { operation: 'bootstrap', payload: {} }), code('AUTH_REQUIRED'));
});

test('campaign owner and GM membership commit together with accurate empty session count', () => {
  const h = harness();
  const campaign = h.campaign();
  const view = h.read('A', campaign.id);
  assert.equal(campaign.ownerUserId, h.accounts.A.id);
  assert.equal(view.activeCampaign.isOwner, true);
  assert.equal(view.activeCampaign.role, 'GM');
  assert.equal(view.activeCampaign.members.length, 1);
  assert.equal(view.activeCampaign.members[0].userId, h.accounts.A.id);
  assert.equal(view.activeCampaign.members[0].createdAt, campaign.createdAt);
  assert.equal(view.activeCampaign.members[0].updatedAt, campaign.createdAt);
  assert.equal(view.campaigns[0].memberCount, 1);
  assert.equal(view.campaigns[0].sessionCount, 0);
  assert.equal(h.read('A').activeCampaign, null);
  assert.equal(Object.keys(h.state().audit).length, 1);
});

test('A/B/C isolation uses current campaign membership and never returns player GM notes', () => {
  const h = harness();
  const x = h.campaign('A', 'X');
  const y = h.campaign('C', 'Y');
  h.join(x.id, 'B');
  assert.deepEqual(h.read('A').campaigns.map((campaign) => campaign.id), [x.id]);
  assert.deepEqual(h.read('C').campaigns.map((campaign) => campaign.id), [y.id]);
  assert.throws(() => h.read('A', y.id), code('FORBIDDEN'));
  assert.throws(() => h.run('A', 'updateCampaign', { campaignId: y.id, name: 'Hijacked' }, 1), code('FORBIDDEN'));
  const player = h.read('B', x.id);
  assert.equal(Object.hasOwn(player.campaigns[0], 'notes'), false);
  assert.equal(Object.hasOwn(player.activeCampaign.campaign, 'notes'), false);
  assert.equal(JSON.stringify(player).includes('cultist'), false);
  assert.equal(player.activeCampaign.invites.length, 0);
  assert.deepEqual(Object.keys(player.activeCampaign.members[0].user).sort(), ['displayName', 'id']);
  assert.equal(JSON.stringify(player.activeCampaign.members).includes('a@example.com'), false);
  assert.equal(h.read('A', x.id).activeCampaign.campaign.notes, x.notes);
});

test('payload and request allowlists reject owner, identity, campaign and generic field spoofing', () => {
  const h = harness();
  const campaign = h.campaign();
  const cases = [
    ['createCampaign', { name: 'Bad', ownerUserId: h.accounts.B.id }],
    ['createCampaign', { name: 'Bad', userId: h.accounts.B.id }],
    ['createCampaign', { name: 'Bad', campaignId: campaign.id }],
    ['updateCampaign', { campaignId: campaign.id, name: 'Bad', version: 1 }],
    ['inviteMember', { campaignId: campaign.id, email: 'b@example.com', invitedBy: h.accounts.C.id }],
    ['updatePreferences', { preferredLanguage: 'th', googleSubjectId: 'B' }]
  ];
  for (const [operation, payload] of cases) {
    assert.throws(() => h.run('A', operation, payload, 1), code('VALIDATION'));
  }
  assert.throws(() => h.service.execute(h.accounts.A.id, {
    operation: 'bootstrap', payload: {}, userId: h.accounts.B.id
  }), code('VALIDATION'));
  assert.throws(() => h.run('A', 'saveRow', { sheet: 'Users' }), code('VALIDATION'));
  assert.equal(Object.keys(h.state().campaigns).length, 1);
});

test('invitations bind verified email, default to PLAYER and create one immutable membership', () => {
  const h = harness();
  const campaign = h.campaign();
  const invitation = h.run('A', 'inviteMember', { campaignId: campaign.id, email: ' B@Example.com ' }).invitation;
  assert.equal(invitation.role, 'PLAYER');
  assert.equal(invitation.expiresAt, '2026-10-14T00:00:00.000Z');
  assert.equal(invitation.campaignName, campaign.name);
  assert.equal(invitation.inviterName, 'User A');
  assert.equal(h.read('B').invitations[0].id, invitation.id);
  assert.equal(h.read('C').invitations.length, 0);
  assert.throws(() => h.run('C', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' }), code('FORBIDDEN'));
  const first = h.run('B', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' });
  const again = h.run('B', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' });
  assert.equal(first.membership.userId, h.accounts.B.id);
  assert.equal(first.invitation.acceptedAt, '2026-10-07T00:00:00.000Z');
  assert.equal(first.membership.createdAt, first.invitation.acceptedAt);
  assert.deepEqual(again.membership, first.membership);
  assert.equal(Object.keys(h.state().members).length, 2);
  assert.equal(h.read('B').invitations.length, 0);
  assert.throws(() => h.run('B', 'respondInvite', { inviteId: invitation.id, decision: 'DECLINE' }), code('CONFLICT'));
  assert.throws(() => h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'b@example.com' }), code('CONFLICT'));
});

test('pending duplicate, expired, declined and revoked invitations cannot add memberships', () => {
  const h = harness();
  const campaign = h.campaign();
  const payload = { campaignId: campaign.id, email: 'b@example.com' };
  const expired = h.run('A', 'inviteMember', payload).invitation;
  assert.throws(() => h.run('A', 'inviteMember', payload), code('CONFLICT'));
  h.at(expired.expiresAt);
  assert.equal(h.read('B').invitations.length, 0);
  assert.equal(h.read('A', campaign.id).activeCampaign.invites[0].status, 'EXPIRED');
  assert.throws(() => h.run('B', 'respondInvite', { inviteId: expired.id, decision: 'ACCEPT' }), code('CONFLICT'));
  const declined = h.run('A', 'inviteMember', payload).invitation;
  h.run('B', 'respondInvite', { inviteId: declined.id, decision: 'DECLINE' });
  assert.throws(() => h.run('B', 'respondInvite', { inviteId: declined.id, decision: 'ACCEPT' }), code('CONFLICT'));
  const revoked = h.run('A', 'inviteMember', payload).invitation;
  h.run('A', 'revokeInvite', { inviteId: revoked.id }, revoked.version);
  assert.throws(() => h.run('B', 'respondInvite', { inviteId: revoked.id, decision: 'ACCEPT' }), code('CONFLICT'));
  assert.equal(Object.keys(h.state().members).length, 1);
});

test('missing and unauthorized invitation IDs return the same non-disclosing error', () => {
  const h = harness();
  const campaign = h.campaign();
  const foreign = h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'b@example.com' }).invitation;
  function errorFor(actor, operation, inviteId, expectedVersion) {
    try {
      h.run(actor, operation, { inviteId, ...(operation === 'respondInvite' ? { decision: 'ACCEPT' } : {}) }, expectedVersion);
      assert.fail('Expected invitation authorization failure');
    } catch (error) {
      return { code: error.code, message: error.message, status: error.status };
    }
  }
  const denied = { code: 'FORBIDDEN', message: 'Invitation access denied.', status: 403 };
  assert.deepEqual(errorFor('C', 'respondInvite', foreign.id), denied);
  assert.deepEqual(errorFor('C', 'respondInvite', 'invite:missing'), denied);
  assert.deepEqual(errorFor('C', 'revokeInvite', foreign.id, foreign.version), denied);
  assert.deepEqual(errorFor('C', 'revokeInvite', 'invite:missing', foreign.version), denied);
});

test('only owner assigns or removes elevated roles; Co-GM cannot elevate self', () => {
  const h = harness();
  const campaign = h.campaign();
  const b = h.join(campaign.id, 'B', 'CO_GM');
  const c = h.join(campaign.id, 'C');
  const bView = h.read('B', campaign.id).activeCampaign;
  assert.equal(bView.role, 'CO_GM');
  assert.equal(bView.campaign.notes, campaign.notes);
  assert.throws(() => h.run('B', 'setMemberRole', { campaignId: campaign.id, userId: b.userId, role: 'GM' }, b.version), code('FORBIDDEN'));
  assert.throws(() => h.run('B', 'inviteMember', { campaignId: campaign.id, email: 'd@example.com' }), code('FORBIDDEN'));
  const cGm = h.run('A', 'setMemberRole', { campaignId: campaign.id, userId: c.userId, role: 'GM' }, c.version).member;
  assert.throws(() => h.run('C', 'removeMember', { campaignId: campaign.id, userId: b.userId }, b.version), code('FORBIDDEN'));
  assert.throws(() => h.run('C', 'setMemberRole', { campaignId: campaign.id, userId: b.userId, role: 'PLAYER' }, b.version), code('FORBIDDEN'));
  assert.throws(() => h.run('C', 'inviteMember', { campaignId: campaign.id, email: 'd@example.com', role: 'CO_GM' }), code('FORBIDDEN'));
  assert.throws(() => h.run('C', 'setMemberRole', { campaignId: campaign.id, userId: c.userId, role: 'PLAYER' }, cGm.version), code('FORBIDDEN'));
  const owner = h.read('A', campaign.id).activeCampaign.members.find((m) => m.userId === h.accounts.A.id);
  assert.throws(() => h.run('A', 'removeMember', { campaignId: campaign.id, userId: owner.userId }, owner.version), code('FORBIDDEN'));
  assert.throws(() => h.run('A', 'setMemberRole', { campaignId: campaign.id, userId: owner.userId, role: 'PLAYER' }, owner.version), code('FORBIDDEN'));
  assert.throws(() => h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'd@example.com', role: 'GM' }), code('VALIDATION'));
});

test('non-owner GM manages Players and campaign fields without owner powers', () => {
  const h = harness();
  const campaign = h.campaign();
  const b = h.join(campaign.id, 'B');
  h.run('A', 'setMemberRole', { campaignId: campaign.id, userId: b.userId, role: 'GM' }, b.version);
  const invitation = h.run('B', 'inviteMember', { campaignId: campaign.id, email: 'c@example.com' }).invitation;
  const c = h.run('C', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' }).membership;
  const changed = h.run('B', 'updateCampaign', { campaignId: campaign.id, description: 'New public description' }, campaign.version).campaign;
  assert.equal(changed.description, 'New public description');
  h.run('B', 'removeMember', { campaignId: campaign.id, userId: c.userId }, c.version);
  assert.equal(h.read('C').campaigns.length, 0);
});

test('optimistic versions reject stale writes and require explicit version on edits', () => {
  const h = harness();
  const campaign = h.campaign();
  assert.throws(() => h.run('A', 'updateCampaign', { campaignId: campaign.id, name: 'New' }), code('VALIDATION'));
  const changed = h.run('A', 'updateCampaign', { campaignId: campaign.id, name: 'First edit' }, campaign.version).campaign;
  assert.equal(changed.version, 2);
  assert.throws(() => h.run('A', 'updateCampaign', { campaignId: campaign.id, name: 'Stale edit' }, campaign.version), code('CONFLICT'));
  assert.equal(h.read('A', campaign.id).activeCampaign.campaign.name, 'First edit');
  const b = h.join(campaign.id, 'B');
  h.run('A', 'setMemberRole', { campaignId: campaign.id, userId: b.userId, role: 'CO_GM' }, b.version);
  assert.throws(() => h.run('A', 'removeMember', { campaignId: campaign.id, userId: b.userId }, b.version), code('CONFLICT'));
  assert.throws(() => h.run('A', 'updatePreferences', { preferredLanguage: 'th' }, 99), code('CONFLICT'));
});

test('member removal and role downgrade apply immediately to reads, writes and replay', () => {
  const h = harness();
  const campaign = h.campaign();
  const b = h.join(campaign.id, 'B');
  const elevated = h.run('A', 'setMemberRole', { campaignId: campaign.id, userId: b.userId, role: 'GM' }, b.version).member;
  const editPayload = { campaignId: campaign.id, name: 'Saved by B' };
  h.run('B', 'updateCampaign', editPayload, campaign.version, 'b-edit');
  const demoted = h.run('A', 'setMemberRole', { campaignId: campaign.id, userId: b.userId, role: 'PLAYER' }, elevated.version).member;
  assert.throws(() => h.run('B', 'updateCampaign', editPayload, campaign.version, 'b-edit'), code('FORBIDDEN'));
  assert.equal(Object.hasOwn(h.read('B', campaign.id).activeCampaign.campaign, 'notes'), false);
  h.run('A', 'removeMember', { campaignId: campaign.id, userId: b.userId }, demoted.version);
  assert.equal(h.read('B').campaigns.length, 0);
  assert.throws(() => h.read('B', campaign.id), code('FORBIDDEN'));
  assert.throws(() => h.run('B', 'inviteMember', { campaignId: campaign.id, email: 'c@example.com' }), code('FORBIDDEN'));
});

test('removed member cannot replay an accepted invitation to restore access', () => {
  const h = harness();
  const campaign = h.campaign();
  const invitation = h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'b@example.com' }).invitation;
  const payload = { inviteId: invitation.id, decision: 'ACCEPT' };
  const member = h.run('B', 'respondInvite', payload, undefined, 'join-once').membership;
  h.run('A', 'removeMember', { campaignId: campaign.id, userId: member.userId }, member.version);
  assert.throws(() => h.run('B', 'respondInvite', payload, undefined, 'join-once'), code('FORBIDDEN'));
  assert.throws(() => h.run('B', 'respondInvite', payload), code('FORBIDDEN'));
  h.at('2026-10-08T00:00:00.000Z');
  const invitedAgain = h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'b@example.com' }).invitation;
  const rejoined = h.run('B', 'respondInvite', { inviteId: invitedAgain.id, decision: 'ACCEPT' }).membership;
  assert.equal(rejoined.id, member.id);
  assert.equal(rejoined.createdAt, member.createdAt);
  assert.equal(rejoined.joinedAt, '2026-10-08T00:00:00.000Z');
  assert.equal(rejoined.updatedAt, rejoined.joinedAt);
  assert.equal(rejoined.version, 3);
  assert.equal(Object.keys(h.state().members).length, 2);
});

test('idempotent mutation replay is canonical, isolated per user, and rejects request reuse', () => {
  const h = harness();
  const first = h.run('A', 'createCampaign', { name: 'Retry case', notes: 'secret' }, undefined, 'fixed');
  const again = h.run('A', 'createCampaign', { notes: 'secret', name: 'Retry case' }, undefined, 'fixed');
  assert.deepEqual(again, first);
  assert.equal(Object.keys(h.state().campaigns).length, 1);
  assert.equal(Object.keys(h.state().audit).length, 1);
  assert.throws(() => h.run('A', 'createCampaign', { name: 'Other case' }, undefined, 'fixed'), code('IDEMPOTENCY_CONFLICT'));
  h.run('B', 'createCampaign', { name: 'B case' }, undefined, 'fixed');
  assert.equal(Object.keys(h.state().campaigns).length, 2);
  const payload = { campaignId: first.campaign.id, name: 'Saved' };
  const edit = h.run('A', 'updateCampaign', payload, 1, 'edit');
  assert.deepEqual(h.run('A', 'updateCampaign', payload, 1, 'edit'), edit);
  assert.throws(() => h.run('A', 'updateCampaign', payload, 2, 'edit'), code('IDEMPOTENCY_CONFLICT'));
});

test('failed campaign and membership commits roll back all records and safely retry', () => {
  const h = harness();
  const before = h.state();
  h.failCommit();
  assert.throws(() => h.run('A', 'createCampaign', { name: 'Atomic' }, undefined, 'atomic-create'), /storage commit failure/);
  assert.deepEqual(h.state(), before);
  const campaign = h.run('A', 'createCampaign', { name: 'Atomic' }, undefined, 'atomic-create').campaign;
  const invitation = h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'b@example.com' }).invitation;
  const pending = h.state();
  h.failCommit();
  assert.throws(() => h.run('B', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' }, undefined, 'atomic-join'), /storage commit failure/);
  assert.deepEqual(h.state(), pending);
  h.run('B', 'respondInvite', { inviteId: invitation.id, decision: 'ACCEPT' }, undefined, 'atomic-join');
  assert.equal(Object.keys(h.state().members).length, 2);
  assert.equal(h.state().invites[invitation.id].status, 'ACCEPTED');
});

test('input bounds and language validation leave state unchanged without HTML names', () => {
  const h = harness();
  const before = h.state();
  for (const payload of [
    { name: '' }, { name: 'x'.repeat(121) }, { name: '<img src=x>' },
    { name: 'Fine', notes: 'x'.repeat(10001) }, { name: 'Fine', defaultLanguage: 'ja' }
  ]) assert.throws(() => h.run('A', 'createCampaign', payload), code('VALIDATION'));
  assert.deepEqual(h.state(), before);
  const campaign = h.campaign();
  assert.throws(() => h.run('A', 'inviteMember', { campaignId: campaign.id, email: 'invalid' }), code('VALIDATION'));
  assert.throws(() => h.run('A', 'updatePreferences', { preferredLanguage: 'TH' }, 1), code('VALIDATION'));
  assert.throws(() => h.run('A', 'createCampaign', { name: 'No ID' }, undefined, 'invalid request id'), code('VALIDATION'));
});

test('audit records carry actor, operation and target without invitation emails or private notes', () => {
  const h = harness();
  const campaign = h.campaign();
  h.join(campaign.id, 'B');
  const audit = Object.values(h.state().audit);
  assert.equal(audit.length, 3);
  for (const record of audit) {
    assert.deepEqual(Object.keys(record).sort(), ['actor', 'at', 'campaignId', 'id', 'operation', 'requestId', 'target']);
    assert.equal(record.at, '2026-10-07T00:00:00.000Z');
    assert.equal(record.campaignId, campaign.id);
    assert.match(record.requestId, /^request-/);
  }
  assert.equal(JSON.stringify(audit).includes('@example.com'), false);
  assert.equal(JSON.stringify(audit).includes('cultist'), false);
});

test('trusted Google display names keep literal markup characters as profile data', () => {
  const h = harness();
  const user = h.service.upsertUser({ sub: 'E', email: 'e@example.com', emailVerified: true, name: '<Emily & Ellis>' });
  assert.equal(user.displayName, '<Emily & Ellis>');
  assert.throws(() => h.service.upsertUser({ sub: 'F', email: 'f@example.com', emailVerified: true, name: 'Line\nBreak' }), code('VALIDATION'));
});
