#!/usr/bin/env node
// Composed-source DOM/CSS verification; this is separate from full-game performance.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { parse } from '../patches/loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from './inkwave-source-composition.mjs';
import { LayoutSample } from '../patches/local-quality/layout-sample.mjs';

const root = process.cwd();
const option = process.argv.indexOf('--evidence-dir');
const evidence = path.resolve(option < 0 ? '.browser-evidence/hud-css-restart' : process.argv[option + 1]);
fs.mkdirSync(evidence, { recursive: true });
const read = rel => fs.readFileSync(path.join(root, 'inkwave-public', rel), 'utf8');
const source = adaptBuildSource('src/ui/hud.js', read('src/ui/hud.js'));
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const cls = ast.body.map(n => n.declaration || n).find(n => n.type === 'ClassDeclaration' && n.body.body.some(m => m.key?.name === '_restartCssAnimation'));
let methods = cls.body.body.filter(m => ['_restartCssAnimation', '_restart'].includes(m.key?.name)).map(m => source.slice(m.start, m.end)).join('\n');
if (process.argv.includes('--negative-play')) methods = methods.replace('animation.currentTime = 0;', 'animation.currentTime = 0; if (state === \'finished\') animation.play();');
const css = adaptBuildSource('styles/hud.css', read('styles/hud.css')) + '\n' + adaptBuildSource('styles/ui.css', read('styles/ui.css')).replace(/@import\s+url\([^;]+;/g, '');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const result = { note: 'Real Chromium DOM/CSS parity fixture; no frame-time or retail-fidelity claim.', scenarios: [] };
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    await page.setContent('<style>' + css + '</style><div id="fixtures"></div>');
    result.scenarios.push(await page.evaluate(async ({ methods, reducedMotion, layoutSource }) => {
      const HUD = Function('return class {' + methods + '}')();
      const errors = [], rows = [], diagnostics = [];
      const ensure = (condition, message) => { if (!condition) errors.push(message); };
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      function make(id) {
        const root = document.createElement('div'); root.id = id; root.className = 'iw-hud'; root.style.cssText = 'position:absolute;inset:0;';
        root.innerHTML = '<div class="iw-turf"><i><svg viewBox="0 0 64 64"><path d="M32 5C32 5 51 28 51 41C51 65 13 65 13 41C13 28 32 5 32 5Z" fill="currentColor"/></svg></i><b>100</b><small>p</small></div><div class="iw-xh"><div class="iw-tank"><canvas class="iw-tank__cv"></canvas><div class="iw-tank__low">LOW INK</div></div></div>';
        document.getElementById('fixtures').append(root);
        const hud = new HUD(), turf = root.querySelector('.iw-turf'), tank = root.querySelector('.iw-tank');
        let reads = 0;
        const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get;
        for (const node of [turf, tank]) Object.defineProperty(node, 'offsetWidth', { get() { reads++; return width.call(this); } });
        return { root, hud, turf, tank, reads: () => reads };
      }
      let old = make('original'), candidate = make('candidate');
      const props = ['scale', 'rotate', 'translate', 'transform', 'animationName', 'animationDuration', 'animationTimingFunction', 'animationFillMode', 'animationPlayState'];
      const style = node => Object.fromEntries(props.map(key => [key, getComputedStyle(node)[key]]));
      const restart = (rig, kind, optimized) => {
        const owner = rig[kind], target = kind === 'turf' ? owner.firstElementChild : owner, cls = kind === 'turf' ? 'is-tick' : 'is-empty', name = kind === 'turf' ? 'iw-turf-tick' : 'iw-shake';
        optimized ? rig.hud._restartCssAnimation(owner, cls, target, name) : rig.hud._restart(owner, cls);
        return target.getAnimations().find(a => a.animationName === name);
      };
      const keyframes = a => JSON.stringify(a.effect.getKeyframes());
      for (const kind of ['turf', 'tank']) {
        for (const state of ['running', 'finished', 'paused', 'running', 'finished']) {
          const a = restart(old, kind, false), b = restart(candidate, kind, true);
          ensure(!!a && !!b, kind + ' missing animation');
          ensure(keyframes(a) === keyframes(b), kind + ' keyframes differ');
          ensure(JSON.stringify(a.effect.getTiming()) === JSON.stringify(b.effect.getTiming()), kind + ' timing differs');
          ensure(a.startTime === b.startTime || a.startTime === null || b.startTime === null, kind + ' start time differs');
          for (const ms of [0, 20, 70, 140, 210, 280, 349, 350, 400]) {
            a.pause(); b.pause(); a.currentTime = ms; b.currentTime = ms;
            const sa = style(kind === 'turf' ? old.turf.firstElementChild : old.tank), sb = style(kind === 'turf' ? candidate.turf.firstElementChild : candidate.tank);
            ensure(JSON.stringify(sa) === JSON.stringify(sb), kind + ' styles differ at ' + ms + 'ms');
          }
          if (state === 'finished') { a.play(); b.play(); a.finish(); b.finish(); }
          else if (state === 'running') { a.currentTime = 50; b.currentTime = 50; a.play(); b.play(); }
          else { a.currentTime = 100; b.currentTime = 100; }
          rows.push({ kind, nextState: state, oldReads: old.reads(), candidateReads: candidate.reads() });
        }
      }
      // Use fresh effects for lifecycle checks: pause()/play() above are test
      // controls that themselves override CSS animation-play-state.
      old.root.remove(); candidate.root.remove();
      old = make('lifecycle-original'); candidate = make('lifecycle-candidate');
      for (const kind of ['turf', 'tank']) { restart(old, kind, false); restart(candidate, kind, true); }
      await new Promise(resolve => setTimeout(resolve, 390));
      for (const kind of ['turf', 'tank']) {
        const node = kind === 'turf' ? candidate.turf.firstElementChild : candidate.tank;
        ensure(node.getAnimations().length === 0, kind + ' naturally finished effect still listed');
        const a = restart(old, kind, false), b = restart(candidate, kind, true);
        ensure(!!a && !!b && b.playState === 'running', kind + ' seek did not reactivate naturally finished effect');
      }
      // Restarting under a real CSS pause rule must remain parked, even after
      // the animation was previously finished and absent from getAnimations().
      for (const rig of [old, candidate]) { rig.root.classList.add('is-world-paused'); }
      for (const kind of ['turf', 'tank']) {
        restart(old, kind, false); const b = restart(candidate, kind, true);
        ensure(b.playState === 'paused', kind + ' CSS pause lost');
      }
      // Wait for each pending CSS pause operation itself; a single RAF can
      // still run before a new animation's ready promise has settled.
      await Promise.all(document.getAnimations().map(animation => animation.ready.catch(() => {})));
      await nextFrame();
      const Layout = Function('return (' + layoutSource + ')')();
      const pausedSample = new Layout(candidate.root, null, window);
      pausedSample.begin(); const firstRect = pausedSample.rect(candidate.turf.firstElementChild);
      pausedSample.begin();
      if (pausedSample.active) diagnostics.push({ phase: 'paused-observer', animations: document.getAnimations().map(animation => {
        const target = animation.effect?.target;
        return { tag: target?.tagName, id: target?.id, class: target?.className?.baseVal ?? target?.className,
          root: target?.closest?.('.iw-hud')?.id, connected: target?.isConnected,
          name: animation.animationName, transition: animation.transitionProperty,
          state: animation.playState, pending: animation.pending, currentTime: animation.currentTime,
          cssPlayState: target ? getComputedStyle(target).animationPlayState : null,
          timing: animation.effect?.getTiming() };
      }) });
      ensure(!pausedSample.active, 'paused observer unexpectedly reports running effects');
      restart(candidate, 'turf', true); pausedSample.begin();
      ensure(pausedSample.refresh && pausedSample.rect(candidate.turf.firstElementChild) !== firstRect, 'paused restart did not invalidate LayoutSample rectangle');
      pausedSample.dispose();
      await nextFrame();
      for (const kind of ['turf', 'tank']) {
        const node = kind === 'turf' ? candidate.turf.firstElementChild : candidate.tank;
        const a = node.getAnimations().find(x => x.animationName === (kind === 'turf' ? 'iw-turf-tick' : 'iw-shake'));
        const at = a.currentTime; await nextFrame(); ensure(a.currentTime === at, kind + ' advanced while CSS paused');
      }
      for (const rig of [old, candidate]) rig.root.classList.remove('is-world-paused');
      await nextFrame(); await nextFrame();
      for (const kind of ['turf', 'tank']) {
        const a = (kind === 'turf' ? old.turf.firstElementChild : old.tank).getAnimations().find(x => x.animationName === (kind === 'turf' ? 'iw-turf-tick' : 'iw-shake'));
        const b = (kind === 'turf' ? candidate.turf.firstElementChild : candidate.tank).getAnimations().find(x => x.animationName === (kind === 'turf' ? 'iw-turf-tick' : 'iw-shake'));
        ensure(a?.currentTime > 0 && b?.currentTime > 0, kind + ' failed to resume from CSS pause');
        ensure(Math.abs(a.currentTime - b.currentTime) < .1, kind + ' CSS resume phase differs');
      }
      for (const rig of [old, candidate]) rig.root.style.display = 'none';
      await nextFrame();
      for (const rig of [old, candidate]) rig.root.style.display = '';
      for (const kind of ['turf', 'tank']) {
        const a = restart(old, kind, false), b = restart(candidate, kind, true);
        ensure(!!a && !!b, kind + ' hidden/reveal restart missing');
      }
      // The higher-specificity swimming entrance is intentionally not touched.
      for (const rig of [old, candidate]) rig.tank.classList.add('is-swim');
      const swimOld = old.tank.getAnimations().find(x => x.animationName === 'iw-s3-tank-in'), swimNew = candidate.tank.getAnimations().find(x => x.animationName === 'iw-s3-tank-in');
      ensure(!!swimOld && !!swimNew, 'swim override missing');
      swimOld.pause(); swimNew.pause(); swimOld.currentTime = 100; swimNew.currentTime = 100;
      restart(old, 'tank', false); restart(candidate, 'tank', true);
      ensure(swimOld.currentTime === 100 && swimNew.currentTime === 100, 'swim animation rewound');
      for (const rig of [old, candidate]) rig.tank.classList.remove('is-swim');
      restart(candidate, 'tank', true);
      // No external style/animation query may flush the changed selector
      // before the optimized call. The old implementation runs second.
      candidate.tank.classList.add('is-swim'); restart(candidate, 'tank', true);
      old.tank.classList.add('is-swim'); restart(old, 'tank', false);
      ensure(!candidate.tank.getAnimations().some(x => x.animationName === 'iw-shake'), 'same-task swim override retained stale shake');
      ensure(candidate.tank.getAnimations().some(x => x.animationName === 'iw-s3-tank-in'), 'same-task swim override missing');
      for (const rig of [old, candidate]) rig.tank.classList.remove('is-swim');
      restart(candidate, 'tank', true);
      const disabled = document.createElement('style');
      disabled.textContent = '.iw-turf i,.iw-tank{animation:none!important}'; document.head.append(disabled);
      for (const kind of ['turf', 'tank']) {
        ensure(!restart(candidate, kind, true) && !restart(old, kind, false), kind + ' same-task disabled animation unexpectedly present');
      }
      disabled.remove();
      for (const kind of ['turf', 'tank']) {
        ensure(!!restart(old, kind, false) && !!restart(candidate, kind, true), kind + ' restored animation missing');
      }
      for (const rig of [old, candidate]) rig.turf.firstElementChild.replaceWith(rig.turf.firstElementChild.cloneNode(true));
      const replacedOld = restart(old, 'turf', false), replacedNew = restart(candidate, 'turf', true);
      ensure(!!replacedOld && !!replacedNew, 'replaced DOM target missing animation');
      ensure(replacedNew.effect.target === candidate.turf.firstElementChild, 'old detached target reused');
      // The application's geometry observer also reads the current animation
      // set. A seeked pulse must be visible there without an animationstart.
      for (const animation of document.getAnimations()) animation.finish();
      const sample = new Layout(candidate.root, null, window);
      sample.begin(); const inactiveBefore = !sample.active;
      restart(candidate, 'turf', true); sample.begin();
      ensure(inactiveBefore && sample.active && sample.refresh, 'LayoutSample missed resumed cached CSS animation');
      sample.dispose();
      return { reducedMotion, errors, diagnostics, rows, observerActive: sample.active, finalReads: { old: old.reads(), candidate: candidate.reads() } };
    }, { methods, reducedMotion, layoutSource: LayoutSample.toString() }));
  }
  fs.writeFileSync(path.join(evidence, 'browser-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.scenarios.some(x => x.errors.length)) process.exitCode = 1;
} finally { await browser.close(); }
