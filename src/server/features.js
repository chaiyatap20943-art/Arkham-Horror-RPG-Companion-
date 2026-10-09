/* Full campaign workflows. All state changes share the atomic Sheets transaction. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;
Arkham.handlers = Arkham.handlers || {};

Arkham.createFullService = function (dependencies) {
  'use strict';
  var base = Arkham.createService(dependencies);
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var clone = Arkham.clone;
  function fail(code, message) { var e = new Error(message); e.code = code; e.status = code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 400; throw e; }
  function fields(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('VALIDATION', label + ' must be an object.');
    Object.keys(value).forEach(function (key) { if (allowed.indexOf(key) < 0) fail('VALIDATION', 'Unsupported ' + label + ' field: ' + key); });
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function normalize(state) {
    Object.keys(Arkham.tables).forEach(function (key) {
      if (!has(state, key)) state[key] = {};
      if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) fail('CONFIGURATION', 'Incompatible database table: ' + key);
    });
    return state;
  }
  function context(state, userId, request, effects) {
    var user = state.users[userId];
    if (!has(state.users, userId) || !user.emailVerified) fail('AUTH_REQUIRED', 'Sign in with a verified Google account.');
    var campaignId = request.payload.campaignId;
    if (typeof campaignId !== 'string' || !campaignId || campaignId.length > 512) fail('VALIDATION', 'A campaignId is required.');
    var campaign = state.campaigns[campaignId];
    var membership = state.members[campaignId + ':' + userId];
    if (!has(state.campaigns, campaignId) || !membership || membership.status !== 'ACTIVE') fail('FORBIDDEN', 'Campaign access denied.');
    var at = dependencies.now();
    var ctx = { state: state, user: user, campaign: campaign, membership: membership, request: request,
      isGM: membership.role === 'GM' || membership.role === 'CO_GM', isOwner: campaign.ownerUserId === user.id,
      at: at, dependencies: dependencies, clone: clone, fail: fail, fields: fields, effects: effects || [] };
    ctx.mustGM = function () { if (!ctx.isGM) fail('FORBIDDEN', 'GM or Co-GM permission required.'); };
    ctx.activeMember = function (id) { var m = state.members[campaignId + ':' + id]; return !!m && m.status === 'ACTIVE'; };
    ctx.record = function (table, id) {
      if (typeof id !== 'string' || !state[table] || !has(state[table], id) || state[table][id].campaignId !== campaignId) fail('FORBIDDEN', 'Object access denied.');
      return state[table][id];
    };
    ctx.own = function (record) { if (!ctx.isGM && record.ownerUserId !== userId) fail('FORBIDDEN', 'Investigator ownership required.'); };
    ctx.records = function (table) { return Object.keys(state[table] || {}).map(function (id) { return state[table][id]; }).filter(function (record) { return record.campaignId === campaignId; }); };
    ctx.version = function (record) {
      if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) fail('VALIDATION', 'A positive expectedVersion is required.');
      if (request.expectedVersion !== record.version) fail('CONFLICT', 'This record changed. Refresh before saving.');
    };
    ctx.touch = function (record) { record.version = (record.version || 1) + 1; record.updatedAt = at; return record; };
    ctx.text = function (value, label, max, required) {
      if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) fail('VALIDATION', 'Invalid ' + label + '.');
      return value.trim();
    };
    ctx.integer = function (value, min, max, label) { if (!Number.isInteger(value) || value < min || value > max) fail('VALIDATION', 'Invalid ' + label + '.'); return value; };
    ctx.id = function (prefix, table) {
      for (var i = 0; i < 5; i++) {
        var suffix = dependencies.id();
        if (typeof suffix !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(suffix)) fail('SERVER_ERROR', 'ID generation failed.');
        var id = prefix + ':' + suffix;
        if (!has(state[table], id)) return id;
      }
      fail('SERVER_ERROR', 'ID generation failed.');
    };
    ctx.canView = function (record) {
      if (!record || record.campaignId !== campaignId) return false;
      switch (record.visibility) {
        case 'CAMPAIGN_PLAYERS': case 'CAMPAIGN': return true;
        case 'CO_GM': case 'GM_AND_CO_GM': return ctx.isGM;
        case 'GM_ONLY': return membership.role === 'GM';
        case 'SELECTED_PLAYERS': case 'SELECTED': return ctx.isGM || (record.selectedUserIds || []).indexOf(userId) >= 0;
        case 'OWNER_ONLY': return (record.ownerUserId || record.createdBy || record.actor) === userId;
        default: return ctx.isGM;
      }
    };
    ctx.characterView = function (record) { return Arkham.characterView ? Arkham.characterView(ctx, record) : null; };
    return ctx;
  }
  function projectBootstrap(userId, request) {
    return dependencies.store.read(function (raw) {
      var state = normalize(raw);
      // Project campaign and feature records from the same snapshot, including current roles.
      var snapshotDependencies=Object.assign({},dependencies,{store:{read:function(fn){return fn(state);},transact:function(){fail('SERVER_ERROR','Read-only projection.');}}});
      var response=Arkham.createService(snapshotDependencies).execute(userId,request);
      response.campaigns.forEach(function (c) { c.sessionCount = Object.keys(state.sessions).filter(function (id) { return state.sessions[id].campaignId === c.id; }).length; });
      if (!response.activeCampaign) return response;
      var ctx = context(state, userId, request);
      var selected = response.activeCampaign;
      selected.role=ctx.membership.role;selected.isOwner=ctx.isOwner;
      if (!ctx.isGM) { delete selected.campaign.notes; selected.invites = []; }
      selected.characters = ctx.records('characters').map(ctx.characterView).filter(Boolean);
      selected.sessions = ctx.records('sessions').sort(function (a,b) { return (b.number || 0) - (a.number || 0); }).slice(0, 50).map(function (r) { return Arkham.sessionView ? Arkham.sessionView(ctx,r) : clone(r); });
      selected.attendance = ctx.records('attendance').filter(function (r) { return selected.sessions.some(function (s) { return s.id === r.sessionId; }); }).map(clone);
      selected.scenes = ctx.records('scenes').map(function (r) { return Arkham.storyView ? Arkham.storyView(ctx,r) : null; }).filter(Boolean);
      selected.assets = ctx.records('assets').map(function (r) { return Arkham.storyView ? Arkham.storyView(ctx,r) : null; }).filter(Boolean);
      selected.rolls = ctx.records('rolls').filter(ctx.canView).sort(function(a,b) {return b.createdAt.localeCompare(a.createdAt);}).slice(0,50).map(clone);
      selected.xpLedger=ctx.records('xpLedger').filter(function(r){var c=state.characters[r.characterId];return ctx.isGM||(c&&c.ownerUserId===userId);}).sort(function(a,b){return (b.createdAt||'').localeCompare(a.createdAt||'');}).slice(0,50).map(clone);
      selected.events = ctx.records('events').filter(ctx.canView).sort(function(a,b) {return b.createdAt.localeCompare(a.createdAt);}).slice(0,50).map(function(r) { return Arkham.storyView ? Arkham.storyView(ctx,r) : clone(r); }).filter(Boolean);
      selected.snapshots = ctx.records('snapshots').filter(function(r){return r.kind==='SNAPSHOT';}).sort(function(a,b) {return b.createdAt.localeCompare(a.createdAt);}).slice(0,50).map(function(r) { return Arkham.snapshotView ? Arkham.snapshotView(ctx,r) : null; }).filter(Boolean);
      selected.materials = ctx.records('materials').filter(ctx.canView).map(function(r) { var v=clone(r); delete v.driveFileId; delete v.base64; return v; });
      selected.catalog = clone(Arkham.catalog || {});
      selected.schemaVersion = 1;
      selected.rulesVersion = (Arkham.catalog || {}).sourceVersion || 'unconfigured';
      selected.serverTime = ctx.at;
      return response;
    });
  }
  function execute(userId, request) {
    if (!request || typeof request !== 'object') fail('VALIDATION', 'Invalid request.');
    if (request.operation === 'bootstrap') return projectBootstrap(userId, request);
    if (!has(Arkham.handlers, request.operation)) return base.execute(userId,request);
    var spec = Arkham.handlers[request.operation];
    fields(request,['operation','payload','expectedVersion','requestId'],'request');
    fields(request.payload,spec.fields,'payload');
    if (spec.mutation && (typeof request.requestId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(request.requestId))) fail('VALIDATION','A unique requestId is required.');
    var effects=[];
    var prepared;
    var applied=false;
    var reused=false;
    function fingerprintFor() {return dependencies.digest(canonical({operation:request.operation,payload:request.payload,expectedVersion:has(request,'expectedVersion')?request.expectedVersion:null}));}
    var run = function(raw) {
      var state = normalize(raw);
      var ctx = context(state,userId,request,effects);
      ctx.prepared=prepared;
      if (spec.authorize) spec.authorize(ctx,request.payload,request);
      if (!spec.mutation) return clone(spec.run(ctx,request.payload,request));
      var key = userId + ':' + request.requestId;
      var fingerprint = fingerprintFor();
      var previous = state.mutations[key];
      if (has(state.mutations,key)) {
        if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT','This requestId was already used for another request.');
        // Fresh object/role authorization already ran above. Never replay secret projections blindly.
        return clone(spec.replay ? spec.replay(ctx,request.payload,previous.result) : previous.result);
      }
      var result = spec.run(ctx,request.payload,request);
      applied=true;
      var auditId = ctx.id('audit','audit');
      state.audit[auditId] = {id:auditId,campaignId:ctx.campaign.id,actor:userId,operation:request.operation,requestId:request.requestId,at:ctx.at};
      var receipt=spec.receipt ? spec.receipt(ctx,result,request.payload) : result;
      state.mutations[key] = {id:key,userId:userId,campaignId:ctx.campaign.id,operation:request.operation,requestId:request.requestId,fingerprint:fingerprint,result:clone(receipt),createdAt:ctx.at};
      return clone(result);
    };
    var result;
    try {
      if(spec.prepare){
        var preparation=dependencies.store.read(function(raw){
          var state=normalize(raw),ctx=context(state,userId,request,effects);
          if(spec.authorize)spec.authorize(ctx,request.payload,request);
          var previous=state.mutations[userId+':'+request.requestId];
          if(previous){
            if(previous.fingerprint!==fingerprintFor())fail('IDEMPOTENCY_CONFLICT','This requestId was already used for another request.');
            return {reused:true,result:clone(spec.replay?spec.replay(ctx,request.payload,previous.result):previous.result)};
          }
          return {reused:false,prepared:spec.prepare(ctx,request.payload,request)};
        });
        if(preparation.reused){reused=true;result=preparation.result;}else prepared=preparation.prepared;
      }
      if(!reused)result=(spec.mutation ? dependencies.store.transact : dependencies.store.read)(run);
    }
    catch(error) {
      effects.forEach(function(e){if(e.kind==='file' && dependencies.files){try{dependencies.files({action:'remove',fileId:e.fileId});}catch(_){/* Owner cleanup can recover the marked private orphan. */}}});
      throw error;
    }
    effects.forEach(function(e){if(e.kind==='file' && dependencies.files){try{dependencies.files({action:applied?'commit':'remove',fileId:e.fileId});}catch(_){/* Marker recovery checks committed records before removing a private file. */}}});
    return result;
  }
  return {upsertUser:base.upsertUser,execute:execute};
};
