/* Only doGet and api are remotely callable. Helpers end in _. */
function include_(name) {
  if (['Styles', 'Client'].indexOf(name) < 0) throw new Error('Unknown template.');
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
  return HtmlService.createHtmlOutput(html).setTitle('Arkham · Sign-in');
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.state || params.code || params.error) {
    try { return callbackHtml_(runtime_().auth.callback(params)); }
    catch (_) { return callbackHtml_({ error: 'Sign-in could not be completed. Return to the original tab and try again.' }); }
  }
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Arkham · Campaign Companion');
}

function api(request) {
  var requestId = request && typeof request.requestId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(request.requestId) ? request.requestId : randomId_();
  try {
    if (!request || typeof request !== 'object' || JSON.stringify(request).length > 30000) {
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
    var known = /^(AUTH_[A-Z_]+|UNAUTHENTICATED|AUTH_REQUIRED|FORBIDDEN|NOT_FOUND|VALIDATION|CONFLICT|IDEMPOTENCY_CONFLICT|CONFIGURATION|RATE_LIMITED)$/;
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
  var service = Arkham.createService({ store: store, now: function () { return new Date().toISOString(); }, id: randomId_, digest: digest_ });
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
  sheetsStore_().transact(function () { return true; });
}
