#!/usr/bin/env node
// Per-weapon Bot combat survey (2026-11-05). Seeded offline Turf matches
// without rendering: the probed weapon on the team-0 Bots (the autopilot local
// slot is excluded; BotBrain does not drive it) against a fixed
// team-1 roster. Reports, for team 0:
//  - aim: while a Bot is in fight mode with a visible target, its aim pitch
//    minus the pitch to the target's body centre (radians; negative = below),
//    and the share of those frames aimed below the target's feet;
//  - shots / hits: main-weapon projectiles pushed (pellets count separately)
//    and accepted damaging hits on enemies with the main weapon;
//  - movement: heading reversals (>135 deg within 0.5 s while moving) per Bot
//    minute, and the share of alive time standing still outside combat;
//  - splats, deaths, specials and turf.
// This is a Bot-AI logic measurement in headless Chromium. It is neither retail
// Splatoon 3 data nor an iPad trace; compare runs with the same seeds/stage.
//
// node scripts/measure-inkwave-bot-combat.mjs --site _site [--stage scorch] \
//   [--seconds 90] [--seeds 2] [--weapons id,id] [--opponent shooter] [--out file.json]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright';
const args = process.argv.slice(2), get = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const site = path.resolve(get('--site', '_site')), stage = get('--stage', 'scorch'), seconds = Number(get('--seconds', 90));
const seeds = Number(get('--seeds', 2)), out = get('--out', null), opponent = get('--opponent', 'shooter');
const weapons = get('--weapons', 'shooter,blaster,s3-blaster-short,s3-blaster-long,charger,roller,slosher,splatling,dualies,s3-shelter-normal,s3-brush-normal').split(',').filter(Boolean);
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://local').pathname), file = path.resolve(site, '.' + (rel === '/' ? '/index.html' : rel));
    if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', e => console.error('page-error ' + e.message));
  await page.addInitScript(() => { localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, musicVolume: 0, audioVolume: 0 })); });
  await page.goto(`http://127.0.0.1:${server.address().port}/?autopilot&map=${stage}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__G?.mode === 'menu', null, { timeout: 300000 });
  for (const id of weapons) {
    const runs = [];
    for (let k = 0; k < seeds; k++) {
      const r = await page.evaluate(async ({ id, opponent, stage, seconds, seed }) => {
        const g = window.__inkwave, G = window.__G;
        let s = seed; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
        const proto = G.match && Object.getPrototypeOf(G.match), setup = proto?.setup;
        proto.setup = function (...a) { const v = setup.apply(this, a); for (const actor of this.actors) actor.setWeapon(actor.team === 0 ? id : opponent); return v; };
        try {
          g.debug?.freeze?.(); G.time = 0; g.s3Clock?.reset?.(); g.menus?.wipe?.cancel?.();
          await g.startMatch({ mapId: stage, mode: 'turf', duration: seconds, difficulty: 'normal' });
        } finally { proto.setup = setup; }
        g._skipRender = true;
        const P = G.projectiles, push = P._push, applyHit = P.applyHit;
        const b0 = a => a.bot.mode;
        const m = { inRangeN: 0, missedN: 0, hitIds: {}, shots: 0, hits: 0, damage: 0, fightN: 0, pitchErr: 0, belowFeet: 0, aboveHead: 0, absErr: 0, idleN: 0, aliveN: 0, reversals: 0, pitchHist: {} };
        P._push = function (p, ...rest) { const o = p?.owner; if (o && o.team === 0 && o.bot && !o.isLocal && !p.ghost && p.wid === o.weaponId) m.shots++; return push.call(this, p, ...rest); };
        P.applyHit = function (attacker, victim, dmg, weaponId, ...rest) {
          const v = applyHit.call(this, attacker, victim, dmg, weaponId, ...rest);
          if (attacker?.team === 0 && attacker.bot && (v === 'accepted' || v === 'killed')) m.hitIds[String(weaponId)] = (m.hitIds[String(weaponId)] || 0) + 1;
          if (attacker?.team === 0 && attacker.bot && !attacker.isLocal && weaponId === attacker.weaponId && (v === 'accepted' || v === 'killed')) { m.hits++; m.damage += dmg; }
          return v;
        };
        const heading = new Map();
        const frames = (g.match.turfIntroFrames ?? 253) + 47 + Math.round(seconds * 60);
        try {
          for (let i = 0; i < frames && G.match.state !== 'ended' && G.match.state !== 'results'; i++) {
            g._frame(1 / 60);
            if (G.match.state !== 'playing') continue;
            for (const a of G.actors) {
              if (a.team !== 0 || !a.alive || !a.bot || a.isLocal) continue;
              m.aliveN++;
              if (i % 10 === 0) {
                // An enemy in weapon range with a clear eye line while the Bot is not fighting.
                const range = typeof a.bot._range === 'function' ? a.bot._range() : 10;
                const eye = a.pos.clone(); eye.y += 1.3;
                const seen = G.actors.some(e => e.team !== a.team && e.alive && e.form !== 'squid' && e.pos.distanceTo(a.pos) <= range * 1.1 && G.physics.los(eye, e.pos.clone().setY(e.pos.y + 1)));
                if (seen) { m.inRangeN++; if (b0(a) !== 'fight') m.missedN++; }
              }
              const b = a.bot, sp = Math.hypot(a.vel.x, a.vel.z);
              if (b.mode !== 'fight' && sp < .3 && !a.weaponRunner.charging && !a.superJumpState) m.idleN++;
              if (sp > 1.5) {
                const h = Math.atan2(a.vel.x, a.vel.z), prev = heading.get(a);
                if (prev) {
                  const d = Math.abs(Math.atan2(Math.sin(h - prev.h), Math.cos(h - prev.h)));
                  if (d > 2.356 && G.time - prev.t < .5) { m.reversals++; heading.set(a, { h, t: G.time }); }
                  else if (d > .35) heading.set(a, { h, t: G.time });
                } else heading.set(a, { h, t: G.time });
              }
              const t = b.target;
              if (b.mode === 'fight' && t && t.alive && b.seeTimer > 0) {
                const ey = a.pos.y + 1.1, dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, horiz = Math.hypot(dx, dz);
                const body = Math.atan2(t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? .3 : .85) - ey, horiz);
                const feet = Math.atan2(t.pos.y - ey, horiz), head = Math.atan2(t.pos.y + 1.6 - ey, horiz);
                const err = a.aimPitch - body;
                m.fightN++; m.pitchErr += err; m.absErr += Math.abs(err);
                if (a.aimPitch < feet - .03) m.belowFeet++;
                if (a.aimPitch > head + .03) m.aboveHead++;
                const bin = (Math.round(err / .1) * .1).toFixed(1); m.pitchHist[bin] = (m.pitchHist[bin] || 0) + 1;
              }
            }
          }
        } finally { P._push = push; P.applyHit = applyHit; }
        const row = G.actors.filter(a => !a.isLocal).map(a => ({ team: a.team, weapon: a.weaponId, turf: a.stats.turf, splats: a.stats.splats, deaths: a.stats.deaths, specials: a.stats.specials }));
        g._skipRender = false; g.menus?.toMenu?.(); g.quitToMenu?.();
        return { actors: row, m };
      }, { id, opponent, stage, seconds, seed: 1000 + k * 7919 });
      runs.push(r);
    }
    const sum = (f) => runs.reduce((s, r) => s + f(r), 0);
    const mine = runs.flatMap(r => r.actors.filter(a => a.team === 0)), theirs = runs.flatMap(r => r.actors.filter(a => a.team === 1));
    const M = k => sum(r => r.m[k]);
    const botMinutes = M('aliveN') / 3600;
    const row = {
      weapon: id,
      splats: +(mine.reduce((s, a) => s + a.splats, 0) / runs.length).toFixed(2),
      deaths: +(mine.reduce((s, a) => s + a.deaths, 0) / runs.length).toFixed(2),
      enemySplats: +(theirs.reduce((s, a) => s + a.splats, 0) / runs.length).toFixed(2),
      turf: Math.round(mine.reduce((s, a) => s + a.turf, 0) / mine.length),
      shots: Math.round(M('shots') / runs.length), hits: Math.round(M('hits') / runs.length),
      hitsPerShot: +(M('hits') / Math.max(1, M('shots'))).toFixed(3),
      damagePerMin: +(M('damage') / Math.max(1e-9, botMinutes)).toFixed(1),
      meanPitchErr: +(M('pitchErr') / Math.max(1, M('fightN'))).toFixed(3),
      meanAbsPitchErr: +(M('absErr') / Math.max(1, M('fightN'))).toFixed(3),
      belowFeetShare: +(M('belowFeet') / Math.max(1, M('fightN'))).toFixed(3),
      aboveHeadShare: +(M('aboveHead') / Math.max(1, M('fightN'))).toFixed(3),
      fightShare: +(M('fightN') / Math.max(1, M('aliveN'))).toFixed(3),
      reversalsPerMin: +(M('reversals') / Math.max(1e-9, botMinutes)).toFixed(2),
      idleShare: +(M('idleN') / Math.max(1, M('aliveN'))).toFixed(3),
      // share of sampled frames with an enemy visibly in range while not fighting
      missedEngageShare: +(M('missedN') / Math.max(1, M('inRangeN'))).toFixed(3),
      enemyInRangeShare: +(M('inRangeN') * 10 / Math.max(1, M('aliveN'))).toFixed(3),
    };
    results.push({ ...row, runs: runs.map(r => ({ m: r.m, actors: r.actors })) });
    console.log(JSON.stringify(row));
  }
} finally { await browser.close(); server.close(); }
if (out) fs.writeFileSync(out, JSON.stringify({ stage, seconds, seeds, opponent, scope: 'headless Bot logic; not retail S3 data', results }, null, 2) + '\n');
