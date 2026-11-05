#!/usr/bin/env node
// Per-weapon Bot turf survey (owner review 2026-11-05). Each match puts the
// probed weapon on all four team-0 Bots against a fixed team-1 roster, runs a
// seeded offline Turf match without rendering and reports the team-0 mean of
// Actor.stats.turf. This is a Bot-AI logic measurement in headless Chromium:
// it is neither retail Splatoon 3 turf data nor an iPad trace. Each weapon also
// prints a team-0 behaviour probe (fire/rolling/squid/moving fractions, mean
// speed and mean speed while rolling, Bot mode shares).
//
// node scripts/measure-inkwave-bot-turf.mjs --site _site [--stage scorch] \
//   [--seconds 180] [--seeds 2] [--weapons id,id] [--opponent id] [--list] [--out file.json]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright';
const args = process.argv.slice(2), get = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; }, has = n => args.includes(n);
const site = path.resolve(get('--site', '_site')), stage = get('--stage', 'scorch'), seconds = Number(get('--seconds', 180));
const seeds = Number(get('--seeds', 2)), out = get('--out', null), opponent = get('--opponent', 'shooter');
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
  // Import config.js from the exact URL the app loaded so WEAPONS is the
  // same module instance the catalogue registered into.
  const catalogue = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/src\/config\.js(\?|$)/.test(n));
    const c = await import(url || '/src/config.js'); window.__iwWeapons = c.WEAPONS; return Object.keys(c.WEAPONS);
  });
  if (has('--list')) { console.log(catalogue.join('\n')); process.exit(0); }
  const weapons = (get('--weapons', '') || catalogue.join(',')).split(',').filter(Boolean);
  for (const id of weapons) {
    if (!catalogue.includes(id)) { console.error('unknown weapon ' + id); continue; }
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
        const frames = (g.match.turfIntroFrames ?? 253) + 47 + Math.round(seconds * 60);
        const probe = { n: 0, fire: 0, rolling: 0, rollSpeed: 0, squid: 0, moving: 0, speed: 0, modes: {} };
        for (let i = 0; i < frames && G.match.state !== 'ended' && G.match.state !== 'results'; i++) {
          g._frame(1 / 60);
          if (G.match.state !== 'playing') continue;
          for (const a of G.actors) {
            if (a.team !== 0 || !a.alive || !a.bot) continue;
            const sp = Math.hypot(a.vel.x, a.vel.z);
            probe.n++; probe.speed += sp; if (sp > .5) probe.moving++;
            if (a.intent.fire) probe.fire++; if (a.intent.squid) probe.squid++;
            if (a.weaponRunner.rolling) { probe.rolling++; probe.rollSpeed += sp; }
            probe.modes[a.bot.mode] = (probe.modes[a.bot.mode] || 0) + 1;
          }
        }
        window.__iwProbe = probe;
        const row = G.actors.map(a => ({ team: a.team, weapon: a.weaponId, turf: a.stats.turf, splats: a.stats.splats, deaths: a.stats.deaths, specials: a.stats.specials }));
        g._skipRender = false; g.menus?.toMenu?.(); g.quitToMenu?.();
        return { actors: row, probe: window.__iwProbe };
      }, { id, opponent, stage, seconds, seed: 1000 + k * 7919 });
      const mine = r.actors.filter(a => a.team === 0);
      runs.push({ probe: r.probe, seed: k, meanTurf: mine.reduce((s, a) => s + a.turf, 0) / mine.length, deaths: mine.reduce((s, a) => s + a.deaths, 0) / mine.length, actors: r.actors });
    }
    const mean = runs.reduce((s, x) => s + x.meanTurf, 0) / runs.length;
    results.push({ weapon: id, meanTurf: mean, deaths: runs.reduce((s, x) => s + x.deaths, 0) / runs.length, runs });
    const pr = runs[0].probe; if (pr) console.log('probe', id, JSON.stringify({ fire: (pr.fire/pr.n).toFixed(2), rolling: (pr.rolling/pr.n).toFixed(2), rollSpeed: (pr.rollSpeed/Math.max(1,pr.rolling)).toFixed(2), squid: (pr.squid/pr.n).toFixed(2), moving: (pr.moving/pr.n).toFixed(2), speed: (pr.speed/pr.n).toFixed(2), modes: Object.fromEntries(Object.entries(pr.modes).map(([k,v])=>[k,(v/pr.n).toFixed(2)])) }));
    console.log(`${id}\t${mean.toFixed(0)}\tdeaths ${results.at(-1).deaths.toFixed(1)}\t[${runs.map(x => x.meanTurf.toFixed(0)).join(', ')}]`);
  }
} finally { await browser.close(); server.close(); }
if (out) fs.writeFileSync(out, JSON.stringify({ stage, seconds, seeds, opponent, scope: 'headless Bot logic; not retail S3 data', results }, null, 2) + '\n');
