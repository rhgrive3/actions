#!/usr/bin/env node
// Controlled Bot duel survey (2026-11-05). In the Practice Range lane, one
// team-0 BotBrain with the probed weapon faces one team-1 BotBrain with a fixed
// opponent weapon at a fixed distance, both at full HP and ink, same seed per
// round. The player is parked out of both Bots' awareness. Each round lasts
// until a splat or `--seconds`. Reports per weapon: rounds won/lost, the probed
// Bot's main-weapon projectiles and accepted main-weapon hits, damage dealt,
// time to the first splat, and the share of fight frames with the aim below
// the opponent's feet. Headless Bot-logic measurement, not retail data.
//
// node scripts/measure-inkwave-bot-duel.mjs --site _site [--weapons a,b] [--opponent shooter]
//   [--distances 5,9,13] [--rounds 4] [--seconds 12] [--out file.json]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';
const args = process.argv.slice(2), get = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const site = path.resolve(get('--site', '_site')), out = get('--out', null), opponent = get('--opponent', 'shooter');
const weapons = get('--weapons', 'shooter,blaster,s3-blaster-long,charger,splatling,roller').split(',').filter(Boolean);
const distances = get('--distances', '5,9,13').split(',').map(Number);
const rounds = Number(get('--rounds', 4)), seconds = Number(get('--seconds', 12));
// --target bot: the opponent is a normal BotBrain (both sides use the build's AI).
// --target strafe: the opponent never shoots and strafes left/right (0.8 s legs, a hop
// every 2.4 s), isolating the probed Bot's aim / fire decisions from the opponent's.
const targetMode = get('--target', 'bot');
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname), file = path.resolve(site, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
  if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  page.on('pageerror', e => console.error('page-error ' + e.message));
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', lang: 'en', shadows: false, bloom: false, minimap: false, musicVolume: 0, sfxVolume: 0 })));
  await enterRangeFromMenu(page, base, { timeout: 240000 });
  await page.evaluate(async () => {
    const G = window.__G, game = window.__inkwave;
    game.debug.freeze(); game.debug.fire(false);
    // Same URL the app loaded (versioned <base href>), so the same module instances.
    const url = n => new URL(n, document.baseURI).href;
    const [{ Actor }, { BotBrain }] = await Promise.all([import(url('src/game/actor.js')), import(url('src/game/bots.js'))]);
    window.__duel = { Actor, BotBrain };
  });
  for (const id of weapons) {
    const row = await page.evaluate(async ({ id, opponent, distances, rounds, seconds, targetMode }) => {
      const G = window.__G, game = window.__inkwave, m = G.match, { Actor, BotBrain } = window.__duel;
      const local = m.local, P = G.projectiles;
      // Park the player far behind the start, out of awareness (26 u on Fierce).
      const park = () => { local.pos.set(-14.6, .04, -60); local.vel.set(0, 0, 0); local.invuln = 1e9; local.intent.fire = false; };
      const make = (team, weapon) => {
        const a = new Actor({ team, slot: 50 + team, weapon, isLocal: false, isBot: true, name: 'duel' + team, style: null, CharacterClass: m.opts.CharacterClass });
        a.bot = new BotBrain(a, 'normal'); a.character.actor = a; G.scene.add(a.character.root); m.actors.push(a);
        a.respawn = () => {}; return a;
      };
      const A = make(0, id), B = make(1, opponent);
      if (targetMode === 'strafe') B.bot = { t: 0, reset() { this.t = 0; }, update(dt) {
        const it = B.intent; this.t += dt; const side = Math.sin(this.t * Math.PI / .8) >= 0 ? 1 : -1;
        it.move.set(side, 0, 0); it.fire = it.squid = it.sub = it.special = false; it.jump = this.t % 2.4 < dt;
        B.aimYaw = Math.PI; B.aimPitch = 0; } };
      const out = { rounds: 0, won: 0, lost: 0, draw: 0, shots: 0, hits: 0, damage: 0, ttk: [], fightN: 0, belowFeet: 0 };
      const hit = P.applyHit, push = P._push;
      P.applyHit = function (att, vic, dmg, wid, ...rest) { const v = hit.call(this, att, vic, dmg, wid, ...rest); if (att === A && (v === 'accepted' || v === 'killed')) { out.hits++; out.damage += dmg; } return v; };
      // Main-weapon projectiles pushed by the probed Bot (Brella pellets count separately).
      P._push = function (p, ...rest) { if (p?.owner === A && !p.ghost && p.wid === A.weaponId) out.shots++; return push.call(this, p, ...rest); };
      try {
        for (const d of distances) for (let k = 0; k < rounds; k++) {
          let s = 7919 * (k + 1) + d * 31; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
          park(); G.paint.clear?.(); P.clear?.();
          A.spawnAt(new A.pos.constructor(-14.6, .3, 4), 0); B.spawnAt(new B.pos.constructor(-14.6, .3, 4 + d), Math.PI);
          for (const x of [A, B]) { x.invuln = 0; x.ink = 100; x.bot.reset(); x.bot.aimYaw = x.yaw; x.bot.aimPitch = 0; x.bot.mode = 'paint'; x.s3Insights = null; }
          if (targetMode === 'strafe') B.hp = 100;
          let t = 0, ended = false;
          for (; t < seconds && !ended; t += 1 / 60) {
            game._skipRender = true; game._frame(1 / 60); game._skipRender = false;
            park();
            if (A.bot.mode === 'fight' && A.bot.target === B && B.alive) {
              const ey = A.pos.y + 1.1, h = Math.hypot(B.pos.x - A.pos.x, B.pos.z - A.pos.z);
              out.fightN++; if (A.aimPitch < Math.atan2(B.pos.y - ey, h) - .03) out.belowFeet++;
            }
            if (!A.alive || !B.alive) ended = true;
          }
          out.rounds++;
          if (!B.alive && A.alive) { out.won++; out.ttk.push(+t.toFixed(3)); } else if (!A.alive && B.alive) out.lost++; else out.draw++;
          A.alive = B.alive = true;
        }
      } finally { P.applyHit = hit; P._push = push; }
      for (const x of [A, B]) { const i = m.actors.indexOf(x); if (i >= 0) m.actors.splice(i, 1); G.scene.remove(x.character.root); }
      return out;
    }, { id, opponent, distances, rounds, seconds, targetMode });
    const summary = { weapon: id, rounds: row.rounds, won: row.won, lost: row.lost, draw: row.draw, damage: Math.round(row.damage), hits: row.hits,
      shots: row.shots, hitsPerShot: row.shots ? +(row.hits / row.shots).toFixed(3) : null,
      meanTtk: row.ttk.length ? +(row.ttk.reduce((a, b) => a + b, 0) / row.ttk.length).toFixed(2) : null,
      belowFeetShare: row.fightN ? +(row.belowFeet / row.fightN).toFixed(3) : null };
    results.push({ ...summary, raw: row });
    console.log(JSON.stringify(summary));
  }
} finally { await browser.close(); server.close(); }
if (out) fs.writeFileSync(out, JSON.stringify({ opponent, targetMode, distances, rounds, seconds, scope: 'headless Bot duel in the Practice Range lane; not retail S3 data', results }, null, 2) + '\n');
