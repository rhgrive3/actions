#!/usr/bin/env node
// #1767: real emitted Actor/NetSession/NetMatch/Transport, production relay
// admission, two independent browser clients, and a delayed receiving link.
// No browser or relay clock is replaced. The counterfactual removes only the
// receipt accessor, retaining the original five-second owner-clock guard.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, webkit } from 'playwright';
import { WebSocketServer } from 'ws';
import { createLocalRelay } from './lib/inkwave-local-relay-fixture.mjs';

const site = path.resolve(process.argv[2] || '_site');
const evidence = process.argv[3] ? path.resolve(process.argv[3]) : null;
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/probe') {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>'); return;
  }
  const file = path.resolve(site, '.' + url.pathname);
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const relay = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await new Promise(resolve => relay.once('listening', resolve));
const connect = createLocalRelay(), queued = [];
relay.on('connection', (ws, req) => connect(ws, req, { send(text, deliver) {
  if (text.startsWith('m|') && text.includes('"k":"t"')) queued.push({ text, deliver });
  else deliver(text);
} }));
const address = `http://127.0.0.1:${server.address().port}/probe?relay=${encodeURIComponent('ws://127.0.0.1:' + relay.address().port)}`;
const until = async predicate => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert(Date.now() < deadline, 'relay tick delivery deadline');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
const results = []; let browser;
try {
  for (const engine of ['chromium', 'webkit']) {
    browser = await ({ chromium, webkit }[engine]).launch({ headless: true, ...(engine === 'chromium' ? {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-features=LocalNetworkAccessChecks'],
    } : {}) });
    for (const legacy of [false, true]) for (const counterfactual of [false, true]) {
      const rejected = legacy && counterfactual;
      const pages = [], errors = [];
      for (let i = 0; i < 2; i++) {
        const page = await browser.newPage(); pages.push(page);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') console.error(engine, message.text()); });
        await page.goto(address);
        await page.evaluate(async legacy => {
          const THREE = await import('three');
          const { G } = await import('/src/core/ctx.js');
          const { Actor } = await import('/src/game/actor.js');
          const { Projectiles } = await import('/src/game/weapons.js');
          const { NetSession } = await import('/src/net/session.js');
          const { install } = await import('/patches/splatoon3/runtime/install.mjs');
          install(await fetch('/patches/splatoon3/profile.json').then(r => r.json()));
          globalThis.G = G; G.time = 0; G.scene = new THREE.Scene();
          G.teamColors = [new THREE.Color('orange'), new THREE.Color('blue')];
          G.level = { blocks: [], groundHeight: () => 0 };
          G.physics = { los: () => true };
          G.paint = { sample: () => 0, splat: () => 0 };
          G.projectiles = new Projectiles(G.scene);
          class Display {
            constructor(actor) { this.actor = actor; this.root = new THREE.Group(); }
            _owner() { return this.actor; } _runner() { return this.actor.weaponRunner; }
            trigger() {} setVisible(v) { this.root.visible = v; } setHurt() {} setWeapon() {}
          }
          G.game = { profile: { weapon: 'shooter' }, settings: {}, menus: { launchLobby: async () => {} },
            async startNetMatch(cfg, nm) {
              G.actors = cfg.roster.map(r => {
                const a = new Actor({ team: r.team, name: 'startup-clock', weapon: r.weapon, CharacterClass: Display });
                a.character.actor = a;
                Object.assign(a, { owner: r.owner, nid: r.nid, netLife: 1, grounded: true, invuln: 0 });
                a.ground.hit = true; a.ground.face = 0; return a;
              });
              G.local = G.actors.find(a => a.owner === G.net.myId); G.local.isLocal = true;
              G.match = this.match = { actors: G.actors, state: 'init', time: 180, playing: () => true, canRespawn: () => false };
              nm.bind(G.match);
            }, netMatchGo() { G.match.state = 'playing'; }, netMatchAborted() {},
          };
          G.net = new NetSession();
          // Exercise the original relay guard separately from current nonce-origin proof.
          if(legacy)G.net.ownerClockVersion=0;
        }, legacy);
      }
      const [owner, viewer] = pages, code = await owner.evaluate(() => G.net.create('Owner'));
      await viewer.evaluate(code => G.net.join(code, 'Viewer'), code);
      await owner.waitForFunction(() => G.net._members.size === 2);
      const owners = await Promise.all(pages.map(p => p.evaluate(() => G.net.myId)));
      const cfg = { ...await owner.evaluate(async () => {
        const { PROTO, COMPAT } = await import('/src/net/transport.js'); return { proto: PROTO, compat: COMPAT };
      }), id: `${engine}-${legacy}-${counterfactual}`, map: '', mode: 'turf', roster: owners.map((owner, nid) => ({ owner, nid, team: nid, slot: 0, weapon: 'shooter', bot: false })) };
      await Promise.all(pages.map(p => p.evaluate(cfg => G.net._begin(cfg), cfg)));
      await owner.evaluate(() => G.net._go());
      await Promise.all(pages.map(p => p.waitForFunction(() => G.match?.state === 'playing')));
      await viewer.evaluate(counterfactual => {
        globalThis.receipts = [];
        const tr = G.net.tr, receive = tr.onMessage;
        tr.onMessage = function(from, data) {
          if (data.k === 't') receipts.push({ ts: data.ts, relay: this.relayReceipt(from), received: performance.now() / 1000 });
          return receive.call(this, from, data);
        };
        if (counterfactual) tr.relayReceipt = () => null;
      }, counterfactual);
      const send = x => owner.evaluate(x => { G.local.pos.x = x; G.netm._sendTick(); }, x);
      await send(2); await until(() => queued.length === 1);
      // Longer than the unmodified 5 s guard: startup holds the first tick,
      // while the relay and owner clocks continue normally for 6.2 seconds.
      await new Promise(resolve => setTimeout(resolve, 6200));
      await send(7); await until(() => queued.length === 2);
      for (const { text, deliver } of queued.splice(0)) deliver(text);
      await viewer.waitForFunction(() => receipts.length === 2);
      const result = await viewer.evaluate(ownerId => {
        const peer = G.netm.peers.get(ownerId), actor = G.actors.find(a => a.owner === ownerId);
        return { receipts, lastTs: peer.lastTs, x: actor.net.buf.at(-1).x, accepted: G.netm.stats.in };
      }, owners[0]);
      assert(result.receipts[1].ts - result.receipts[0].ts > 5, 'owner advances beyond the original grace');
      assert(result.receipts[1].received - result.receipts[0].received < 1, 'receiver drains the startup backlog');
      assert.equal(result.lastTs, result.receipts[rejected ? 0 : 1].ts);
      assert.equal(result.x, rejected ? 2 : 7);
      if (!counterfactual) assert(result.receipts[1].relay - result.receipts[0].relay > 5000);
      assert.deepEqual(errors, []);
      results.push({ engine, browser: browser.version(), clients: 2, legacy, counterfactual, ...result });
      await Promise.all(pages.map(p => p.evaluate(() => G.net.leave())));
      await Promise.all(pages.map(p => p.close()));
    }
    await browser.close(); browser = null;
  }
  const receipt = { status: 'passed', sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    contentHash: manifest.contentHash, inputHash: manifest.inputHash, physicalIPad: false, results };
  if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'startup-clock-result.json'), JSON.stringify(receipt, null, 2) + '\n'); }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close(); for (const ws of relay.clients) ws.terminate();
  await new Promise(resolve => relay.close(resolve)); await new Promise(resolve => server.close(resolve));
}
