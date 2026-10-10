import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { installMenuQuality } from '../menu.mjs';
import { clearContinuation, continuationNavigation } from '../result-continuation.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, ROOT), 'utf8');
const raw = read('inkwave-public/src/ui/menus.js');
const composed = adaptQualitySource('src/ui/menus.js', adaptReliability('src/ui/menus.js',
  adaptTouchLayout('src/ui/menus.js', adaptSource('src/ui/menus.js', raw))));
const section = (s, from, to) => {
  const start = s.indexOf(from), end = s.indexOf(to, start);
  assert(start >= 0 && end > start, from); return s.slice(start, end);
};

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {};
    const classes = new Set();
    this.classList = { add: (...xs) => xs.forEach(x => classes.add(x)),
      remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x),
      toggle: (x, on) => (on ?? !classes.has(x)) ? classes.add(x) : classes.delete(x) };
  }
  appendChild(e) { this.children.push(e); return e; }
  addEventListener() {}
  querySelector() { return new Element(); }
  remove() { this.removed = true; }
}
const h = (tag, attrs, ...kids) => {
  const e = new Element(tag);
  if (attrs?.class) e.classList.add(...attrs.class.split(' '));
  for (const child of kids.flat(Infinity)) if (child instanceof Element) e.appendChild(child);
  return e;
};

// Actual composed navigation/title/mode/dispose methods plus the production
// menu runtime installer. DOM drawing and time are bounded deterministic fakes;
// these are lifetime/navigation tests, not browser pixels or device evidence.
export function menuNavigationFixture({ baseline = false, reduced = false } = {}) {
  const code = baseline ? raw : composed;
  let now = 1000, next = 0;
  const timers = new Map(), archive = new Map(), calls = [], sounds = [], settings = [];
  const env = { performance: { now: () => now }, console,
    document: { hidden: false, fonts: { removeEventListener() {} } },
    setTimeout(fn, delay) { const id = next++; const t = { fn, delay, at: now + delay }; timers.set(id, t); archive.set(id, t); return id; },
    clearTimeout(id) { timers.delete(id); }, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
    removeEventListener() {},
  };
  const methods = [section(code, '  show(name = null', '\n  setLoading('),
    section(code, '  _go(name,', '\n  // ================================================================ focus'),
    section(code, '  _scr_mode() {', '\n  // ================================================================ SCREEN: setup'),
    section(code, '  dispose() {', '\n  // ================================================================ internals')].join('\n');
  const constants = ['SCREENS', 'WIPES', 'LIGHT'].map(k => code.match(new RegExp(`const ${k} = [^\\n]+`))[0]).join('\n');
  const Menus = vm.runInNewContext(`${constants}\nclass Menus {${methods}}; Menus`, {
    ...env, window: env, clearContinuation, continuationNavigation,
    safeCall: fn => fn(), prefersReducedMotion: () => reduced, h,
    GLYPHS: {}, MATCH: { defaultDuration: 180 }, BOSS_NAME: 'Boss', BOSS_GLYPH: '', SQUID: '',
    durLabel: x => String(x), stageArt: () => 'stage.webp', bossSilhouette: () => '',
    splatSVG: () => '', restartAnim() {},
  });
  Menus.prototype._swap = function(name) {
    this._scr = name === 'mode' ? this._scr_mode() : name ? { el: new Element() } : null;
    if (this._scr) this._scr.name = name;
  };
  if (!baseline) installMenuQuality(Menus, env);
  const m = new Menus();
  Object.assign(m, { current: null, _stack: [], _swapToken: 0, _focusMem: {}, _shownAt: 0,
    _platformDriven: true, el: new Element(), _cur: {}, _settings: () => ({}),
    _setSetting: (...args) => settings.push(args), _sfx: (...args) => sounds.push(args),
    _bind: (card, opts) => { card.accept = opts.accept; }, _fx() {}, _burstAt() {},
    _header: () => new Element(), _prompts: () => new Element(), _graphNav() {},
    api: { onScreenChange: name => calls.push(name) }, wipe: { busy: false, cancel() {} },
    _runWipe(mid) { this.pendingWipe = mid; },
  });
  const advance = ms => { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } };
  const show = name => { m.show(name, { wipe: false }); advance(400); };
  const mid = () => { const fn = m.pendingWipe; m.pendingWipe = null; fn?.(); };
  const navTimer = () => [...timers].find(([, t]) => t.delay === 200 || t.delay === (reduced ? 0 : 260));
  const modeCard = (id = 'turf') => {
    const walk = el => el._mode === id ? el : el.children.map(walk).find(Boolean);
    return walk(m._scr.el);
  };
  return { m, timers, archive, calls, sounds, settings, advance, show, mid, navTimer, modeCard };
}
