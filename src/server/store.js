/* Portable data format and atomic change planning. No application credentials. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;
(function (A) {
  'use strict';
  A.tables = {
    users: 'Users', campaigns: 'Campaigns', members: 'CampaignMembers',
    invites: 'CampaignInvites', mutations: 'MutationRequests', audit: 'AuditLog',
    characters: 'Characters', sessions: 'Sessions', attendance: 'SessionPlayers',
    snapshots: 'SessionSnapshots', scenes: 'Scenes', assets: 'StoryAssets',
    events: 'JournalEvents', rolls: 'DiceRolls', xpLedger: 'XPLedger',
    books: 'Books', entities: 'GameEntities', translations: 'Translations',
    materials: 'Materials', aiHistory: 'AIHistory', backups: 'Backups', imports: 'ImportCheckpoints'
  };
  A.emptyState = function () {
    var state = {};
    Object.keys(A.tables).forEach(function (key) { state[key] = {}; });
    return state;
  };
  A.clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  A.packRows = function (records) {
    return Object.keys(records).sort().map(function (key) {
      var row = records[key];
      var json = JSON.stringify(row);
      if (json.length > 40000) {
        var error = new Error('Record is too large for storage.'); error.code = 'VALIDATION'; throw error;
      }
      return [key, row.createdAt || row.at || '', row.updatedAt || row.at || row.createdAt || '', String(row.version || 1), json];
    });
  };
  A.unpackRows = function (rows) {
    var records = {};
    rows.forEach(function (row) {
      if (!row[0]) return;
      if (typeof row[4] !== 'string') throw new Error('Invalid database row.');
      var key = String(row[0]);
      if (Object.prototype.hasOwnProperty.call(records, key) || key === '__proto__' || key === 'constructor') {
        throw new Error('Duplicate or invalid database key.');
      }
      records[key] = JSON.parse(row[4]);
    });
    return records;
  };
  A.stringCells = function (row) {
    return { values: row.map(function (value) { return { userEnteredValue: { stringValue: String(value) } }; }) };
  };
  if (typeof module !== 'undefined') module.exports = A;
})(Arkham);
