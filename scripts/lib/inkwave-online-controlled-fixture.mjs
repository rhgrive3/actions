import vm from 'node:vm';
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.listeners = new Map(); this.value = ''; this.disabled = false; this._text = '';
    const classes = new Set();
    this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, force = !classes.has(x)) => { force ? classes.add(x) : classes.delete(x); return force; } };
  }
  set className(v) { this.classList.add(...String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text + this.children.map(c => c.textContent ?? String(c)).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstChild() { return this.children[0]; }
  append(...children) { for (const c of children.flat(Infinity)) if (c != null) { this.children.push(c); if (typeof c === 'object') c.parentNode = this; } }
  appendChild(child) { this.append(child); return child; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  remove() { this.removed = true; }
  insertBefore(child, before) { const i = this.children.indexOf(before); this.children.splice(i < 0 ? this.children.length : i, 0, child); child.parentNode = this; }
  addEventListener(name, fn) { const a = this.listeners.get(name) || []; a.push(fn); this.listeners.set(name, a); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(f => f !== fn)); }
  dispatch(name, attrs = {}) { const e = { key: '', preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...attrs }; for (const fn of this.listeners.get(name) || []) fn(e); return e; }
  focus() { this.document.activeElement = this; this.dispatch('focus'); }
  blur() { if (this.document.activeElement === this) this.document.activeElement = null; }
}
export function fixture(method, options = {}) {
  const document = options.document || new Element(); document.activeElement = null;
  const h = (tag, attrs, ...children) => { const e = new Element(tag); e.document = document; for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e[k] = v; } e.append(...children); return e; };
  const timers = new Map(); let timerId = 0;
  const requests = [], pending = [], left = [], shows = [];
  const net = { join: (...args) => { requests.push(['join', ...args]); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }, create: (...args) => { requests.push(['create', ...args]); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }, leave: () => left.push(true) };
  const env = {
    document, navigator: { clipboard: { readText: options.readClipboard || (() => Promise.resolve('BCEFG')) } },
    tu: s => s, t: s => s, tr: s => s,
    h, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), prefersReducedMotion: () => true,
    splatSVG: () => '', dripsSVG: () => '', weaponIcon: () => '', SQUID: '', G: {},
    GLYPHS: new Proxy({}, { get: () => '' }), CODE_ABC: 'BCEFGHJKLMNPQRTUVXYZ23456789',
    JOIN_ERR: { 'Room not found': { title: 'ROOM NOT FOUND', text: 'No room uses that code. Double-check it with your friend — rooms close when everyone leaves.', icon: 'question' } },
    fnv: () => 0, tagArt: () => '', tagTitle: () => '', tagNum: () => '', colorVars() {}, restartAnim() {}, safeCall: f => f(), touchPrimary: options.touch !== false,
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
  };
  const api = {
    _input: options.touch === false ? 'kbm' : 'touch', current: 'online', api: {}, _sc: () => null, _net: () => net,
    _fx() {}, _portraitInto() {}, _sfx() {}, _loadout: () => ({ weapon: 'shooter' }),
    _weapons: () => ({ shooter: { name: 'Splattershot', kind: 'shooter' } }), _profile: () => ({ name: 'Player', level: 1 }), _accent: () => ['#ff8a14'],
    _nameRow: () => { const row = h('div'); row._input = h('input', { class: 'iw-name__input' }); row.append(row._input); return row; },
    _hint: () => h('span'), _prompts: rows => h('div', null, rows.map(() => h('span'))),
    _header: () => h('div', { class: 'iw-head' }),
    _bind: (el, binding) => { el.binding = binding; el.addEventListener('click', () => binding.accept('touch')); },
    _setFocus(el) { this._focus = el; }, _graphNav: () => false,
    _go(screen) { shows.push(screen); }, show(screen) { shows.push(screen); if (options.destroyOnShow) result.destroy(); },
  };
  const compiled = vm.runInNewContext(`({${method}})`, env);
  const createScreen = () => compiled._scr_online.call(api);
  const result = createScreen();
  const find = cls => { const visit = e => e.classList?.contains(cls) ? e : e.children?.map(visit).find(Boolean); return visit(result.el); };
  return { document, screen: result, api, requests, pending, left, shows, find, timers, createScreen, createElement: h, runTimers() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) fn(); } };
}
export const flush = async () => { await Promise.resolve(); await Promise.resolve(); };


export const deferred = () => { let resolve,reject; const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
