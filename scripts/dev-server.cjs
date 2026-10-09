'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { runtime, dispatch } = require('./node-runtime.cjs');
const port = Number(process.env.PORT || 3000);
const current = runtime();
execFileSync(process.execPath, [path.join(__dirname, 'build.cjs')], { stdio: 'inherit' });
const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
if (process.env.APP_URL) allowedOrigins.add(new URL(process.env.APP_URL).origin);
const allowedHosts = new Set([...allowedOrigins].map(origin => new URL(origin).host));

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function callbackPage(result) {
  const data = JSON.stringify(result).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Arkham · Sign-in</title><style>body{background:#171c19;color:#eee6d4;font:18px Georgia;padding:48px}main{max-width:600px;margin:auto}code{display:block;overflow-wrap:anywhere;padding:20px;background:#27312b}p{line-height:1.6}</style><main><h1>Return to your companion</h1><p id="status"></p><code id="ticket"></code><p>If automatic sign-in does not finish, copy the ticket into your original tab. It is only usable there, and expires in ten minutes.</p></main><script>const result=${data};document.getElementById('status').textContent=result.error||'Google authorization returned. Continue in the original tab.';if(result.ticket){document.getElementById('ticket').textContent=result.ticket;if(window.opener)window.opener.postMessage({type:'arkham-oauth',ticket:result.ticket,state:result.state},location.origin);}</script></html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!allowedHosts.has(req.headers.host)) return json(res, { ok: false, error: { code: 'FORBIDDEN', message: 'Unrecognized development host.' } }, 403);
    const url = new URL(req.url, `http://${req.headers.host}`);
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, { status: 'ok', workflow: 'full-companion', googleConfigured: current.auth.publicConfig().configured });
    if (req.method === 'POST' && url.pathname === '/api') {
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return json(res, { ok: false, error: { code: 'FORBIDDEN', message: 'Unrecognized request origin.' } }, 403);
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, { ok: false, error: { code: 'VALIDATION', message: 'Expected JSON.' } }, 415);
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4000000) return json(res, { ok: false, error: { code: 'VALIDATION', message: 'Request is too large.' } }, 413);
      }
      let request;
      try { request = JSON.parse(body); } catch (_) { return json(res, { ok: false, error: { code: 'VALIDATION', message: 'Invalid JSON.' } }, 400); }
      return json(res, dispatch(current, request));
    }
    if (req.method === 'GET' && url.pathname === '/oauth/callback') {
      let result;
      try { result = current.auth.callback(Object.fromEntries(url.searchParams)); }
      catch (_) { result = { error: 'Sign-in could not be completed. Return to the original tab and try again.' }; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(callbackPage(result));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(path.join(__dirname, '../dist/web/index.html')));
    }
    json(res, { ok: false, error: { code: 'NOT_FOUND', message: 'Page not found.' } }, 404);
  } catch (_) { json(res, { ok: false, error: { code: 'SERVER_ERROR', message: 'Request could not be completed.' } }, 500); }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Arkham development server listening on port ${port}.`);
  console.log('Local persistence is private .local/ JSON. Production uses Google Sheets.');
  if (!current.auth.publicConfig().configured) console.log('Google login needs configuration. The labeled design preview is read only.');
});
