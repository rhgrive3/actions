#!/usr/bin/env node
// Browser acceptance for the emitted title, native menu lifecycle and demo budget.
// This uses normal RAF and real renderer calls; software WebGL is not device FPS.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const site = fs.realpathSync(option('--site', '_site'));
const output = path.resolve(option('--evidence-dir', 'reports/title-redesign-browser'));
const baseline = process.argv.includes('--baseline');
const screensOnly = process.argv.includes('--screens-only');
const timeout = Number(option('--boot-timeout', '300000'));
const quality = option('--quality', 'high');
const dpr = Number(option('--dpr', '1'));
assert(['low', 'medium', 'high', 'ultra'].includes(quality), 'supported quality');
assert(Number.isFinite(timeout) && timeout > 0 && Number.isFinite(dpr) && dpr > 0, 'positive timeout and DPR');
fs.mkdirSync(output, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const harnessSource = fs.readFileSync(new URL(import.meta.url));
fs.writeFileSync(path.join(output, 'harness-at-run.mjs'), harnessSource);
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash, 'build manifest integrity');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const report = {
  schema: 1, status: 'running', baseline, screensOnly,
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contentHash: manifest.contentHash, buildRevision: manifest.build?.revision,
  harnessHash: hash(harnessSource),
  conditions: { quality, dpr, rendering: 'Chromium software WebGL', physicalDevice: false,
    clock: 'native RAF; no manual game frames or debug freeze',
    gamepad: 'real Menus.nav accept route; no physical gamepad claim', news: 'disabled by shipped news=0 option to isolate title navigation',
    fontConfig: process.env.FONTCONFIG_FILE || 'system default' },
  contexts: [], errors: [], consoleErrors: [], artifactFailures: [],
};
const save = () => fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm' };
const validated = new Set();
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = fs.realpathSync(path.resolve(site, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname))));
    assert(file.startsWith(site + path.sep), 'artifact within site');
    const rel = path.relative(site, file), bytes = fs.readFileSync(file);
    if (rel !== 'inkwave-build.json' && !validated.has(rel)) {
      if (hash(bytes) !== manifest.artifacts[rel]) { report.artifactFailures.push(rel); throw Error('build artifact mismatch'); }
      validated.add(rel);
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser, currentPage;

async function ready(page, name) {
  await page.waitForFunction(expected => {
    const m = window.__inkwave?.menus, el = m?._scr?.el;
    return m?.current === expected && m?._scr?.name === expected && el?.isConnected && !el.inert &&
      !el.classList.contains('is-leaving') && performance.now() - m._shownAt >= 400 &&
      Number(getComputedStyle(el).opacity) > .95;
  }, name, { timeout });
}

async function observe(page, ms = 1600) {
  return page.evaluate(async ms => {
    const G = window.__G, g = window.__inkwave, counts = { frames: 0, worldRenders: 0, matchUpdates: 0, menuUpdates: 0, presents: 0 };
    const restore = [];
    for (const [owner, key, label] of [[g, '_frame', 'frames'], [g.R, 'render', 'worldRenders'],
      [g.match, 'update', 'matchUpdates'], [g.menus, 'update', 'menuUpdates'], [g.R, 'presentPausedFrame', 'presents']]) {
      if (typeof owner?.[key] !== 'function') continue;
      const original = owner[key];
      owner[key] = function (...args) { counts[label]++; return original.apply(this, args); };
      restore.push(() => { owner[key] = original; });
    }
    const start = performance.now(), gameTime = G.time, match = g.match;
    try {
      // A fixed 1-2 s window can contain zero RAF callbacks on software WebGL
      // immediately after a resize or retained-frame exit. Require actual
      // native frames so a blank observation is never treated as a budget win
      // or a resume regression. The finite bound still rejects a stopped loop.
      while (performance.now() - start < ms || counts.frames < 3) {
        if (performance.now() - start > 30000) throw Error('No three native game frames within observation bound');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const gl = G.renderer.getContext(), state = g._titleDemo;
      return { elapsedMs: performance.now() - start, gameTimeAdvanced: G.time - gameTime, counts,
        menu: g.menus.current, mounted: g.menus._scr?.name, mode: G.mode,
        sameMatch: match === g.match, attract: !!g.match?.attract,
        actors: g.match?.actors?.length, teams: [0, 1].map(team => g.match?.actors?.filter(a => a.team === team).length),
        titleDemoMatch: g.match?.opts?.titleDemo === true,
        demo: state ? { active: !!state.active, hz: state.hz, savedScale: state.savedScale,
          reduced: !!state.reduced, captured: !!state.captured } : null,
        dynScale: g.R.dynScale, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        rendererMemory: { ...G.renderer.info.memory },
        canvasVisibility: getComputedStyle(G.renderer.domElement).visibility,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        hidden: document.hidden, focused: document.hasFocus(), frozen: !!g.frozen, skipRender: !!g._skipRender,
        glError: gl.getError(), contextLost: gl.isContextLost(),
      };
    } finally { for (const restoreMethod of restore) restoreMethod(); }
  }, ms);
}

async function capture(page, row, name, viewport) {
  await page.setViewportSize(viewport);
  await ready(page, 'title');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(650);
  const layout = await page.evaluate(() => {
    const root = window.__inkwave.menus._scr.el;
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const button = root.querySelector('[data-title-start="1"]');
    const semantic = [...root.querySelectorAll('[data-title-start], .iw-launch__wordmark, .iw-launch__tagline, .iw-launch__input, .iw-launch__eyebrow, .iw-launch__footer, .iw-launch__edition')]
      .filter(el => getComputedStyle(el).display !== 'none')
      .map(el => ({ selector: el.className, rect: rect(el), text: el.textContent.trim(), scroll: [el.scrollWidth, el.clientWidth] }));
    const animations = root.getAnimations({ subtree: true }).map(a => {
      const timing = a.effect?.getComputedTiming();
      return { name: a.animationName || null, playState: a.playState, duration: timing?.duration,
        iterations: timing?.iterations === Infinity ? 'infinite' : timing?.iterations };
    });
    return { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, root: rect(root),
      document: [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight],
      button: button ? { tag: button.tagName, type: button.type, label: button.getAttribute('aria-label'), rect: rect(button), disabled: button.disabled, tabIndex: button.tabIndex } : null,
      startHasFocus: button ? document.activeElement === button : false,
      semantic, animations, inputMode: window.__inkwave.menus._input,
      touch: !!window.__inkwave.mobile?.touch,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  const image = name + '.png';
  await page.screenshot({ path: path.join(output, image), timeout: 120000, animations: 'allow' });
  row.screens.push({ name, image, ...layout }); save();
  assert.deepEqual(layout.viewport, [viewport.width, viewport.height], 'actual viewport');
  if (!baseline) {
    assert(layout.document[0] <= layout.document[1] + 1, 'title cannot widen the page');
    assert(layout.document[2] <= layout.document[3] + 1, 'title cannot create vertical page overflow');
    assert.equal(layout.button?.tag, 'BUTTON', 'native start button exists');
    assert.equal(layout.button.type, 'button');
    assert(layout.button.label?.trim(), 'start button has accessible name');
    assert(!layout.button.disabled, 'start button enabled');
    if (layout.inputMode !== 'touch') assert(layout.startHasFocus, 'keyboard title focus belongs to its start button');
    const b = layout.button.rect;
    assert(b.width >= 44 && b.height >= 44, 'start hit target at least 44 CSS px');
    assert(b.x >= -1 && b.y >= -1 && b.right <= viewport.width + 1 && b.bottom <= viewport.height + 1, 'entire start button visible');
    for (const el of layout.semantic) {
      assert(el.rect.x >= -1 && el.rect.right <= viewport.width + 1 && el.rect.y >= -1 && el.rect.bottom <= viewport.height + 1,
        'title semantic region visible: ' + el.selector);
      assert(el.scroll[0] <= el.scroll[1] + 2, 'title semantic content does not clip horizontally: ' + el.selector);
    }
    if (layout.reducedMotion) assert(!layout.animations.some(a => a.playState === 'running' && a.iterations === 'infinite'), 'reduced motion has no endless title animation');
  }
  console.log('title screenshot', name, JSON.stringify({ viewport: layout.viewport, touch: layout.touch, start: layout.button?.rect }));
}

async function returnTitle(page) {
  await ready(page, 'main');
  await page.keyboard.press('Escape');
  await ready(page, 'title');
}

async function accept(page, row, method) {
  await ready(page, 'title');
  await page.evaluate(() => {
    const m = window.__inkwave.menus, show = m.show;
    const proof = window.__titleAcceptanceProof = { transitions: 0, events: [], input: m._input };
    m.show = function (name, ...args) { if (name === 'main' && this.current === 'title') proof.transitions++; return show.call(this, name, ...args); };
    proof.restore = () => { m.show = show; };
    const event = e => { if (m._scr?.el?.contains(e.target)) proof.events.push({ type: e.type, trusted: e.isTrusted, tag: e.target.tagName }); };
    document.addEventListener('click', event, true); document.addEventListener('keydown', event, true);
    proof.unbind = () => { document.removeEventListener('click', event, true); document.removeEventListener('keydown', event, true); };
  });
  const selector = baseline ? '.iw-title' : '[data-title-start="1"]';
  if (method === 'tap') await page.locator(selector).tap({ timeout });
  else if (method === 'keyboard') await page.keyboard.press('Enter');
  else if (method === 'gamepad-route') await page.evaluate(() => window.__inkwave.menus.nav('accept'));
  else {
    // Two native clicks while the confirmation owns its 200 ms delay must
    // still produce exactly one title->main navigation.
    await page.locator(selector).dblclick({ delay: 20, timeout });
  }
  await ready(page, 'main');
  const proof = await page.evaluate(() => {
    const p = window.__titleAcceptanceProof, g = window.__inkwave;
    p.restore(); p.unbind(); delete window.__titleAcceptanceProof;
    return { transitions: p.transitions, events: p.events, inputBefore: p.input,
      // _audioOn is a keyboard-initialization flag; pointer/touch sounds use
      // the menu API and AudioEngine directly. Inspect the real context.
      menu: g.menus.current, inputAfter: g.menus._input, keyboardAudioInitialized: !!g._audioOn,
      audioContextState: window.__G.audio?.ctx?.state ?? null,
      musicContextState: window.__G.music?.ctx?.state ?? null,
      actors: g.match?.actors?.length, demoActive: !!g._titleDemo?.active,
      retainedDemoMatch: g._titleDemo?.match != null,
      canvasVisibility: getComputedStyle(window.__G.renderer.domElement).visibility };
  });
  row.navigation.push({ method, ...proof }); save();
  assert.equal(proof.transitions, 1, 'one title confirmation transition');
  if (method !== 'gamepad-route') {
    assert(proof.events.some(e => e.trusted), 'trusted browser input observed');
    assert.equal(proof.audioContextState, 'running', 'native first gesture unlocks the real audio context');
  }
  if (!baseline) {
    assert.equal(proof.actors, 0, 'main art has no invisible demo bots');
    assert.equal(proof.demoActive, false, 'demo budget relinquished off title');
    assert.equal(proof.retainedDemoMatch, false, 'departed title does not retain its disposed match');
  }
  console.log('title input', method, JSON.stringify(proof));
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  report.browser = browser.version(); save();
  const specs = [
    { name: 'desktop', touch: false, boot: { width: 960, height: 540 }, sizes: [['desktop', 1440, 900]] },
    { name: 'touch', touch: true, boot: { width: 844, height: 390 }, sizes: [['ipad-portrait', 744, 1133], ['ipad-landscape', 1133, 744], ['phone-portrait', 390, 844], ['phone-landscape', 844, 390]] },
  ].filter(spec => !process.argv.includes('--desktop-only') || !spec.touch)
    .filter(spec => !process.argv.includes('--mobile-only') || spec.touch);
  for (const spec of specs) {
    const context = await browser.newContext({ viewport: spec.boot, deviceScaleFactor: dpr, hasTouch: spec.touch, isMobile: spec.touch, serviceWorkers: 'block', reducedMotion: 'no-preference' });
    const page = currentPage = await context.newPage();
    const row = { name: spec.name, screens: [], navigation: [] }; report.contexts.push(row); save();
    page.on('pageerror', error => { report.errors.push({ context: spec.name, message: error.message }); save(); });
    page.on('console', message => { if (message.type() === 'error') { report.consoleErrors.push({ context: spec.name, message: message.text() }); save(); } });
    await page.addInitScript(({ quality }) => {
      localStorage.setItem('inkwave.settings', JSON.stringify({ quality, master: 0, music: 0, lang: 'ja', frameRate: 60 }));
    }, { quality });
    const start = Date.now();
    await page.goto(origin + '/?map=tidewater&news=0', { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(() => window.__inkwave?.menus?._scr?.name === 'title' && window.__G?.renderer, null, { timeout });
    await ready(page, 'title');
    row.bootMs = Date.now() - start; save(); console.log('title boot', spec.name, row.bootMs);
    row.normal = await observe(page); save();
    assert(row.normal.counts.frames > 0 && row.normal.counts.menuUpdates > 0, 'native game and UI loop observed');
    assert(!row.normal.contextLost && row.normal.glError === 0 && !row.normal.frozen && !row.normal.skipRender, 'valid live WebGL observation');
    if (!baseline) {
      assert.equal(row.normal.actors, 4, 'lighter attract has four actors');
      assert.deepEqual(row.normal.teams, [2, 2], 'balanced lighter demo');
      assert(row.normal.demo?.active, 'title demo runtime active');
      assert(row.normal.counts.worldRenders <= Math.ceil(row.normal.elapsedMs / 1000 * row.normal.demo.hz) + 2, 'observed title renders obey cap');
    }
    for (const [name, width, height] of spec.sizes) await capture(page, row, name, { width, height });
    await page.setViewportSize(spec.boot);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(500);
    await capture(page, row, spec.name + '-reduced-motion', spec.boot);
    if (!baseline) await page.waitForFunction(() => window.__inkwave?._titleDemo?.reduced && window.__inkwave._titleDemo.captured, null, { timeout });
    row.reduced = await observe(page); save();
    if (!baseline) {
      assert.equal(row.reduced.counts.worldRenders, 0, 'settled reduced-motion title does not render the world');
      assert.equal(row.reduced.counts.matchUpdates, 0, 'reduced-motion title does not simulate its bots');
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(400);
    row.resumed = await observe(page, 1000); save();
    if (!baseline) assert(row.resumed.counts.worldRenders > 0, 'live title resumes after reduced motion changes');
    if (!screensOnly) {
      for (const method of spec.touch ? ['tap'] : ['double-click', 'keyboard', 'gamepad-route']) {
        await accept(page, row, method);
        await returnTitle(page);
        const reentry = await observe(page, 450);
        row.navigation.at(-1).reentry = reentry; save();
        if (!baseline) { assert.equal(reentry.actors, 4); assert.equal(reentry.canvasVisibility, 'visible'); assert(reentry.demo?.active); }
      }
      // The real application start path constructs its normal eight-actor
      // match. The harness does not replace setup, bots or the render loop.
      if (!spec.touch) {
        await accept(page, row, 'keyboard');
        await page.setViewportSize({ width: 640, height: 360 });
        await page.evaluate(async () => { await window.__inkwave.startMatch({ mapId: 'tidewater', difficulty: 'normal', duration: 90 }); });
        await page.waitForFunction(() => window.__G?.mode === 'match' && !window.__G.match.attract && window.__G.match.actors?.length === 8, null, { timeout });
        row.gameplay = await observe(page, 1200); save();
        assert.equal(row.gameplay.actors, 8, 'normal gameplay keeps eight actors');
        assert.deepEqual(row.gameplay.teams, [4, 4]);
        assert.equal(row.gameplay.attract, false);
        if (!baseline) assert.equal(row.gameplay.demo?.active, false, 'title budget is absent during gameplay');
      }
    }
    await context.close(); currentPage = null; save();
  }
  assert.deepEqual(report.artifactFailures, [], 'all served artifacts match the emitted build');
  assert.deepEqual(report.errors, [], 'no browser runtime exceptions');
  report.status = 'passed'; save();
  console.log('title verification passed', JSON.stringify({ contentHash: report.contentHash, contexts: report.contexts.length, baseline, screensOnly }));
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || String(error); save();
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(output, 'failure.png'), timeout: 30000 }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
