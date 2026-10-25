import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

const site = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Transport fixture</title>'); return; }
  const file = path.resolve(site, '.' + pathname);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(file));
});
const relay = new WebSocketServer({ server });
let connections = 0;
relay.on('connection', (socket, req) => {
  connections++;
  const url = new URL(req.url, 'http://localhost');
  socket.send(JSON.stringify({ t: 'welcome', proto: 2, compat: url.searchParams.get('compat'), id: 'me', host: 'me', members: [{ id: 'me', name: 'Player' }] }));
  socket.on('message', data => {
    if (String(data) !== 'ping') return;
    if (url.pathname.endsWith('/BC234')) setTimeout(() => { if (socket.readyState === 1) socket.send('pong'); }, 120);
    else socket.send('pong');
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(`${origin}/fixture?relay=${encodeURIComponent(origin.replace('http:', 'ws:'))}`);
  const rtt = await page.evaluate(async () => {
    const { Transport } = await import('/src/net/transport.js');
    const tr = new Transport(); await tr.connect('BC234', 'Old', false);
    const deadline = performance.now() + 5000;
    while (!tr.rtt && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    const old = tr.rtt;
    const connected = tr.connect('BC235', 'New', false), reset = tr.rtt;
    await connected;
    while (!tr.rtt && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    const next = tr.rtt;
    tr.close(); return { old, reset, next, closed: tr.ws === null && tr._pingT === null };
  });
  assert.ok(rtt.old >= 100); assert.equal(rtt.reset, 0); assert.ok(rtt.next > 0); assert.equal(rtt.closed, true);
  await page.goto(`${origin}/fixture?netlag=10&netjitter=1000&relay=${encodeURIComponent(origin.replace('http:', 'ws:'))}`);
  const jitter = await page.evaluate(async () => {
    const nativeTimeout = window.setTimeout.bind(window), nativeRandom = Math.random;
    const scheduled = []; let jitter = .9;
    Math.random = () => jitter;
    window.setTimeout = (fn, ms, ...args) => { if (ms > 0 && ms < 1000) scheduled.push(ms); return nativeTimeout(fn, ms, ...args); };
    const { Transport } = await import('/src/net/transport.js');
    const old = new Transport(), next = new Transport();
    const cancelled = old.connect('BC234', 'Old', false).catch(error => error.name);
    const deadline = performance.now() + 5000;
    while (!scheduled.length && performance.now() < deadline) await new Promise(resolve => nativeTimeout(resolve, 5));
    old.close(); const cancellation = await cancelled;
    jitter = 0;
    await next.connect('BC235', 'New', false);
    next.close(); Math.random = nativeRandom; window.setTimeout = nativeTimeout;
    return { scheduled, cancellation, closed: !old.ws && !next.ws && !old._pingT && !next._pingT };
  });
  assert.equal(jitter.cancellation, 'AbortError'); assert.equal(jitter.closed, true);
  assert.ok(Math.abs(jitter.scheduled[0] - 910) < 1);
  assert.ok(Math.abs(jitter.scheduled[1] - 10) < 1, JSON.stringify(jitter));
  assert.deepEqual(errors, []);
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  const result = { status: 'passed', scope: 'Real Chromium and local WebSocket fixture, emitted Transport only; not full game or deployed relay acceptance', browser: browser.version(), contentHash: manifest.contentHash,
    transportSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(site, 'src/net/transport.js'))).digest('hex'), connections, rtt, jitter, errors };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  for (const socket of relay.clients) socket.terminate();
  await new Promise(resolve => relay.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
