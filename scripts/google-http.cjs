'use strict';
const fs = require('node:fs');
(async () => {
  const { url, options } = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!['https://oauth2.googleapis.com/token', 'https://openidconnect.googleapis.com/v1/userinfo'].includes(url)) throw new Error('Unsupported destination');
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  let json = {};
  try { json = await response.json(); } catch (_) { /* Provider failure is classified by auth. */ }
  process.stdout.write(JSON.stringify({ status: response.status, json }));
})().catch(() => { process.exitCode = 1; });
