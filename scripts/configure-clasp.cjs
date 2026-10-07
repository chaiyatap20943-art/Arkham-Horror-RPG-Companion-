'use strict';
const fs = require('node:fs');
const scriptId = process.argv[2];
if (!scriptId || !/^[A-Za-z0-9_-]{20,200}$/.test(scriptId)) {
  console.error('Usage: npm run configure -- YOUR_APPS_SCRIPT_PROJECT_ID');
  process.exit(1);
}
if (fs.existsSync('.clasp.json')) {
  console.error('.clasp.json already exists. Review it before changing the target project.');
  process.exit(1);
}
fs.writeFileSync('.clasp.json', JSON.stringify({ scriptId, rootDir: 'dist/apps-script' }, null, 2) + '\n', { mode: 0o600 });
console.log('Created local .clasp.json. No upload or deployment performed.');
