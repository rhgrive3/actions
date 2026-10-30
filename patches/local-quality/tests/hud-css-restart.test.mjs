// Exercise the production HUD methods with Animation/DOM doubles. Browser
// playback and rendering remain a separate acceptance check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const rel = 'src/ui/hud.js';
const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const names = new Set(['_restartCssAnimation', '_restart', '_turfPop', '_bindBus']);
function fixture(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const cls = ast.body.map(n => n.declaration || n).find(n => n.type === 'ClassDeclaration' && n.body.body.some(m => m.key?.name === '_restartCssAnimation'));
  const methods = cls.body.body.filter(m => names.has(m.key?.name)).map(m => source.slice(m.start, m.end)).join('\n');
  const handlers = new Map();
  const makeNode = () => {
    const classes = new Set(), node = { isConnected: true, reads: 0, queries: 0, animations: [], children: [],
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      get offsetWidth() { this.reads++; return 10; },
      getAnimations() { this.queries++; return this.animations; },
      appendChild(el) { this.children.push(el); el.parent = this; },
      addEventListener(type, fn) { this[type] = fn; },
      remove() { this.removed = true; if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    };
    return node;
  };
  const HUD = Function('on', 'h', 'return class {' + methods + '}')(
    (name, fn) => { handlers.set(name, fn); return () => {}; }, () => makeNode());
  const hud = new HUD(), target = makeNode(), el = makeNode();
  el.firstElementChild = target;
  const local = {};
  Object.assign(hud, { turfEl: el, tpops: makeNode(), tank: makeNode(), _tank: {}, _local: () => local, _live: () => true });
  const animation = (target, name) => ({ effect: { target }, animationName: name, playbackRate: 1,
    playState: 'running', currentTime: 120, plays: 0, play() { this.plays++; this.playState = 'running'; } });
  return { hud, el, target, local, handlers, makeNode, animation };
}

for (const [label, source] of [['raw', raw], ['composed', adaptBuildSource(rel, raw)]]) {
  test(label + ': repeated turf ticks reuse only the matching CSS effect without layout reads', () => {
    const { hud, el, target, animation } = fixture(source);
    const tick = animation(target, 'iw-turf-tick'), other = animation(target, 'unrelated-glow');
    target.animations = [other, tick];
    for (let i = 0; i < 1000; i++) hud._turfPop(i % 2 ? 5 : 25);
    assert.equal(el.reads, 1); assert.equal(target.queries, 1);
    assert.equal(tick.currentTime, 0); assert.equal(other.currentTime, 120);
    assert.equal(tick.plays, 0); assert.equal(other.plays, 0);
    assert.equal(hud.tpops.children.length, 4, 'ticker keeps its original bounded population');
    const pop = hud.tpops.children[0]; pop.animationend({ target: pop });
    assert.equal(hud.tpops.children.length, 3, 'ticker cleanup listener is unchanged');
  });

  test(label + ': lowink keeps the local/live admission and full warning duration', () => {
    const { hud, local, handlers, animation } = fixture(source);
    const shake = animation(hud.tank, 'iw-shake'); hud.tank.animations = [shake]; hud._bindBus();
    const lowink = handlers.get('lowink');
    lowink({ actor: {} }); assert.equal(hud.tank.reads, 0);
    hud._live = () => false; lowink({ actor: local }); assert.equal(hud.tank.reads, 0);
    hud._live = () => true;
    for (let i = 0; i < 50; i++) { hud._tank.empty = 0; lowink({ actor: local }); assert.equal(hud._tank.empty, .45); }
    assert.equal(hud.tank.reads, 1); assert.equal(shake.currentTime, 0);
  });

  test(label + ': completed pulses seek; paused pulses retain the original invalidation path', () => {
    const { hud, el, target, animation } = fixture(source);
    const a = animation(target, 'iw-turf-tick'); target.animations = [a];
    const restart = () => hud._restartCssAnimation(el, 'is-tick', target, 'iw-turf-tick');
    restart(); a.playState = 'finished'; restart();
    assert.equal(a.plays, 0); assert.equal(a.currentTime, 0);
    a.playState = 'paused'; a.currentTime = 100; restart();
    assert.equal(a.playState, 'paused'); assert.equal(a.currentTime, 100); assert.equal(a.plays, 0);
    assert.equal(el.reads, 2, 'paused fallback preserves class mutations for geometry observers');
  });

  test(label + ': cancellation, removal, target replacement and absent CSS effects use the original fallback', () => {
    for (const invalid of ['cancel', 'remove-class', 'disconnect', 'replace-target', 'wrong-name', 'wrong-target', 'playback-rate']) {
      const { hud, el, target, animation, makeNode } = fixture(source);
      const a = animation(target, 'iw-turf-tick'); target.animations = [a];
      hud._restartCssAnimation(el, 'is-tick', target, 'iw-turf-tick');
      let next = target;
      if (invalid === 'cancel') { a.playState = 'idle'; target.animations = []; }
      if (invalid === 'remove-class') el.classList.remove('is-tick');
      if (invalid === 'disconnect') target.isConnected = false;
      if (invalid === 'replace-target') next = makeNode();
      if (invalid === 'wrong-name') a.animationName = 'iw-s3-tank-in';
      if (invalid === 'wrong-target') a.effect.target = makeNode();
      if (invalid === 'playback-rate') a.playbackRate = 0;
      hud._restartCssAnimation(el, 'is-tick', next, 'iw-turf-tick');
      assert.equal(el.reads, 2, invalid); assert.equal(a.currentTime, 120, invalid);
    }
    const { hud, el, target } = fixture(source);
    for (let i = 0; i < 3; i++) hud._restartCssAnimation(el, 'is-tick', target, 'iw-turf-tick');
    assert.equal(el.reads, 3, 'CSS disabled by media/style rules stays on the fallback');
    hud._restartCssAnimation(el, 'is-tick', null, 'iw-turf-tick');
    assert.equal(el.reads, 4, 'missing target remains supported');
  });

  test(label + ': a CSS animation overriding the tank shake is never rewound', () => {
    const { hud, animation } = fixture(source);
    const swim = animation(hud.tank, 'iw-s3-tank-in'); hud.tank.animations = [swim];
    for (let i = 0; i < 3; i++) hud._restartCssAnimation(hud.tank, 'is-empty', hud.tank, 'iw-shake');
    assert.equal(hud.tank.reads, 3); assert.equal(swim.currentTime, 120); assert.equal(swim.plays, 0);
  });
}
