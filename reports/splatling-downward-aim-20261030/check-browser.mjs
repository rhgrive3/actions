#!/usr/bin/env node
// Native emitted practice range, camera controller, charge input and HUD.
// Before/after evidence, not a retail camera/pixel comparison.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const [siteArg, outArg] = process.argv.slice(2), site = path.resolve(siteArg), out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'))), served = {};
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(site + '/') || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const rel = path.relative(site, file), bytes = fs.readFileSync(file);
  assert.equal(hash(bytes), manifest.artifacts[rel], 'served artifact identity: ' + rel); served[rel] = hash(bytes);
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(bytes);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launchPersistentContext(path.join(out, 'profile'), { headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    viewport: { width: 800, height: 450 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('inkwave.profile', JSON.stringify({ name: 'Splatling Aim QA', level: 1, xp: 0, wins: 0, matches: 0,
      totalTurf: 0, weapon: 'splatling', style: { hair: 0, skin: 2, outfit: 0, eyes: 0, hat: 0, brows: 0 } }));
    localStorage.setItem('inkwave.splatoon3.gear.v1', JSON.stringify(Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }))));
    localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, minimap: false, aimAssist: 0, aimAssistMouse: false }));
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/?range&skipTitle');
  await page.waitForFunction(() => window.__G?.match?.range && __G.match.state === 'playing', null, { timeout: 180000 });
  console.log('native practice range ready');
  await page.evaluate(() => { __G.game.debug.freeze(); __G.game.debug.freezeBots(); });
  const cases = [];
  const rates = process.argv.includes('--focused') ? [60] : [30, 60, 120];
  for (const hz of rates) for (const pitch of [-1.05, -.45, 0]) {
    await page.evaluate(async ({ hz, pitch }) => {
      const G = __G, g = G.game, a = G.local;
      let setupRng = 123;
      Math.random = () => { setupRng = (Math.imul(setupRng, 1664525) + 1013904223) >>> 0; return setupRng / 4294967296; };
      G.time = 10; g._frameN = 0;
      const { TEAM_PALETTES } = await import(new URL('src/config.js', document.baseURI));
      g._setPalette(TEAM_PALETTES[3]);
      const { FixedClock } = await import(new URL('patches/splatoon3/runtime/clock.mjs', document.baseURI));
      const { on } = await import(new URL('src/core/ctx.js', document.baseURI));
      const { projectShotGuide } = await import(new URL('patches/splatoon3/runtime/weapons-fidelity.mjs', document.baseURI));
      const previous = a.character;
      const c = new g.CharacterClass({ name: previous.name, style: { ...previous.style }, isLocal: true, color: a.color, weapon: 'splatling' });
      await c._sourceMotionLoader;
      G.scene.remove(previous.root); previous.dispose(); a.character = c; c.actor = a; c.onEvent = previous.onEvent; G.scene.add(c.root);
      a.reset(); a.setWeapon('splatling'); a.pos.set(0, G.level.groundHeight(0, 0) || 0, 0);
      a.form = 'kid'; a.submerged = a.climbing = false; a.specialActive = a.superJumpState = null;
      a.invuln = 0; a.vel.set(0, 0, 0); a.grounded = true; a.ink = 100;
      a.intent.move.set(0, 0, 0); a.intent.jump = a.intent.sub = a.intent.special = a.intent.squid = false;
      G.projectiles.clear(); G.fx.clear(); g.debug.fire(false);
      g.rig.follow(a, true); g.rig.yaw = a.yaw = 0; g.rig.pitch = pitch;
      G.time = 10;
      g._skipRender = true;
      for (let i = 0; i < 120; i++) g._frame(1 / 60);
      // Native settling above; gameplay RNG starts from the same seed in both builds.
      let rng = 123;
      Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
      const clock = new FixedClock(), rows = [], fires = [], contacts = [];
      const off = on('weapon:fire', e => { if (e.actor === a) fires.push({ tick: rows.length, weapon: e.weapon,
        muzzle: e.muzzle?.toArray(), dir: e.dir?.toArray(), charge: e.charge ?? null }); });
      const world = G.projectiles.inkFlight.world, step = G.projectiles._step, guideContact = G.projectiles._inkGuideContact;
      let liveHead = false, fieldContact = null;
      G.projectiles._inkGuideContact = function (p, h) {
        const hit = guideContact.call(this, p, h);
        if (hit.hit && p.owner === a) fieldContact = hit.point.toArray();
        return hit;
      };
      G.projectiles._step = function (p, ...args) {
        const prior = liveHead; liveHead = p.owner === a && p.type === 'shot';
        try { return step.call(this, p, ...args); } finally { liveHead = prior; }
      };
      G.projectiles.inkFlight.world = function (...args) {
        const h = world.apply(this, args); if (liveHead && h.hit) contacts.push({ tick: rows.length, point: h.point.toArray(), block: h.block }); return h;
      };
      window.aimProbe = { rows, fires, contacts, off, world, step, guideContact, hz, pitch, tick: 0, displays: 0, renders: 0,
        conditions: { gear: a.s3.loadout, name: c.name, seed: c.seed, style: c.style, weapon: a.weaponId, palette: G.teamHex,
          sourceMotion: c.sourceMotion.status, origin: a.pos.toArray(), render: 'Chromium SwiftShader; selected tick captures', viewport: [800, 450] } };
      window.displayAim = () => {
        const probe = window.aimProbe;
        clock.advance(1 / hz, () => {
          const tick = probe.tick++;
          fieldContact = null;
          // Charge to full, release, finish stream, then begin another charge.
          g.debug.fire(tick < 75 || tick >= 240);
          g._frame(1 / 60);
          const r = a.weaponRunner, controller = G.match.controller, guide = controller.shotGuide;
          const hud = g.hud.ret.getBoundingClientRect(), screen = projectShotGuide(guide, G.rig.gameCam, 800, 450);
          rows.push({ tick, gameplay: { pos: a.pos.toArray(), aim: a.aimPoint.toArray(), dir: a.aimDir.toArray(), ink: a.ink,
            charge: r.charge, streaming: r.streaming, charging: r.charging, releaseCharge: r.fidelitySplatlingCharge,
            cooldown: r.cooldown, rounds: G.projectiles.list.map(p => ({ pos: p.pos.toArray(), vel: p.vel.toArray(), age: p.age, damage: p.damage })) },
            guide: guide ? { x: guide.x, y: guide.y, z: guide.z, frames: guide.frames } : null, screen, fieldContact,
            hud: { x: hud.x + hud.width / 2, y: hud.y + hud.height / 2, translate: g.hud.ret.style.translate },
            camera: { position: G.rig.gameCam.position.toArray(), quaternion: G.rig.gameCam.quaternion.toArray() } });
        });
        probe.displays++;
        if ([24, 48, 72, 95, 251].includes(probe.tick - 1)) { g.R.render(); G.renderer.getContext().finish(); probe.renders++; }
        return probe.tick - 1;
      };
    }, { hz, pitch });
    const screenshots = [], captured = new Set();
    // 270 native input ticks; costly SwiftShader draws are sampled at five important ticks.
    for (let d = 0; d < hz * 4.5; d++) {
      const tick = await page.evaluate(() => displayAim());
      if (hz === 60 && [24, 48, 72, 95, 251].includes(tick) && !captured.has(tick)) {
        captured.add(tick); const file = `pitch-${pitch}-tick-${tick}.png`;
        await page.screenshot({ path: path.join(out, file) }); screenshots.push(file);
      }
    }
    const result = await page.evaluate(() => {
      const p = aimProbe; p.off(); __G.projectiles.inkFlight.world = p.world; __G.projectiles._step = p.step; __G.projectiles._inkGuideContact = p.guideContact;
      return { hz: p.hz, pitch: p.pitch, conditions: p.conditions, rows: p.rows, fires: p.fires, contacts: p.contacts, displays: p.displays, renders: p.renders };
    });
    assert.equal(result.rows.length, 270); assert.equal(result.displays, hz * 4.5);
    if (process.argv.includes('--expect-fixed') && pitch < 0) {
      const charging = result.rows.filter(r => r.gameplay.charging);
      assert.ok(charging.length >= 75);
      assert.ok(charging.every(r => r.fieldContact && Math.hypot(r.guide.x - r.fieldContact[0], r.guide.y - r.fieldContact[1], r.guide.z - r.fieldContact[2]) < 1e-6), 'charging guide stays on the actual sphere-to-field contact, including floor edges');
      assert.ok(charging.filter(r => [48, 72, 251].includes(r.tick)).every(r => Math.hypot(r.hud.x - r.screen.x, r.hud.y - r.screen.y) < .2), 'settled rendered HUD owns the projected contact');
    }
    cases.push({ ...result, screenshots }); console.log(JSON.stringify({ hz, pitch, ticks: result.rows.length, renders: result.renders, contacts: result.contacts.length }));
    fs.writeFileSync(path.join(out, `case-${hz}-${pitch}.json`), JSON.stringify({ ...result, screenshots }, null, 2));
  }
  assert.deepEqual(errors, []);
  const receipt = { contentHash: manifest.contentHash, inputHash: manifest.inputHash, revision: manifest.build.revision,
    scriptSha256: hash(fs.readFileSync(new URL(import.meta.url))), browser: await page.evaluate(() => navigator.userAgent), cases, served, errors,
    scope: 'Native production practice range, input, CameraRig, source-motion Character, physical floor, projectiles, HUD and WebGL. Seeded controlled inputs; Chromium SwiftShader, no Switch capture or retail pixel parity.' };
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
