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
for (const name of ['Index', 'Styles', 'Client', 'Features'].filter(n => fs.existsSync(path.join(root, 'src/client', `${n}.html`)))) {
  const text = fs.readFileSync(path.join(root, 'src/client', `${name}.html`), 'utf8');
  fs.writeFileSync(path.join(output, 'apps-script', `${name}.html`), text);
}
fs.copyFileSync(path.join(root, 'src/appsscript.json'), path.join(output, 'apps-script/appsscript.json'));
let index = fs.readFileSync(path.join(root, 'src/client/Index.html'), 'utf8');
index = index.replace(/<\?!=\s*include_\('([^']+)'\);?\s*\?>/g, (_, name) => {
  if (!['Styles', 'Client', 'Features'].includes(name)) throw new Error('Unexpected include');
  return fs.readFileSync(path.join(root, 'src/client', `${name}.html`), 'utf8');
});
if (index.includes('<?')) throw new Error('Unresolved Apps Script template.');
for (const script of index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1], { filename: 'Client.html' });
fs.writeFileSync(path.join(output, 'web/index.html'), index);

if (!process.argv.includes('--release')) {
  console.log('Built Apps Script deployment files and local interface in ignored dist/.');
  process.exit(0);
}

// A checked-in, paste-ready release. Installation does not require Node or clasp.
const ready = path.join(root, 'google-apps-script');
fs.mkdirSync(ready, { recursive: true });
const serverOrder = ['store', 'domain', 'catalog', 'gm-catalog', 'investigators', 'play', 'story', 'library', 'features', 'google-services', 'auth', 'apps-script'];
const code = '// Generated from src/server by npm run release. Paste this entire file into Code.gs.\n' + serverOrder.map(name => {
  const filename = path.join(root, 'src/server', `${name}.js`);
  if (!fs.existsSync(filename)) throw new Error(`Required release module is missing: ${name}`);
  return `\n// ${name}.js\n` + fs.readFileSync(filename, 'utf8');
}).join('\n');
new vm.Script(code, { filename: 'Code.gs' });
fs.writeFileSync(path.join(ready, 'Code.gs'), code);
const releaseFiles = { 'Code.gs': code };
for (const name of ['Index', 'Styles', 'Client', 'Features']) {
  const contents = fs.readFileSync(path.join(root, 'src/client', `${name}.html`), 'utf8');
  releaseFiles[`${name}.html`] = contents;
  fs.writeFileSync(path.join(ready, `${name}.html`), contents);
}
releaseFiles['appsscript.json'] = fs.readFileSync(path.join(root, 'src/appsscript.json'), 'utf8');
fs.writeFileSync(path.join(ready, 'appsscript.json'), releaseFiles['appsscript.json']);
const serialized = JSON.stringify(releaseFiles).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const installer = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; object-src 'none'; base-uri 'none'"><title>Arkham · ติดตั้ง Google Apps Script</title><style>body{font:17px system-ui,sans-serif;background:#17201c;color:#eee7d6;margin:0;padding:24px}main{max-width:1000px;margin:auto}a{color:#e1c488}p,li{line-height:1.8}button{font:inherit;background:#d9c79f;color:#17201c;border:0;border-radius:8px;padding:12px;cursor:pointer;margin:8px}select{font:inherit;padding:12px;max-width:100%;margin:8px}textarea{width:100%;box-sizing:border-box;height:55vh;font:13px monospace;padding:12px;background:#fff;color:#111}code{overflow-wrap:anywhere}h1{font-size:28px}.status{min-height:2em;color:#e1c488}</style></head><body><main><h1>Arkham RPG Companion — Full Code สำหรับ Apps Script</h1><p>ไฟล์นี้เป็นตัวช่วยคัดลอกโค้ดลง Google Apps Script ไม่ต้องติดตั้ง Node บน Mac แอปจริงเปิดผ่าน URL หลัง Deploy และบันทึกข้อมูลลง Google Sheets</p><ol><li>เปิด <a href="https://script.google.com/home/start" target="_blank" rel="noopener noreferrer">Google Apps Script</a> และสร้าง New project</li><li>แทนที่เนื้อหา Code.gs ด้วยโค้ด Code.gs ด้านล่าง แล้วสร้าง HTML ชื่อ Index, Styles, Client, Features ตามตัวเลือก (ไม่พิมพ์ .html ในช่องชื่อของ editor)</li><li>Project Settings → เปิด Show appsscript.json manifest file in editor แล้ววาง appsscript.json</li><li>ทำตาม README_TH.md ในโฟลเดอร์เดียวกัน: สร้าง Sheet ส่วนตัว, เปิด Sheets/Drive API, ตั้ง OAuth และ Script Properties, Deploy Web app</li><li>Run initializeDatabase_, initializePrivateStorage_ และ checkInstallation_ จาก editor แล้วทดสอบ Login ด้วยสองบัญชี Google</li></ol><p>อย่าวาง secret ในโค้ดหรือไฟล์นี้ ใช้ Project Settings → Script Properties เท่านั้น ดูผลทดสอบและขอบเขตการคำนวณอัตโนมัติใน README_TH.md</p><label for="file">ไฟล์ที่จะคัดลอก</label><select id="file"></select><button type="button" id="copy">คัดลอกโค้ด</button><button type="button" id="select">เลือกโค้ดทั้งหมด</button><p id="status" class="status" role="status"></p><textarea id="code" readonly spellcheck="false" aria-label="โค้ดฉบับเต็มของไฟล์ที่เลือก"></textarea><p>ถ้าปุ่มคัดลอกไม่ได้ ให้เลือกโค้ดทั้งหมดแล้วกด ⌘C จากนั้นวางใน Apps Script ด้วย ⌘V ไม่ต้องเปิดไฟล์ .gs ด้วยแอปบน Mac</p></main><script>const files=${serialized};const list=document.getElementById('file'),code=document.getElementById('code'),status=document.getElementById('status');Object.keys(files).forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;list.append(option)});function show(){code.value=files[list.value];status.textContent=''}list.onchange=show;show();document.getElementById('select').onclick=()=>{code.focus();code.select();status.textContent='กด ⌘C เพื่อคัดลอก'};document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(code.value);status.textContent='คัดลอกแล้ว นำไปวางใน Apps Script ได้เลย'}catch(_){code.focus();code.select();let copied=false;try{copied=document.execCommand('copy')}catch(_){}status.textContent=copied?'คัดลอกแล้ว นำไปวางใน Apps Script ได้เลย':'เลือกโค้ดแล้ว กด ⌘C เพื่อคัดลอก'}};</script></body></html>`;
fs.writeFileSync(path.join(ready, 'INSTALL.html'), installer);
console.log('Built deployment, local interface, and paste-ready google-apps-script release.');
