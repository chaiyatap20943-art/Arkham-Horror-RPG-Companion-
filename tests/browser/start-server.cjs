// Test-only authenticated sessions: no login bypass is part of the application.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { runtime, fileVault } = require('../../scripts/node-runtime.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arkham-browser-'));
process.env.ARKHAM_LOCAL_DIR = directory;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
const current = runtime({ directory });
const users = {};
for (const [label, email] of [['A', 'gm@example.com'], ['B', 'player@example.com'], ['C', 'stranger@example.com']]) {
  users[label] = current.service.upsertUser({ sub: `browser-${label}`, email, emailVerified: true, name: `Account ${label}` });
  const token = `browser-test-session-${label}`.padEnd(64, label);
  fileVault(path.join(directory, 'private-auth.json')).set(`auth:session:${crypto.createHash('sha256').update(token).digest('hex')}`, { userId: users[label].id, expiresAt: Date.now() + 3600000 });
}
current.service.execute(users.A.id, { operation: 'createCampaign', payload: { name: 'The Miskatonic Files', description: 'An isolated browser test campaign', notes: 'UNREVEALED_TEST_SECRET', defaultLanguage: 'en' }, requestId: 'browser-seed-campaign' });
require('../../scripts/dev-server.cjs');
