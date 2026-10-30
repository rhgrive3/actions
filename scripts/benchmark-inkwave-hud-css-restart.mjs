#!/usr/bin/env node
// Synthetic event-burst diagnostic; never interpret this as game frame time.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { parse } from '../patches/loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from './inkwave-source-composition.mjs';

const root = process.cwd();
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
const baselineRef = option('--baseline');
if (!/^[0-9a-f]{7,40}$/.test(baselineRef || '')) throw new Error('--baseline requires a commit SHA');
const evidence = path.resolve(option('--evidence-dir') || '.browser-evidence/hud-css-restart-bench');
fs.mkdirSync(evidence, { recursive: true });
const raw = fs.readFileSync(path.join(root, 'inkwave-public/src/ui/hud.js'), 'utf8');
const baseline = execFileSync('git', ['show', baselineRef + ':inkwave-public/src/ui/hud.js'], { cwd: root, encoding: 'utf8' });
const methods = input => {
  const source = adaptBuildSource('src/ui/hud.js', input), ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const cls = ast.body.map(n => n.declaration || n).find(n => n.type === 'ClassDeclaration' && n.body.body.some(m => m.key?.name === '_turfPop'));
  return cls.body.body.filter(m => ['_restartCssAnimation', '_restart', '_turfPop', '_bindBus'].includes(m.key?.name)).map(m => source.slice(m.start, m.end)).join('\n');
};
const css = ['styles/hud.css', 'styles/ui.css'].map(rel => adaptBuildSource(rel, fs.readFileSync(path.join(root, 'inkwave-public', rel), 'utf8')).replace(/@import\s+url\([^;]+;/g, '')).join('\n');
const util = fs.readFileSync(path.join(root, 'inkwave-public/src/ui/ui-util.js'), 'utf8');
const domSource = util.slice(util.indexOf('const TR_ATTRS'), util.indexOf('/**')).replace('export function h(', 'function h(');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<style>' + css + '</style><div id="fixture"></div>');
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const samples = [];
  for (let round = 0; round < 5; round++) for (const variant of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    await page.evaluate(({ source, domSource }) => {
      const host = document.getElementById('fixture');
      host.innerHTML = '<div class="iw-hud" style="position:absolute;inset:0"><div class="iw-turf"><i><svg viewBox="0 0 64 64"><path d="M32 5L55 55H9Z" fill="currentColor"/></svg></i><b>100</b><small>p</small></div><div class="iw-xh"><div class="iw-tank"><canvas class="iw-tank__cv"></canvas><div class="iw-tank__low">LOW INK</div></div><div class="iw-tpops"></div></div></div>';
      const listeners = new Map(), local = {};
      const HUD = Function('on', 'tx', domSource + '\nreturn class {' + source + '}')((name, fn) => { listeners.set(name, fn); return () => {}; }, s => s);
      const h = new HUD(); Object.assign(h, { el: host.firstElementChild, turfEl: host.querySelector('.iw-turf'), tank: host.querySelector('.iw-tank'), tpops: host.querySelector('.iw-tpops'), _tank: {}, _local: () => local, _live: () => true });
      h._bindBus();
      let reads = 0, seed = 48271;
      Math.random = () => ((seed = Math.imul(seed, 16807) >>> 0) / 4294967296);
      const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get;
      for (const node of [h.turfEl, h.tank]) Object.defineProperty(node, 'offsetWidth', { get() { reads++; return width.call(this); } });
      const event = () => { h._turfPop(25); listeners.get('lowink')({ actor: local }); };
      for (let i = 0; i < 20; i++) event();
      h.el.getBoundingClientRect(); reads = 0;
      window.runEvents = count => { const start = performance.now(); for (let i = 0; i < count; i++) event(); h.el.getBoundingClientRect(); return { elapsedMs: performance.now() - start, offsetWidthReads: reads, tickerNodes: h.tpops.children.length, warning: h._tank.empty }; };
    }, { source: methods(variant === 'candidate' ? raw : baseline), domSource });
    const before = await metrics();
    const result = await page.evaluate(() => window.runEvents(500));
    const after = await metrics();
    const delta = Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration'].map(k => [k, after[k] - before[k]]));
    samples.push({ round, variant, ...result, ...delta });
  }
  const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const summaries = Object.fromEntries(['baseline', 'candidate'].map(variant => [variant, Object.fromEntries(['elapsedMs', 'LayoutCount', 'RecalcStyleCount', 'offsetWidthReads'].map(key => [key, median(samples.filter(x => x.variant === variant).map(x => x[key]))]))]));
  const result = { baselineRef, note: 'Synthetic real DOM/CSS event burst: 500 turf pop + lowink pairs per sample, 5 alternating samples after 20-pair warmup. Not game frame time or FPS.', browser: await browser.version(), summaries, samples };
  fs.writeFileSync(path.join(evidence, 'event-bench.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
