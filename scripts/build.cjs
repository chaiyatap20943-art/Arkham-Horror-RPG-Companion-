'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(path.join(output, 'apps-script'), { recursive: true });
fs.mkdirSync(path.join(output, 'web'), { recursive: true });
for (const name of fs.readdirSync(path.join(root, 'src/server')).filter(n => n.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(root, 'src/server', name), 'utf8');
  new vm.Script(text, { filename: name });
  fs.writeFileSync(path.join(output, 'apps-script', name.replace(/\.js$/, '.gs')), text);
}
for (const name of ['Index', 'Styles', 'Client']) {
  const text = fs.readFileSync(path.join(root, 'src/client', `${name}.html`), 'utf8');
  fs.writeFileSync(path.join(output, 'apps-script', `${name}.html`), text);
}
fs.copyFileSync(path.join(root, 'src/appsscript.json'), path.join(output, 'apps-script/appsscript.json'));
let index = fs.readFileSync(path.join(root, 'src/client/Index.html'), 'utf8');
index = index.replace(/<\?!=\s*include_\('([^']+)'\);?\s*\?>/g, (_, name) => {
  if (!['Styles', 'Client'].includes(name)) throw new Error('Unexpected include');
  return fs.readFileSync(path.join(root, 'src/client', `${name}.html`), 'utf8');
});
if (index.includes('<?')) throw new Error('Unresolved Apps Script template.');
for (const script of index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1], { filename: 'Client.html' });
fs.writeFileSync(path.join(output, 'web/index.html'), index);
console.log('Built Apps Script deployment files and local web interface.');
