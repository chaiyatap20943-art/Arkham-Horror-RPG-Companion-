'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const defaultOutput = path.join(root, 'dist/preview/arkham-preview.html');

function buildPreview(outputPath = defaultOutput) {
  const clientRoot = path.join(root, 'src/client');
  let html = fs.readFileSync(path.join(clientRoot, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include_\('([^']+)'\);?\s*\?>/g, (_, name) => {
    if (!['Styles', 'Client', 'Features'].includes(name)) throw new Error('Unexpected client include.');
    return fs.readFileSync(path.join(clientRoot, `${name}.html`), 'utf8');
  });
  if (html.includes('<?')) throw new Error('Unresolved Apps Script template.');

  // Dedicated export only: normal development and Apps Script builds retain real authentication.
  html = html.replace('<html lang="en">', '<html lang="th" data-arkham-offline-preview="true">');
  html = html.replace('<head>', `<head>
  <meta name="arkham-preview" content="offline-read-only">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <script>Object.defineProperty(window, 'ARKHAM_OFFLINE_PREVIEW', { value: true, writable: false, configurable: false });</script>`);

  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1], { filename: 'arkham-preview.html' });
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  return outputPath;
}

if (require.main === module) {
  console.log(`Built offline read-only preview: ${path.relative(root, buildPreview(process.argv[2] ? path.resolve(process.argv[2]) : defaultOutput))}`);
}

module.exports = { buildPreview, defaultOutput };
