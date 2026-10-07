// Issue #561 — Splatoon 3 assist presentation.
//
// Splatoon 2/3 give an assisting player no splat notification; a distinct splat icon
// appears above the splatted location. INKWAVE's raw upstream promoted the same already
// recognized assist into the center-HUD kill-card stack as a 1.7 s `ASSIST <victim>` card
// plus a dedicated `hit_marker` sound. These tests run the actual hud.js methods — raw
// upstream, the build composition, and the installed built output — against the real
// ui-util/ui-icons modules. Only platform DOM, audio, timers and the clock are fixtures.
//
// `isJa` is supplied by the fixture. The raw upstream hud.js reads it without importing it;
// patches/practice-range supplies that import in the real build pipeline, so the installed
// site is unaffected and #561 does not change that reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import {fixture as actorFixture} from './clothing-gear-fixture.mjs';
import { adaptAssistPresentation, ASSIST_PRESENTATION_CONNECTIONS } from '../assist-presentation-adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const compose = (rel, code = read(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

// Every HUD method the rig runs, in source order. A body runs to the next signature, so
// the same extraction works for the raw file and for the composed/installed output.
const SIGS = [
  '  _onSplatted(', // Current HUD also consumes the accepted helper list.
  '  _assistMark(victim) {',
  '  _killCard(victim, kind) {',
  '  _dropCard(card, fast) {',
  '  _callout(text, sub, big) {',
  '  _allyDown(victim, attacker) {',
  '  _updDowns(dt) {',
];
const WALKED = ['_onSplatted', '_assistMark', '_killCard', '_dropCard', '_allyDown'];
function body(code, signature) {
  const at = code.indexOf(signature);
  if (at < 0) return null;
  const after = code.slice(at + signature.length);
  const next = SIGS.map(s => after.indexOf(s)).filter(i => i >= 0).sort((a, b) => a - b)[0];
  return next === undefined ? code.slice(at) : code.slice(at, at + signature.length + next);
}

function platform() {
  class Classes {
    constructor() { this.names = new Set(); }
    add(...names) { names.forEach(n => this.names.add(n)); }
    remove(...names) { names.forEach(n => this.names.delete(n)); }
    contains(n) { return this.names.has(n); }
    toggle(n, on = !this.contains(n)) { on ? this.add(n) : this.remove(n); return on; }
  }
  class Node {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.parentNode = null; this.classList = new Classes();
      this.dataset = {}; this._text = ''; this.innerHTML = '';
      this.style = { setProperty: (k, v) => { this.style[k] = v; } };
    }
    set className(value) { this.classList.names = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classList.names].join(' '); }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
    appendChild(node) { if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1); this.children.push(node); node.parentNode = this; return node; }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    prepend(node) { this.children.unshift(node); node.parentNode = this; return node; }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    setAttribute() {} addEventListener() {}
    querySelectorAll(selector) {
      const names = selector.split('.').filter(Boolean);
      return this.children.flatMap(n => [...(names.every(c => n.classList.contains(c)) ? [n] : []), ...n.querySelectorAll(selector)]);
    }
  }
  return { document: { createElement: tag => new Node(tag), createTextNode: v => { const n = new Node('#text'); n.textContent = v; return n; } }, Node };
}

// Builds the HUD methods from a real hud.js text (raw, composed or installed) and runs them
// against the real ui-util/ui-icons modules.
async function hudRig(source) {
  const { document, Node } = platform();
  const context = vm.createContext({ console, document, localStorage: { getItem: () => null } });
  const i18n = new vm.SourceTextModule('export const tx = v => v; export const t = v => v; export const isJa = false; export const LANG = "en"; export const TXT = { mode: "kbm" };', { context });
  const util = new vm.SourceTextModule(read('src/ui/ui-util.js'), { context, identifier: 'ui-util.js' });
  const icons = new vm.SourceTextModule(read('src/ui/ui-icons.js'), { context, identifier: 'ui-icons.js' });
  await util.link(spec => (spec.includes('ui-util.js') ? util : i18n)); await util.evaluate();
  await icons.link(spec => (spec.includes('ui-util.js') ? util : i18n)); await icons.evaluate();
  Object.assign(context, util.namespace, icons.namespace);

  const sounds = [], timers = [];
  Object.assign(context, {
    G: { teamHex: ['#ff8a14', '#2f5bff'] }, tr: v => v, isJa: false, Math,
    kindOf: w => w || 'shooter', STREAKS: { 2: 'DOUBLE SPLAT!' },
    setTimeout: (fn, ms) => { timers.push(ms); return timers.length; }, clearTimeout: () => {},
  });
  // `_assistMark` does not exist in the raw upstream file, so the rig runs whatever it finds.
  const methods = WALKED.map(name => body(source, SIGS.find(s => s.includes(name)))).filter(Boolean).join('\n');
  const Hud = vm.runInContext(`class Hud {\n${methods}\n}; Hud`, context);
  const hud = new Hud();
  const me = { team: 0, name: 'Me', pos: { x: 0, y: 0, z: 0 }, weaponId: 'shooter' };
  hud.kcards = new Node('div');
  hud.downLayer = new Node('div');
  hud.el = new Node('div');
  hud._downs = [];
  hud._L = { cb: '#2f5bff' };
  hud._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map(), perActor: new Map() };
  hud._live = () => true;
  hud._local = () => me;
  hud._now = () => 10;
  hud._snd = name => sounds.push(name);
  hud._callout = () => {};
  hud._clearDamageDirs = () => {};
  hud._actors = () => [];
  return {
    hud, me, sounds, timers, context,
    enemy: (name = 'Target', team = 1) => ({ team, name, pos: { x: 3, y: 1, z: -2 }, weaponId: 'shooter' }),
    mate: (extra = {}) => ({ team: 0, name: 'Mate', ...extra }),
    damage: (victim, at = hud._now()) => hud._kills.dealt.set(victim, at),
    splat: (victim, attacker, assists = []) => hud._onSplatted({ victim, attacker, assists }),
    marks: () => hud.downLayer.children.map(n => n.className),
  };
}

test('#561 BEFORE: raw upstream promotes a recognized assist into a 1.7 s ASSIST card plus a hit-marker sound', async () => {
  const raw = read('src/ui/hud.js');
  assert.ok(raw.includes("this._killCard(victim, 'assist');"));
  assert.ok(raw.includes("kind === 'assist' ? 'ASSIST'"));
  assert.ok(raw.includes("this._snd('hit_marker', { volume: 0.4, pitch: 1.3 });"));
  assert.ok(!raw.includes('_assistMark'), 'the raw file has no world marker at all');
  const r = await hudRig(raw);
  const victim = r.enemy();
  r.damage(victim);
  r.splat(victim, r.mate());
  assert.equal(r.hud.kcards.children.length, 1, 'the centre-HUD assist card is the reported defect');
  assert.ok(r.hud.kcards.children[0].textContent.includes('ASSIST'));
  assert.deepEqual(r.sounds, ['hit_marker']);
  assert.deepEqual(r.timers, [1700]);
  assert.equal(r.hud.downLayer.children.length, 0, 'no marker at the splatted location');
});

test('#561 AFTER: accepted assist marks the splatted location without a card or sound', async () => {
  const code = compose('src/ui/hud.js');
  assert.ok(!code.includes("this._killCard(victim, 'assist');"), 'assist must not reach the kill-card stack');
  assert.ok(code.includes('this._assistMark(victim);'), 'assist must reach the world marker');
  assert.ok(!code.includes("kind === 'assist'"), 'no assist-specific branch may remain');
  assert.ok(!code.includes("'ASSIST'"), 'the ASSIST label is not a Splatoon 3 presentation');
  assert.ok(!code.includes('hit_marker'), 'the unverified assist hit-marker sound is gone');
  assert.ok(!code.includes('1700'), 'the 1.7 s assist card lifetime is gone');
  assert.ok(body(code, '  _killCard(victim, kind) {').includes('2200'), 'the direct-splat card lifetime stays authoritative');
  new vm.SourceTextModule(code);

  const r = await hudRig(code);
  const victim = r.enemy();
  r.damage(victim);
  r.splat(victim, r.mate(), [r.me]);

  assert.equal(r.hud.kcards.children.length, 0, 'no centre-HUD splat notification for the assister');
  assert.deepEqual(r.sounds, [], 'no dedicated assist sound');
  assert.deepEqual(r.timers, []);
  assert.deepEqual(r.marks(), ['iw-down iw-down--assist']);
  assert.equal(r.hud._downs.length, 1, 'the marker enters the existing world projection pool');
  assert.deepEqual([r.hud._downs[0].x, r.hud._downs[0].y, r.hud._downs[0].z], [3, 2.2, -2], 'anchored at the defeated opponent');
  const icon = r.hud.downLayer.children[0].children[0];
  assert.ok(icon.innerHTML.includes('<svg'), 'a real splat icon is rendered inside the marker');
  assert.ok(!r.hud.downLayer.children[0].textContent.includes('Target'), 'the marker carries no name tag');
  assert.ok(!r.hud._kills.dealt.has(victim), 'the local damage window is consumed exactly once');

  // Current authoritative producer supplies each accepted helper once; a later
  // terminal without that credit must not fabricate a second presentation.
  r.splat(victim, r.mate());
  assert.equal(r.hud.downLayer.children.length, 1, 'an accepted assist is required to present again');
  assert.equal(r.hud.kcards.children.length, 0);
});

test('#561: bot, remote and human teammates share the assist branch', async () => {
  const r = await hudRig(compose('src/ui/hud.js'));
  for (const extra of [{ bot: true }, { remote: true }, { bot: true, remote: true }, {}]) {
    const victim = r.enemy('T' + JSON.stringify(extra));
    r.damage(victim);
    r.splat(victim, r.mate(extra), [r.me]);
  }
  assert.equal(r.hud.downLayer.children.length, 4, 'teammate identity does not fork the presentation');
  assert.equal(r.hud.kcards.children.length, 0);
  assert.deepEqual(r.sounds, []);
});

test('#561: current authoritative no-credit, enemy-finished and self events present nothing', async () => {
  const r = await hudRig(compose('src/ui/hud.js'));
  const mate = r.mate();
  const expired = r.enemy('Expired');
  r.damage(expired, r.hud._now() - 4.01);
  r.splat(expired, mate);
  assert.equal(r.hud.downLayer.children.length, 0, 'an expired assist window stays expired');
  assert.ok(r.hud._kills.dealt.has(expired), 'an unadmitted victim keeps its damage entry');

  const enemyFinisher = r.enemy('Enemy');
  r.damage(enemyFinisher);
  r.splat(enemyFinisher, r.enemy('Foe'));
  assert.equal(r.hud.downLayer.children.length, 0, 'an enemy finisher is not an assist');
  assert.equal(r.hud.kcards.children.length, 0, 'enemy-versus-enemy kills stay out of the local card stack');

  r.splat(r.me, r.enemy('Killer'));
  assert.equal(r.hud.downLayer.children.length, 0);
  assert.equal(r.hud.kcards.children.length, 0);

  // Per-actor bookkeeping that Flow Aura and result stats rely on is untouched: the teammate
  // streak is credited for the expired assist attempt exactly as before the patch.
  assert.equal(r.hud._kills.perActor.get(mate), 1);
  assert.equal(r.hud._kills.lastKiller.name, 'Killer');
});

test('#561: direct final-splat cards are unchanged and play no extra sound', async () => {
  const r = await hudRig(compose('src/ui/hud.js'));
  r.splat(r.enemy(), r.me);
  assert.equal(r.hud.kcards.children.length, 1, 'the direct-splat card still appears');
  assert.ok(r.hud.kcards.children[0].className.includes('iw-kcard--kill'));
  assert.ok(!r.hud.kcards.children[0].className.includes('assist'));
  assert.ok(r.hud.kcards.children[0].textContent.includes('SPLATTED'));
  assert.deepEqual(r.timers, [2200], 'the direct-splat card keeps the 2200 ms lifetime');
  assert.deepEqual(r.sounds, []);
  assert.equal(r.hud.downLayer.children.length, 0, 'a direct splat is not an assist marker');
  assert.equal(r.hud._kills.streak, 1);
});

test('#561: the ally-down marker path is untouched', async () => {
  const r = await hudRig(compose('src/ui/hud.js'));
  r.hud._allyDown({ team: 0, name: 'Ally', pos: { x: -2, y: 0, z: 4 }, weaponId: 'shooter' }, r.enemy());
  assert.equal(r.hud.downLayer.children.length, 1);
  assert.ok(!r.hud.downLayer.children[0].className.includes('iw-down--assist'), 'ally pings keep their own marker');
  assert.ok(r.hud.downLayer.children[0].textContent.includes('Ally'), 'the ally name tag is unchanged');
  assert.equal(r.hud._downs.length, 1);
});

test('#561: every assist-presentation connection is present upstream and fails closed', () => {
  const raw = read('src/ui/hud.js');
  assert.ok(ASSIST_PRESENTATION_CONNECTIONS.length >= 6);
  for (const [before, , label] of ASSIST_PRESENTATION_CONNECTIONS) {
    assert.ok(raw.includes(before), `connection ${label} is anchored upstream`);
    assert.throws(() => adaptSource('src/ui/hud.js', raw.replace(before, '')), /patch conflict/i, label);
    assert.throws(() => adaptSource('src/ui/hud.js', raw + before), /patch conflict/i, label);
  }
  assert.equal(adaptSource('src/game/physics.js', 'UNRELATED'), 'UNRELATED', 'unrelated sources stay untouched');
  assert.equal(adaptAssistPresentation('src/game/actor.js', 'UNRELATED', () => { throw Error('must not be called'); }), 'UNRELATED');
});

// Installed-path rig: links the real built module graph and drives the installed HUD class
// prototype, so the assertions run against the bytes the site actually serves.
async function installedRig(site) {
  const { document, Node } = platform();
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const G = { teamHex: ['#ff8a14', '#2f5bff'], mode: 'match' };
  const context = vm.createContext({
    console, document, G, performance: { now: () => 0 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720, matchMedia: media },
    innerWidth: 1280, innerHeight: 720, screen: { width: 1280, height: 720, orientation: { angle: 0 } },
    devicePixelRatio: 1, navigator: { userAgent: 'node', maxTouchPoints: 0 }, matchMedia: media,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
    fetch: async () => ({ ok: true, json: async () => ({}), text: async () => '' }),
    Audio: function () {}, Image: function () {}, HTMLElement: function () {}, AudioContext: function () {}, saveJSON() {},
  });
  document.documentElement = new Node('html');
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
    cache.set(file, m);
    return m;
  };
  const hud = load(path.join(site, 'src/ui/hud.js'));
  await hud.link((spec, from) => load(spec === 'three'
    ? path.join(site, 'vendor/three/build/three.module.js')
    : path.resolve(path.dirname(from.identifier), spec)));
  await hud.evaluate();
  const sounds = [], timers = [];
  context.setTimeout = (fn, ms) => { timers.push(ms); return timers.length; };
  const me = { team: 0, name: 'Me', pos: { x: 0, y: 0, z: 0 }, weaponId: 'shooter' };
  const make = () => {
    const h = Object.create(hud.namespace.HUD.prototype);
    h.kcards = new Node('div'); h.downLayer = new Node('div'); h.el = new Node('div');
    h._downs = []; h._L = { cb: '#2f5bff' };
    h._kills = { times: [], streak: 0, first: false, lastKiller: null, dealt: new Map(), perActor: new Map() };
    h._live = () => true; h._local = () => me; h._now = () => 10;
    h._snd = name => sounds.push(name); h._callout = () => {}; h._clearDamageDirs = () => {}; h._actors = () => [];
    return h;
  };
  return {
    sounds, timers, me, make, marks: h => h.downLayer.children.map(n => n.className),
    enemy: (name = 'Target') => ({ team: 1, name, pos: { x: 3, y: 1, z: -2 }, weaponId: 'shooter' }),
    mate: () => ({ team: 0, name: 'Mate' }),
  };
}

test('#561: installed built site presents the assist exactly like the composition', { skip: !process.env.INKWAVE_ASSIST_BUILT_SITE }, async () => {
  const site = process.env.INKWAVE_ASSIST_BUILT_SITE;
  assert.ok(fs.existsSync(path.join(site, 'src/ui/hud.js')), `built site exists: ${site}`);
  const r = await installedRig(site);
  const victim = r.enemy();
  const assist = r.make();
  assist._kills.dealt.set(victim, assist._now());
  assist._onSplatted({ victim, attacker: r.mate() });
  assert.equal(assist.kcards.children.length, 0, 'the installed site shows no ASSIST card');
  assert.deepEqual(r.sounds, [], 'the installed site plays no assist sound');
  assert.deepEqual(r.timers, [], 'the installed site schedules no 1.7 s assist card');
  assert.deepEqual(r.marks(assist), ['iw-down iw-down--assist']);
  assert.equal(assist._downs.length, 1, 'the installed marker enters the world projection pool');

  r.sounds.length = 0; r.timers.length = 0;
  const direct = r.make();
  direct._onSplatted({ victim: r.enemy('Direct'), attacker: r.me });
  assert.equal(direct.kcards.children.length, 1, 'the installed direct-splat card is unaffected');
  assert.deepEqual(r.sounds, []);
  assert.deepEqual(r.timers, [2200], 'the installed direct-splat card keeps its 2200 ms lifetime');

  const css = fs.readFileSync(path.join(site, 'patches/splatoon3/ui.css'), 'utf8');
  assert.ok(css.includes('.iw-down--assist'), 'the installed stylesheet ships the assist marker rule');
});

test('#561 current native Actor/Flow assist event reaches presentation without changing stats or awards',async()=>{
 const f=await actorFixture(),r=await hudRig(compose('src/ui/hud.js'));
 const helper=f.make(),killer=f.make(),victim=f.make();helper.team=killer.team=0;victim.team=1;victim.invuln=0;
 r.hud._local=()=>helper;f.G.match.mode='turf';
 f.on('splatted',event=>r.hud._onSplatted(event));
 victim.damage(1,helper,'shooter');const before=helper.stats.assists;victim.splat(killer,'shooter');
 assert.equal(helper.stats.assists,before+1);assert.ok(helper.s3.flow.score>0);
 assert.deepEqual(r.marks(),['iw-down iw-down--assist']);assert.equal(r.hud.kcards.children.length,0);assert.deepEqual(r.sounds,[]);
});
