#!/usr/bin/env node
// Short emitted-build check of native BotBrain -> Actor -> special effects.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { sandboxBrowserOptions } from './lib/inkwave-sandbox-browser.mjs';

const opt = (key, fallback) => {
  const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1];
};
const site = fs.realpathSync(opt('--site', '_site'));
const out = path.resolve(opt('--evidence-dir', '.browser-evidence/bot-specials'));
fs.mkdirSync(out, { recursive: true });
const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(build.artifacts)), build.contentHash);
for (const [file, digest] of Object.entries(build.artifacts))
  assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
const prefix = `/_versions/${build.build.revision}/`;
const server = http.createServer((req, res) => {
  if (req.url === '/check') {
    res.setHeader('content-type', 'text/html');
    res.end(`<html><head><base href="${prefix}"><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body>Bot special input verification</body></html>`);
    return;
  }
  const file = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(site + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('content-type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const result = { status: 'running', sourceSha: build.build.sourceSha, contentHash: build.contentHash, cases: [], errors: [],
  scope: 'Emitted native BotBrain/Actor/Physics/NavGraph/Projectiles and CPU paint ownership in Chromium; controlled supported floor, no rendering or retail parity claim.' };
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(sandboxBrowserOptions());
  const page = await browser.newPage();
  page.on('pageerror', e => result.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/check`);
  const checked = await page.evaluate(async () => {
    const THREE = await import('three');
    const { install } = await import(new URL('patches/splatoon3/runtime/install.mjs', document.baseURI));
    const { Level } = await import(new URL('src/world/level.js', document.baseURI));
    const { BotBrain } = await import(new URL('src/game/bots.js', document.baseURI));
    const { NavGraph } = await import(new URL('src/game/nav.js', document.baseURI));
    const { CANONICAL_KITS } = await import(new URL('patches/splatoon3/runtime/canonical-kits-data.mjs', document.baseURI));
    const profile = await fetch(new URL('patches/splatoon3/profile.json', document.baseURI)).then(r => r.json());
    const api = install(profile), { G } = api;
    const kits = Object.fromEntries(Object.entries(CANONICAL_KITS).map(([id, k]) => [k.special, id]));
    Object.assign(G, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), time: 0,
      teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')], mode: 'match',
      match: { mode: 'turf', opts: {}, state: 'playing', playing: () => true, canRespawn: () => false }, actors: [] });
    G.level = new Level({ bounds: { minX: -25, maxX: 25, minZ: -15, maxZ: 45 },
      spawnPads: [[-20, 0, -10], [20, 0, 40]], spawnBarrier: 0, half: [],
      single: [{ kind: 'box', min: [-25, -1, -15], max: [25, 0, 45] }] });
    G.physics = new api.Physics(G.level); G.nav = new NavGraph(G.level, G.physics);
    class CpuPaint extends api.PaintSystem {
      _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; }
      _pushQuad() {} _drawQuads() { this.quads = 0; }
    }
    G.paint = new CpuPaint(null, G.level, { atlasSize: 1024, maxDensity: 12, cell: .5 });
    G.projectiles = new api.Projectiles(G.scene);
    const events = [], cases = [], failures = [];
    api.on('all:special', e => events.push(e));
    let stormThrows = 0;
    const throwStorm = G.projectiles.throwStorm;
    G.projectiles.throwStorm = function (...args) { stormThrows++; return throwStorm.apply(this, args); };
    function make(special, team, z) {
      const a = new api.Actor({ team, name: 'Special verification', weapon: kits[special], isBot: true,
        CharacterClass: api.Character, style: { hair: 0, skin: 0 } });
      G.actors.push(a); a.spawnAt(new THREE.Vector3(0, 0, z), 0); a.invuln = 0;
      a.special = a.specialCost(); a.hp = 100000;
      return a;
    }
    function prepare(special, distance = 20) {
      G.projectiles.clear(); G.paint = new CpuPaint(null, G.level, { atlasSize: 1024, maxDensity: 12, cell: .5 }); G.actors.length = 0; events.length = 0; stormThrows = 0;
      const a = make(special, 0, 0), enemy = make('trizooka', 1, distance);
      const b = a.bot = new BotBrain(a);
      b.target = enemy; b.seeTimer = 1.2; b.think = b.repath = b.bombCd = b.dodgeCd = 100;
      b.react = 0; b.acqT = 100; b.aimYaw = a.aimYaw = 0;
      b.aimPitch = a.aimPitch = Math.atan2(-.25, distance);
      a.aimPoint.set(0, .85, distance);
      b._pathTo(new THREE.Vector3(0, 0, 4), .6); b.repath = 100;
      return { a, b, enemy };
    }
    function tick(a, b) {
      G.time += 1 / 60; b.update(1 / 60); a.update(1 / 60);
      G.projectiles.update(1 / 60); G.paint.advanceSimulation(1 / 60);
    }
    const check = (ok, label, details) => { if (!ok) failures.push({ label, details }); };
    Math.random = () => .5;
    for (const special of ['storm', 'booyahBomb', 'tripleInkstrike']) {
      const { a, b } = prepare(special);
      let held = false, released = false;
      const done = () => special === 'storm' ? stormThrows === 1 : events.some(e => e.actor === a && e.id === special && e.action === (special === 'tripleInkstrike' ? 'marker' : 'throw'));
      for (let frame = 0; frame < 600 && !done(); frame++) {
        const wasHeld = held; tick(a, b); held ||= a.intent.sub; released ||= wasHeld && !a.intent.sub;
      }
      const row = { special, admissions: a.stats.specials, held, released, effect: done() };
      check(a.stats.specials === 1 && held && released && done(), special + ' native hold/release/effect', row); cases.push(row);
    }
    const { a, b, enemy } = prepare('krakenRoyale', 8);
    let charged = false, released = false, dash = false;
    for (let frame = 0; frame < 180 && !dash; frame++) {
      tick(a, b); charged ||= a._s3AllSpecialState?.phase === 'charge';
      released ||= charged && !a.intent.fire; dash ||= a._s3AllSpecialState?.phase === 'dash';
    }
    check(a.stats.specials === 1 && charged && released && dash, 'Kraken native charge and release', { admissions: a.stats.specials, charged, released, dash });
    enemy.alive = false; b.target = null; b.seeTimer = 0; b.noProg = 1; b.jumpCd = -1; b._needJump = true;
    let emptyJump = false;
    for (let frame = 0; frame < 20; frame++) { tick(a, b); emptyJump ||= a.intent.jump; }
    check(!emptyJump, 'Kraken empty-field tail jump suppressed', { emptyJump });
    cases.push({ special: 'krakenRoyale', admissions: a.stats.specials, charged, released, dash, emptyJump });
    return { cases, failures };
  });
  result.cases = checked.cases; result.failures = checked.failures;
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.failures, [], JSON.stringify(result.failures));
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = error.stack || error.message; process.exitCode = 1;
} finally {
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
