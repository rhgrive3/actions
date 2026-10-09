#!/usr/bin/env node
// Repeated battle lifecycle browser check (built site, Chromium, touch tablet with an iPad user agent).
// Drives the real menus with taps — PLAY → TURF WAR → START → (time up) → judge → results → MAIN MENU — for
// --cycles rounds (default 10) and asserts after every round that nothing accumulates or survives from an earlier
// one: one HUD / menu layer / touch-control root, no duplicated DOM ids, no extra window/document/screen listeners
// or intervals, one live menu screen, the selection ring on the focused item, released touch buttons, a fresh match
// and controller, the HUD hidden in the menus and live (with a full clock) in play, and a scene that does not grow.
// Then it opens the Practice Range, runs its real Match.update past 90 s of simulated time in the page, and checks
// that it is still playing (no time-up / judge / results) and that the next Turf War keeps its own clock.
//
//   node scripts/check-inkwave-rematch-lifecycle.mjs --site <built site> --evidence-dir <dir> --profile-dir <dir> [--cycles 10]
//   (INKWAVE_CHROMIUM=/path/to/chrome overrides the Playwright browser for a local run)
//
// Logic + browser evidence on Chromium/SwiftShader. Not a physical iPad / iOS Safari / Home Screen PWA measurement.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const option = (name, fallback) => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) { if (fallback !== undefined) return fallback; throw new Error('Required ' + name); } return process.argv[i + 1]; };
const site = path.resolve(option('--site')), evidence = path.resolve(option('--evidence-dir')), profile = path.resolve(option('--profile-dir'));
const cycles = Math.max(1, Math.floor(+option('--cycles', '10')));
const physical = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p)));
for (const d of [evidence, profile]) {
  const r = physical(d);
  if (['/tmp', '/var/tmp', '/dev/shm'].some((root) => r === root || r.startsWith(root + '/'))) throw new Error('Use workspace-owned persistent storage: ' + r);
  fs.mkdirSync(d, { recursive: true });
}
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
if (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw new Error('Build identity mismatch');

const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  try {
    const p = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = path.resolve(site, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(site + path.sep) || !fs.statSync(f).isFile()) throw 0;
    r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
  } catch { r.writeHead(404); r.end('Not found'); }
});
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const base = `http://127.0.0.1:${server.address().port}/`;
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const exe = process.env.INKWAVE_CHROMIUM ? { executablePath: process.env.INKWAVE_CHROMIUM } : {};
const ctx = await pw.chromium.launchPersistentContext(path.join(profile, 'rematch'), {
  headless: true, viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: IPAD, ...exe,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await ctx.newPage();
const errors = [], missing = [], failures = [], rounds = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 400)));
page.on('response', (r) => { if (r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });
// Count live listeners on window / document / screen.orientation / visualViewport and live intervals: anything that
// is added per round without being removed shows up as growth.
await page.addInitScript(() => {
  try { localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', lang: 'en', matchLength: 180 })); } catch {}
  const counts = (window.__lifecycleListeners = new Map()), live = new WeakMap();
  const owner = (t) => (t === window ? 'window' : t === document ? 'document' : t === window.screen?.orientation ? 'orientation' : t === window.visualViewport ? 'viewport' : null);
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const capture = (o) => (typeof o === 'object' ? !!o?.capture : !!o);
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    const who = owner(this);
    if (who && fn) {
      const key = `${who}:${type}:${capture(o)}`;
      let set = live.get(this); if (!set) live.set(this, (set = new Map()));
      const fns = set.get(key) || set.set(key, new Set()).get(key);
      if (!fns.has(fn)) {
        fns.add(fn); counts.set(key, (counts.get(key) || 0) + 1);
        o?.signal?.addEventListener('abort', () => { if (fns.delete(fn)) counts.set(key, counts.get(key) - 1); });
      }
    }
    return add.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    const who = owner(this), fns = who && live.get(this)?.get(`${who}:${type}:${capture(o)}`);
    if (fns?.delete(fn)) counts.set(`${who}:${type}:${capture(o)}`, counts.get(`${who}:${type}:${capture(o)}`) - 1);
    return remove.call(this, type, fn, o);
  };
  const intervals = new Set(), si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = (f, ms, ...a) => { const id = si(f, ms, ...a); intervals.add(id); return id; };
  window.clearInterval = (id) => { intervals.delete(id); return ci(id); };
  window.__lifecycleIntervals = () => intervals.size;
});

const until = async (fn, arg, ms = 300000, what = fn.toString().slice(0, 140)) => {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what);
    await page.waitForTimeout(200);
  }
};
const tap = async (id) => {
  const sel = `.iw-ui [data-id="${id}"]`;
  // what a player can actually press: laid out, not leaving/inert, pointer events on, and visible through every
  // ancestor (the results scoreboard waits below the fold at opacity 0 during its intro)
  await until((s) => {
    const e = document.querySelector(s);
    if (!e || e.closest('.is-leaving, [inert]') || getComputedStyle(e).pointerEvents === 'none') return false;
    let k = 1; for (let n = e; n && n !== document.body; n = n.parentElement) k *= +getComputedStyle(n).opacity;
    return e.getBoundingClientRect().width > 0 && k > 0.6;
  }, sel, 300000, 'tappable ' + id);
  await page.tap(sel, { timeout: 30000 });
};
const menuIs = (name) => until((n) => window.__inkwave?.menus?.current === n, name, 300000, 'menu ' + name);
const snap = () => page.evaluate(() => {
  const g = window.__inkwave, G = window.__G, m = g.match, menus = g.menus, mob = g.input?.mobile, hud = g.hud;
  const ids = {};
  for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
  const q = (s) => document.querySelectorAll(s).length;
  const f = menus?._focus, ring = menus?.cursorEl, C = menus?._cur;
  const n = (v) => Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: n(r.x), y: n(r.y), top: n(r.top), right: n(r.right), bottom: n(r.bottom), left: n(r.left), width: n(r.width), height: n(r.height) };
  };
  const spring = (s) => s ? { target: n(s.target), position: n(s.x), velocity: n(s.v), stiffness: n(s.k), damping: n(s.c) } : null;
  const ringStyle = ring ? getComputedStyle(ring) : null;
  let connectedPads = [];
  try {
    connectedPads = Array.from(navigator.getGamepads?.() || []).slice(0, 4).filter((pad) => pad?.connected).map((pad) => ({
      index: pad.index, id: String(pad.id || '').slice(0, 120), mapping: pad.mapping, connected: !!pad.connected,
      buttonCount: pad.buttons.length, axisCount: pad.axes.length,
    }));
  } catch {}
  let ringOnFocus = null;
  if (C?.on && f?.isConnected) {
    const r = f.getBoundingClientRect(), pad = f.dataset.curPad != null ? +f.dataset.curPad : 7;
    ringOnFocus = Math.abs(C.x.x - (r.left - pad)) < 0.6 && Math.abs(C.y.x - (r.top - pad)) < 0.6 && Math.abs(C.w.x - (r.width + pad * 2)) < 0.6;
  }
  m.__lifecycleId ||= Math.random().toString(36).slice(2);
  return {
    mode: G.mode, menu: menus?.current, screen: menus?._scr?.name || null, state: m?.state, attract: !!m?.attract, matchId: m.__lifecycleId,
    duplicateIds: Object.entries(ids).filter(([, n]) => n > 1), huds: q('.iw-hud'), hudOverlays: q('.iw-hud-over'), menuLayers: q('.iw-ui'),
    screens: q('.iw-ui .iw-screen:not(.is-leaving)'), mobileRoots: q('#iw-mobile-controls, [id^="iw-mobile"]'),
    hudHidden: hud?.el.classList.contains('is-hidden'), hudLive: hud?.el.classList.contains('is-live'), hudRange: hud?.el.classList.contains('iw-hud--range'), timer: hud?.timerTxt?.textContent, lineup: q('.iw-sq'),
    judges: q('.iw-jd'), touchVisible: !!mob?.visible, touchDown: mob ? Object.entries(mob.buttons).filter(([k, v]) => v && k !== 'map').map(([k]) => k) : [], touchDownEls: mob?.root?.querySelectorAll('.is-down').length ?? 0,
    starting: !!menus?._starting, modal: !!menus?._modal, focusConnected: f ? f.isConnected : null, ringOn: !!C?.on, ringVisible: ring ? ring.style.visibility !== 'hidden' : null, ringOnFocus,
    uiDiagnostics: {
      menuInputOwner: menus?._input ?? null, inputLastDevice: g.input?.lastDevice ?? null,
      focus: f ? { connected: f.isConnected, id: f.id || null, nav: f.dataset.nav ?? null, cur: f.dataset.cur ?? null, type: f.type ?? null, tagName: f.tagName || null, rect: rect(f) } : null,
      screenNoCursor: menus?._scr?.noCursor ?? null,
      ring: ring ? { className: String(ring.className), display: ringStyle.display, visibility: ringStyle.visibility, opacity: ringStyle.opacity, rect: rect(ring) } : null,
      cursorAnimation: C ? { on: !!C.on, snapNext: !!C.snapNext, radius: C.r ?? null, axes: { x: spring(C.x), y: spring(C.y), w: spring(C.w), h: spring(C.h) } } : null,
      document: { visibilityState: document.visibilityState, hidden: document.hidden }, connectedPads,
      frameDriver: {
        platform: g.platform?.driver?.snapshot?.() ?? null,
        menuRaf: menus?._raf ?? null, menuLastT: n(menus?._lastT), menuExternalTick: n(menus?._extTick),
        main: { frozen: !!g.frozen, frameRate: g.settings?.frameRate ?? null, fps: n(g.fps), fpsAcc: n(g.fpsAcc), fpsN: Number.isFinite(g.fpsN) ? g.fpsN : null, frameCapAcc: n(g._frameCapAcc), frameCapElapsed: n(g._frameCapElapsed), frameN: Number.isFinite(g._frameN) ? g._frameN : null },
      },
    },
    controller: m?.controller ? { enabled: m.controller.enabled, blocked: !!m.controller.menuBlocked, local: m.controller.a === m.local } : null,
    rigFollowsLocal: g.rig?.mode === 'follow' && g.rig?.target === m?.local, actors: G.actors?.length, sights: G.projectiles?.sights?.size,
    sceneChildren: G.scene?.children.length, listeners: Object.fromEntries([...window.__lifecycleListeners].filter(([, n]) => n > 0).sort()), intervals: window.__lifecycleIntervals(),
    fade: g.fadeEl ? +getComputedStyle(g.fadeEl).opacity : null, range: !!m?.range, time: Number.isFinite(m?.time) ? m.time : String(m?.time),
  };
});
const check = (round, phase, cond, message, detail) => { if (!cond) failures.push({ round, phase, message, detail }); };

let status = 'failed';
try {
  await page.goto(base + '?skipTitle', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await until(() => window.__inkwave?.menus?.current === 'main' || document.getElementById('boot-error')?.textContent, null, 420000, 'boot');
  const bootError = await page.evaluate(() => document.getElementById('boot-error')?.textContent || '');
  if (bootError) throw new Error('boot error: ' + bootError);
  let baseline = null, previousMatch = null;
  for (let i = 0; i < cycles; i++) {
    const round = { round: i + 1 };
    await tap('play'); await menuIs('mode');
    await tap('mode-turf'); await menuIs('setup');
    await tap('start');
    await until(() => { const m = window.__G.match; return m && !m.attract && m.state === 'playing' && Number.isFinite(m.time) && Number.isFinite(m.duration) && m.time < m.duration; }, null, 300000, 'battle playing with a completed fixed tick');
    await page.waitForTimeout(600);
    const play = (round.play = await snap());
    check(i + 1, 'play', play.mode === 'match' && play.menu === null && play.screen === null, 'menus closed in play', play);
    check(i + 1, 'play', play.matchId !== previousMatch, 'a fresh match object');
    previousMatch = play.matchId;
    check(i + 1, 'play', play.hudHidden === false && play.hudLive === true && play.hudRange === false, 'HUD visible and live', play);
    check(i + 1, 'play', play.timer === '3:00' || play.timer === '2:59', 'HUD clock restarted at the Turf War length', play.timer);
    check(i + 1, 'play', play.lineup === 8 && play.actors === 8, 'eight-player lineup', [play.lineup, play.actors]);
    check(i + 1, 'play', play.touchVisible && play.touchDown.length === 0 && play.touchDownEls === 0, 'touch controls visible and released', play);
    check(i + 1, 'play', play.controller?.enabled && !play.controller.blocked && play.controller.local && play.rigFollowsLocal, 'controller and camera own the new local player', play.controller);
    check(i + 1, 'play', !play.ringOn && !play.ringVisible && play.judges === 0, 'no menu ring or judge overlay over play', play);
    await page.evaluate(() => { window.__G.match.time = 0.05; });
    await menuIs('results');
    await page.waitForTimeout(800);
    const results = (round.results = await snap());
    check(i + 1, 'results', results.state === 'results' && results.hudHidden && !results.touchVisible, 'results own the screen', results);
    // every third round an impatient player taps MAIN MENU again at the same spot while the screen changes
    const impatient = i % 3 === 1;
    await tap('home');
    if (impatient) {
      // the button's live position each time; force = no actionability wait, the tap goes to whatever is on top
      for (const gap of [120, 330, 260]) {
        await page.waitForTimeout(gap);
        await page.locator('.iw-ui [data-id="home"]').first().tap({ force: true, timeout: 3000 }).catch(() => {});
      }
    }
    await until(() => window.__inkwave.menus?.current === 'main' && window.__G.mode === 'menu' && window.__G.match?.attract, null, 300000, 'main menu');
    if (impatient) {
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => ({ menu: window.__inkwave.menus.current, mode: window.__G.mode }));
      check(i + 1, 'menu', after.menu === 'main' && after.mode === 'menu', 'repeated MAIN MENU taps land on no other screen (no REMATCH / LOADOUT tap-through)', after);
    }
    await until(() => !document.querySelector('.iw-ui .iw-screen.is-leaving') && +getComputedStyle(window.__inkwave.fadeEl).opacity < 0.05, null, 30000, 'menu settled');
    await until(() => { const f = window.__inkwave.menus._focus; return f && +getComputedStyle(f).opacity > 0.6; }, null, 30000, 'menu entrance');
    await page.waitForTimeout(300);
    const menu = (round.menu = await snap());
    check(i + 1, 'menu', menu.menu === 'main' && menu.screen === 'main' && menu.screens === 1 && !menu.starting && !menu.modal, 'one live main menu screen', menu);
    check(i + 1, 'menu', menu.huds === 1 && menu.hudOverlays === 1 && menu.menuLayers === 1 && menu.mobileRoots === 1 && menu.duplicateIds.length === 0, 'no duplicated UI roots or ids', menu);
    check(i + 1, 'menu', menu.hudHidden && !menu.touchVisible && menu.touchDown.length === 0 && menu.judges === 0, 'HUD and touch controls retired in the menus', menu);
    check(i + 1, 'menu', menu.focusConnected === true && !menu.ringOn && !menu.ringVisible,
      'touch-owned return preserves focus without displaying a keyboard selection ring', menu);
    await page.keyboard.press('ArrowDown');
    await until(() => {
      const m=window.__inkwave.menus,c=m?._cur,f=m?._focus;
      if(!c?.on||!f?.isConnected||m.cursorEl?.style.visibility==='hidden')return false;
      const r=f.getBoundingClientRect(),pad=f.dataset.curPad!=null?+f.dataset.curPad:7;
      return Math.abs(c.x.x-(r.left-pad))<.6&&Math.abs(c.y.x-(r.top-pad))<.6&&Math.abs(c.w.x-(r.width+pad*2))<.6;
    }, null, 30000, 'keyboard selection aligned to focus');
    const keyboardMenu = await snap();
    check(i + 1, 'menu', keyboardMenu.ringOn && keyboardMenu.ringVisible && keyboardMenu.ringOnFocus === true,
      'keyboard handoff restores the selection ring on the focused item (no pixel readback)', keyboardMenu);
    check(i + 1, 'menu', menu.fade < 0.05, 'fade cleared', menu.fade);
    if (!baseline) baseline = menu;
    else {
      check(i + 1, 'menu', JSON.stringify(menu.listeners) === JSON.stringify(baseline.listeners), 'listener set stable across rounds', { now: menu.listeners, first: baseline.listeners });
      check(i + 1, 'menu', menu.intervals === baseline.intervals, 'interval count stable', [menu.intervals, baseline.intervals]);
      // pooled charger sights come and go with the attract bots' weapons; a leaked match would add whole squads
      check(i + 1, 'menu', (menu.sceneChildren - menu.sights) - (baseline.sceneChildren - baseline.sights) <= 2, 'scene does not accumulate objects', [menu.sceneChildren, menu.sights, baseline.sceneChildren, baseline.sights]);
      check(i + 1, 'menu', menu.sights <= 8, 'charger sight pool bounded', menu.sights);
    }
    rounds.push(round);
    console.log(`round ${i + 1}/${cycles}: ${failures.filter((f) => f.round === i + 1).length ? 'FAIL' : 'ok'}`);
  }

  // Practice Range: untimed, and it does not leak into the next Turf War.
  const rangeRound = { round: 'range' };
  await page.evaluate(() => window.__inkwave.startRange());
  await until(() => { const m = window.__G.match; return m && m.range && m.state === 'playing'; }, null, 300000, 'range playing');
  const range = (rangeRound.start = await snap());
  check('range', 'start', range.time === 'Infinity' && range.hudRange === true, 'range match has no clock and its own HUD', range);
  rangeRound.simulated = await page.evaluate(() => {
    const m = window.__G.match;
    for (let i = 0; i < 95 * 60; i++) m.update(1 / 60);
    return { state: m.state, result: !!m.result, time: String(m.time), menu: window.__inkwave.menus.current, range: !!m.range };
  });
  check('range', 'simulated', rangeRound.simulated.state === 'playing' && !rangeRound.simulated.result && rangeRound.simulated.menu === null, 'range still playing after 95 simulated seconds', rangeRound.simulated);
  await page.evaluate(() => window.__inkwave.api.quitMatch());
  await until(() => window.__inkwave.menus?.current === 'main' && window.__G.mode === 'menu', null, 300000, 'menu after range');
  await tap('play'); await menuIs('mode');
  await tap('mode-turf'); await menuIs('setup');
  await tap('start');
  await until(() => { const m = window.__G.match; return m && !m.attract && m.state === 'playing'; }, null, 300000, 'battle after range');
  await page.waitForTimeout(600);
  const after = (rangeRound.turfAfter = await snap());
  check('range', 'turf after', after.range === false && after.hudRange === false && (after.timer === '3:00' || after.timer === '2:59') && Number.isFinite(after.time), 'next Turf War keeps its own clock and HUD', after);
  rounds.push(rangeRound);
  status = failures.length || errors.length ? 'failed' : 'passed';
} catch (e) {
  failures.push({ round: 'fatal', message: String(e?.stack || e).slice(0, 2000) });
} finally {
  const result = { status, contentHash: manifest.contentHash, cycles, failures, errors, missing, rounds };
  fs.writeFileSync(path.join(evidence, 'rematch-lifecycle-result.json'), JSON.stringify(result, null, 2) + '\n');
  await ctx.close().catch(() => {}); server.close();
  console.log(JSON.stringify({ status, failures: failures.slice(0, 20), errors: errors.slice(0, 10) }, null, 1));
  process.exitCode = status === 'passed' ? 0 : 1;
}
