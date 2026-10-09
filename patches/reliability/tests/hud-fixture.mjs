import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptResults } from '../results-adapter.mjs';
import { adaptIntro } from '../intro-adapter.mjs';
import { adaptStart } from '../start-adapter.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
export const readSource = rel => fs.readFileSync(path.join(UPSTREAM, rel), 'utf8');
export const existingGameSource = () => adaptStart('src/main.js', adaptIntro('src/main.js', adaptResults('src/main.js', readSource('src/main.js'))));
export const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `Actual full method boundary: ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, 'unique start');
  return source.slice(at, until);
}

// Entire actual judge, FX scheduler, sound forwarding, visibility/dispose, and Game
// judge/quit methods. Actual ui-util/config modules are evaluated too. Only platform
// DOM/RAF/audio and unrelated 3D/menu rendering are fixtures, not a physical browser.
export async function fixture({ hudSource = readSource('src/ui/hud.js'), gameSource = existingGameSource(), globals = {} } = {}) {
  const rafs = new Map(), timers = new Map(), calls = [], voices = [];
  let serial = 0, now = 0, hook = null;
  class Classes {
    constructor(node) { this.node = node; this.names = new Set(); }
    add(...names) { names.forEach(n => this.names.add(n)); }
    remove(...names) { names.forEach(n => this.names.delete(n)); }
    contains(n) { return this.names.has(n); }
    toggle(n, on = !this.contains(n)) { on ? this.add(n) : this.remove(n); return on; }
  }
  class Node {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.parentNode = null; this.style = { setProperty: (k,v) => { this.style[k] = v; } }; this.classList = new Classes(this); this.dataset = {}; this._text = ''; this.offsetWidth = 600; }
    set className(value) { this.classList.names = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classList.names].join(' '); }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
    appendChild(node) { node.parentNode?.children.splice(node.parentNode.children.indexOf(node),1); this.children.push(node); node.parentNode = this; return node; }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this),1); this.parentNode = null; }
    setAttribute() {} addEventListener() {}
    querySelectorAll(selector) {
      const names = selector.split('.').filter(Boolean);
      const matches = node => selector === '[data-team-special]'
        ? node.dataset.teamSpecial !== undefined
        : names.every(name => node.classList.contains(name));
      return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const body = new Node('body');
  const document = { body, createElement: tag => new Node(tag), createTextNode: value => { const n = new Node('#text'); n.textContent = value; return n; } };
  const G = { teamHex: ['#ff8a14','#2f5bff'], teamColors: ['orange','blue'], net: null, netm: null, mode: 'match', audio: { duck() {}, play: name => calls.push(['gameSound',name]) } };
  const context = vm.createContext({
    ...globals, console, document, G, Promise, performance: { now: () => now },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: fn => { const id = ++serial; rafs.set(id,fn); return id; }, cancelAnimationFrame: id => rafs.delete(id),
    setTimeout: (fn, ms) => { const id = ++serial; timers.set(id,{ fn, ms, due: now + ms }); return id; }, clearTimeout: id => timers.delete(id),
    saveJSON: () => calls.push(['save']),
    tr: (value, vars = {}) => value.replace('{team}',vars.team || ''),
  });
  const util = new vm.SourceTextModule(readSource('src/ui/ui-util.js'),{context});
  const tx = new vm.SourceTextModule('export const tx=value=>value;',{context});
  await util.link(() => tx); await util.evaluate();
  // Current config uses the real source-guided ink flight constants. Evaluate
  // that dependency instead of rejecting the production config import.
  const inkFlight = new vm.SourceTextModule(readSource('src/game/inkFlight.js'),{context});
  await inkFlight.link(() => { throw Error('Unexpected inkFlight import'); });
  const config = new vm.SourceTextModule(readSource('src/config.js'),{context});
  await config.link(spec => {
    if (spec === './game/inkFlight.js') return inkFlight;
    throw Error('Unexpected config import: ' + spec);
  });
  await config.evaluate();
  Object.assign(context, util.namespace, config.namespace);
  const hudMethods = [
    // Quality composition adds this dependency to setVisible/dispose. Extract
    // the real cleanup method as well; a no-op fixture would hide stale signals.
    ...(hudSource.includes('this._clearTeamSpecialSignals()')
      ? [section(hudSource, '  _clearTeamSpecialSignals() {', '\n  _bindBus() {')]
      : []),
    section(hudSource, '  setVisible(v) {', '\n  /** ScreenFX'),
    section(hudSource, '  judge(', '\n  _live()'),
    section(hudSource, '  _addFx(name, fn) {', '\n  _restart(el, cls)'),
  ].join('\n');
  const Hud = vm.runInContext(`class Hud { ${hudMethods} }; Hud`,context);
  const hud = new Hud();
  Object.assign(hud, { el: new Node(), overLayer: new Node(), feedEl: new Node(), timeScale:1, paused:false, _fxTime:0, _lastFx:0, _rafId:0, _visible:false, _unsubs:[], boss:{dispose(){calls.push(['bossDispose']);}},
    hideSplatted() {}, playSound(name) { const v = { name, stopped:0, v:{ dispose() { v.stopped++; } } }; voices.push(v); calls.push(['hudSound',name,now]); hook?.(name); return v; },
  });
  hud.el.append(hud.feedEl);
  body.append(hud.el,hud.overLayer); hud._fxLoop = hud._fxLoop.bind(hud);
  const gameMethods = [
    section(gameSource,'  _beginMatchFlow() {','\n  async startMatch('),
    section(gameSource,'  netMatchAborted(reason) {','\n  _intro()'),
    section(gameSource,'  async quitToMenu() {','\n  // Boss Battle intro:'),
    section(gameSource,'  async _judge() {','\n  _fade(to, ms)'),
  ].join('\n');
  const Game = vm.runInContext(`class Game { ${gameMethods} }; Game`, context);
  const game = new Game();
  const actor = { name:'Player',team:0,weaponId:'shooter',stats:{turf:10,splats:1,deaths:0},character:{style:{}},isLocal:true,slot:0 };
  const match = { state:'judge',local:actor,actors:[actor],result:{ coverage:[.6,.4],winner:0 },setState(state){this.state=state;calls.push(['state',state]);} };
  Object.assign(game, { match,hud,palette:{names:['Alpha','Bravo']},mapDef:{name:'Map'},profile:{level:1,xp:0,matches:0,wins:0,totalTurf:0},
    input:{exitLock(){}},rig:{overview(){}},_fade:async()=>{},_pickPalette:()=>({}),_setPalette(){},
    _startAttract(){ this._matchFlow=null;this.match={attract:true};calls.push(['attract']); },
    _playMusic: name=>calls.push(['music',name]),showcase:{hide(){},showResults(){calls.push(['podium']);}},
    menus:{current:null,show(screen){this.current=screen;calls.push(['screen',screen]);},showResults(data){calls.push(['results',data]);},toast(){}},
  });
  game._beginMatchFlow();
  const advance = async milliseconds => {
    const target = now + milliseconds;
    while(now < target) {
      now = Math.min(target,now + 50);
      for(const [id,fn] of [...rafs]) { if (!rafs.delete(id)) continue; fn(now); }
      for(const [id,timer] of [...timers]) { if(timer.due <= now && timers.delete(id)) timer.fn(); }
      await flush();
    }
  };
  return { hud,game,match,G,calls,voices,rafs,timers,body,document,advance,
    hookSound(fn){hook=fn;}, now:()=>now,
    count(kind){return calls.filter(row=>row[0]===kind).length;},
    judges:()=>hud.overLayer.querySelectorAll('.iw-jd'),
    snapshot(){ return { overlayCount:this.judges().length, soundNames:voices.map(v=>v.name), completedResults:this.count('results'), matches:game.profile.matches, rafs:rafs.size, timers:timers.size }; },
  };
}
