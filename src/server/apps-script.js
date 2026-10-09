/* Only doGet and api are remotely callable. Helpers end in _. */
function include_(name) {
  if (['Styles', 'Client', 'Features'].indexOf(name) < 0) throw new Error('Unknown template.');
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function safeJson_(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function callbackHtml_(result) {
  var data = safeJson_(result);
  var html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Arkham · Google sign-in</title><style>body{background:#171c19;color:#eee6d4;font:18px Georgia;margin:0;padding:48px 24px}main{max-width:600px;margin:auto}code{display:block;overflow-wrap:anywhere;padding:20px;background:#27312b}button{padding:12px;margin-top:12px}p{line-height:1.6}</style>' +
    '<main><h1>Return to your companion</h1><p id="status"></p><code id="ticket"></code><button id="copy" hidden>Copy one-time ticket</button>' +
    '<p>This ticket can only complete sign-in in the original tab. It expires in ten minutes. No Google token is shared with the app window.</p></main>' +
    '<script>const result=' + data + ';document.getElementById("status").textContent=result.error||"You can return to the original tab. If it does not sign in automatically, copy this one-time ticket into that tab.";' +
    'if(result.ticket){document.getElementById("ticket").textContent=result.ticket;const b=document.getElementById("copy");b.hidden=false;b.onclick=()=>navigator.clipboard.writeText(result.ticket).then(()=>b.textContent="Copied").catch(()=>b.textContent="Select and copy the ticket above");' +
    '}' +
    '</script></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Arkham · Sign-in').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.state || params.code || params.error) {
    try { return callbackHtml_(runtime_().auth.callback(params)); }
    catch (_) { return callbackHtml_({ error: 'Sign-in could not be completed. Return to the original tab and try again.' }); }
  }
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Arkham · Campaign Companion').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function api(request) {
  var requestId = request && typeof request.requestId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(request.requestId) ? request.requestId : randomId_();
  try {
    var maximum = request && request.operation === 'uploadMaterial' ? 1100000 : request && request.operation === 'restoreCampaign' ? 4000000 : request && request.operation === 'importEntities' ? 600000 : 30000;
    if (!request || typeof request !== 'object' || Array.isArray(request) || JSON.stringify(request).length > maximum) {
      throw Object.assign(new Error('Invalid request.'), { code: 'VALIDATION' });
    }
    if (request.operation === 'publicConfig') {
      var properties = PropertiesService.getScriptProperties();
      var required = ['DATABASE_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL'];
      var missing = required.filter(function (key) { return !properties.getProperty(key); });
      return { ok: true, requestId: requestId, data: { configured: !missing.length, missingSettings: missing, mode: 'production' } };
    }
    var runtime = runtime_();
    var data;
    if (request.operation === 'beginLogin') data = runtime.auth.beginLogin(request.payload || {});
    else if (request.operation === 'finishLogin') data = runtime.auth.finishLogin(request.payload || {});
    else if (request.operation === 'pollLogin') data = runtime.auth.pollLogin(request.payload || {});
    else if (request.operation === 'logout') data = runtime.auth.logout(request.sessionToken);
    else {
      var userId = runtime.auth.authorize(request.sessionToken);
      var domainRequest = Object.assign({}, request);
      delete domainRequest.sessionToken;
      data = runtime.service.execute(userId, domainRequest);
    }
    return { ok: true, requestId: requestId, data: data };
  } catch (error) {
    var known = /^(AUTH_[A-Z_]+|UNAUTHENTICATED|AUTH_REQUIRED|FORBIDDEN|NOT_FOUND|VALIDATION|CONFLICT|IDEMPOTENCY_CONFLICT|CONFIGURATION|RATE_LIMITED|SOURCE_UNAVAILABLE|RULE_NOT_VERIFIED)$/;
    var code = known.test(error.code || '') ? error.code : 'SERVER_ERROR';
    if (code === 'UNAUTHENTICATED') code = 'AUTH_REQUIRED';
    return { ok: false, requestId: requestId, error: { code: code, message: code === 'SERVER_ERROR' ? 'The request could not be completed. Try again.' : error.message } };
  }
}

function authConfig_() {
  var props = PropertiesService.getScriptProperties();
  return { clientId: props.getProperty('GOOGLE_CLIENT_ID'), clientSecret: props.getProperty('GOOGLE_CLIENT_SECRET'), redirectUri: props.getProperty('APP_URL'), mode: 'production' };
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join('');
}

function randomId_() { return Utilities.getUuid().replace(/-/g, ''); }

function runtime_() {
  var store = sheetsStore_();
  var create = typeof Arkham.createFullService === 'function' ? Arkham.createFullService : Arkham.createService;
  var service = create({ store: store, now: function () { return new Date().toISOString(); }, id: randomId_, digest: digest_,
    d6: function () { return Math.floor(Math.random() * 6) + 1; },
    ai: typeof googleAI_ === 'function' ? googleAI_ : undefined,
    files: typeof googleFiles_ === 'function' ? googleFiles_ : undefined });
  var auth = Arkham.createAuth({ config: authConfig_(), vault: scriptVault_(), nowMs: Date.now, id: randomId_, digest: digest_, service: service, http: googleHttp_ });
  return { service: service, auth: auth };
}

function googleHttp_(url, options) {
  if (['https://oauth2.googleapis.com/token', 'https://openidconnect.googleapis.com/v1/userinfo'].indexOf(url) < 0) {
    throw new Error('Unknown identity destination.');
  }
  var request = { method: (options.method || 'GET').toLowerCase(), headers: options.headers || {}, muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true };
  if (options.body) request.payload = options.body;
  var response = UrlFetchApp.fetch(url, request);
  var json;
  try { json = JSON.parse(response.getContentText()); } catch (_) { json = {}; }
  return { status: response.getResponseCode(), json: json };
}

function scriptVault_() {
  var props = PropertiesService.getScriptProperties();
  return {
    get: function (key) { var raw = props.getProperty('private:' + key); return raw ? JSON.parse(raw) : null; },
    set: function (key, value) { props.setProperty('private:' + key, JSON.stringify(value)); },
    delete: function (key) { props.deleteProperty('private:' + key); },
    entries: function (prefix) {
      var all = props.getProperties();
      return Object.keys(all).filter(function (key) { return key.indexOf('private:' + prefix) === 0; })
        .map(function (key) { return { key: key.slice(8), value: JSON.parse(all[key]) }; });
    },
    locked: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { return fn(); } finally { lock.releaseLock(); }
    }
  };
}

function sheetsStore_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!spreadsheetId) throw Object.assign(new Error('Set DATABASE_ID in Script Properties.'), { code: 'CONFIGURATION' });
  var headers = ['RecordKey', 'CreatedAt', 'UpdatedAt', 'Version', 'DataJSON'];
  function load() {
    var metadata = Sheets.Spreadsheets.get(spreadsheetId, { fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))' });
    var byName = {};
    (metadata.sheets || []).forEach(function (sheet) { byName[sheet.properties.title] = sheet.properties; });
    var state = Arkham.emptyState();
    var tableKeys = Object.keys(Arkham.tables);
    var present = tableKeys.filter(function (key) { return byName[Arkham.tables[key]]; });
    if (present.length) {
      var ranges = present.map(function (key) { return "'" + Arkham.tables[key] + "'!A:E"; });
      var batch = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, { ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE' });
      present.forEach(function (key, index) {
        var rows = batch.valueRanges[index].values || [];
        if (rows.length && JSON.stringify(rows[0]) !== JSON.stringify(headers)) throw new Error('Database schema does not match.');
        state[key] = Arkham.unpackRows(rows.slice(1));
      });
    }
    return { state: state, byName: byName, metadata: metadata };
  }
  function commit(before, after, meta) {
    var requests = [];
    var usedIds = (meta.metadata.sheets || []).map(function (sheet) { return sheet.properties.sheetId; });
    Object.keys(Arkham.tables).forEach(function (key, index) {
      var name = Arkham.tables[key];
      var sheet = meta.byName[name];
      if (sheet && JSON.stringify(before[key]) === JSON.stringify(after[key])) return;
      var sheetId = sheet ? sheet.sheetId : 700000 + index;
      while (!sheet && usedIds.indexOf(sheetId) >= 0) sheetId += 100;
      usedIds.push(sheetId);
      var data = [headers].concat(Arkham.packRows(after[key]));
      var rows = Math.max(data.length, 100);
      if (!sheet) requests.push({ addSheet: { properties: { sheetId: sheetId, title: name, gridProperties: { rowCount: rows, columnCount: 5, frozenRowCount: 1 } } } });
      else if (sheet.gridProperties.rowCount < rows) requests.push({ appendDimension: { sheetId: sheetId, dimension: 'ROWS', length: rows - sheet.gridProperties.rowCount } });
      requests.push({ updateCells: {
        range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: Math.max(rows, sheet ? sheet.gridProperties.rowCount : 0), startColumnIndex: 0, endColumnIndex: 5 },
        rows: data.map(Arkham.stringCells), fields: 'userEnteredValue'
      } });
    });
    // One Sheets API batch is atomic. Invalid writes leave every table unchanged.
    // Includes business records, idempotency result, and audit together.
    if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheetId);
  }
  return {
    read: function (fn) { return fn(load().state); },
    transact: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        var snapshot = load();
        var draft = Arkham.clone(snapshot.state);
        var result = fn(draft);
        commit(snapshot.state, draft, snapshot);
        return result;
      } finally { lock.releaseLock(); }
    }
  };
}

// Run from the Apps Script editor once. It creates missing tables only.
// The trailing underscore prevents invocation through google.script.run.
function initializeDatabase_() {
  sheetsStore_().transact(function (state) {
    if (typeof Arkham.seedCatalogForCampaign === 'function') Object.keys(state.campaigns).forEach(function (id) {
      Arkham.seedCatalogForCampaign(state, state.campaigns[id], new Date().toISOString());
      if (typeof Arkham.seedGMCatalogForCampaign === 'function') Arkham.seedGMCatalogForCampaign(state, state.campaigns[id], new Date().toISOString());
    });
    return true;
  });
}

// Run manually as the installation owner in the Apps Script editor.
// Private helper: no RPC operation exposes configuration or database diagnostics.
// Reads only configuration, metadata and table headers. Never initializes data.
function checkInstallation_() {
  var required = ['DATABASE_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL'];
  var properties = PropertiesService.getScriptProperties();
  var values = {};
  var report = {
    ready: false,
    missingSettings: [],
    invalidSettings: [],
    sheetsServiceEnabled: !!(typeof Sheets !== 'undefined' && Sheets && Sheets.Spreadsheets &&
      typeof Sheets.Spreadsheets.get === 'function' && Sheets.Spreadsheets.Values &&
      typeof Sheets.Spreadsheets.Values.batchGet === 'function'),
    database: { status: 'NOT_CHECKED', tables: [], missingTables: [], incompatibleTables: [] },
    actions: []
  };
  var validators = {
    DATABASE_ID: function (value) { return /^[A-Za-z0-9_-]{1,256}$/.test(value); },
    GOOGLE_CLIENT_ID: function (value) { return /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value); },
    GOOGLE_CLIENT_SECRET: function (value) { return value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value); },
    APP_URL: function (value) { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value); }
  };
  required.forEach(function (key) {
    var value = properties.getProperty(key);
    if (typeof value !== 'string' || !value.trim()) report.missingSettings.push(key);
    else if (!validators[key](value)) report.invalidSettings.push(key);
    else values[key] = value;
  });
  if (report.missingSettings.length) {
    report.actions.push('Set the missing key names listed in Script Properties. Keep their values private.');
  }
  if (report.invalidSettings.length) {
    report.actions.push('Review the invalid key names: DATABASE_ID must be the spreadsheet ID; GOOGLE_CLIENT_ID must identify a Web application OAuth client; APP_URL must be the published /exec URL.');
  }
  if (!report.sheetsServiceEnabled) {
    report.actions.push('Enable the Google Sheets advanced service in Apps Script Services and the Google Sheets API in the linked Cloud project.');
  }
  if (values.DATABASE_ID && report.sheetsServiceEnabled) {
    try {
      var expected = Object.keys(Arkham.tables).map(function (key) { return Arkham.tables[key]; });
      var metadata = Sheets.Spreadsheets.get(values.DATABASE_ID, { fields: 'sheets(properties(title))' });
      var present = (metadata.sheets || []).map(function (sheet) { return sheet.properties.title; });
      report.database.tables = expected.filter(function (name) { return present.indexOf(name) !== -1; });
      report.database.missingTables = expected.filter(function (name) { return present.indexOf(name) === -1; });
      if (report.database.tables.length) {
        var ranges = report.database.tables.map(function (name) { return "'" + name + "'!A1:E1"; });
        var headers = ['RecordKey', 'CreatedAt', 'UpdatedAt', 'Version', 'DataJSON'];
        var batch = Sheets.Spreadsheets.Values.batchGet(values.DATABASE_ID, { ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE' });
        report.database.tables.forEach(function (name, index) {
          var rows = batch.valueRanges && batch.valueRanges[index] && batch.valueRanges[index].values;
          if (!rows || JSON.stringify(rows[0]) !== JSON.stringify(headers)) report.database.incompatibleTables.push(name);
        });
      }
      if (report.database.incompatibleTables.length) {
        report.database.status = 'SCHEMA_MISMATCH';
        report.actions.push('Back up the database and review the listed table headers against the documented schema. Resolve the mismatch before initialization or app use.');
      } else if (report.database.missingTables.length) {
        report.database.status = 'NEEDS_INITIALIZATION';
        report.actions.push('Run initializeDatabase_ once from the Apps Script editor to add missing application tables, then rerun checkInstallation_.');
      } else {
        report.database.status = 'READY';
      }
    } catch (_) {
      report.database.status = 'UNAVAILABLE';
      report.actions.push('Check DATABASE_ID, spreadsheet access for the installation owner, Apps Script authorization, and whether the Google Sheets API is enabled.');
    }
  }
  report.ready = !report.missingSettings.length && !report.invalidSettings.length &&
    report.sheetsServiceEnabled && report.database.status === 'READY';
  if (report.ready) {
    report.actions.push('Installation checks passed. Test sign-in using two real Google accounts on the published app to verify OAuth and account isolation.');
  }
  // Only the explicitly constructed report is logged; never values or raw errors.
  console.log(JSON.stringify(report));
  return report;
}
