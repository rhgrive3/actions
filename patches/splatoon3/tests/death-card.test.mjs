// #918: the death card's SPLATTED BY value is the splat cause (weapon / sub / special / environment); the
// attacker's name is a separate line. Runs the actual composed main.js 'splatted' handler and HUD.showSplatted,
// and the real death-card module over the real config tables. DOM, audio and camera are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const compose = (rel, code = read(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
function section(code, start, end) { const a = code.indexOf(start), b = code.indexOf(end, a); assert(a >= 0 && b > a, start); return code.slice(a, b); }

const context = vm.createContext({ console });
const config = new vm.SourceTextModule(read('src/config.js'), { context });
await config.link(() => { throw Error('unexpected config import'); }); await config.evaluate();
const card = new vm.SourceTextModule(fs.readFileSync(new URL('patches/splatoon3/runtime/death-card.mjs', root), 'utf8'), { context });
await card.link(() => config); await card.evaluate();
const { splatCardText } = card.namespace, { WEAPONS } = config.namespace;
const SUB_BOMB = config.namespace.SUB.bomb.name, SLAM = config.namespace.SPECIALS.slam.name;

class Node {
  constructor(tag, attrs, kids) {
    this.names = new Set(String(attrs?.class || '').split(/\s+/).filter(Boolean)); this.children = [];
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) this.children.push(kid);
  }
  find(name) { return this.names.has(name) ? this : this.children.map(c => c instanceof Node ? c.find(name) : null).find(Boolean) || null; }
  text() { return this.children.map(c => c instanceof Node ? c.text() : String(c)).join(''); }
  prepend() {} appendChild(n) { this.children.push(n); return n; } querySelector(sel) { return typeof sel === 'string' && sel.startsWith('.') ? this.find(sel.slice(1)) : null; } animate() {}
}
function showSplatted(source, args, lastKiller = null) {
  const code = `(() => { class Hud {${section(source, '  showSplatted({', '\n  hideSplatted(')}} return Hud; })()`;
  const Hud = vm.runInNewContext(code, {
    h: (tag, attrs, ...kids) => new Node(tag, attrs, kids), splatSVG: () => '', weaponIcon: () => '', richText: v => v, colorVars() {}, toHex: v => v,
    kindOf: w => (WEAPONS[w] || {}).kind || w, WEAPONS, BUMP: {}, Math, String,
  });
  const hud = Object.assign(Object.create(Hud.prototype), {
    hideSplatted() {}, el: new Node('div', {}, []), splatLayer: new Node('div', {}, []), _kills: { lastKiller }, _fxTime: 0, _addFx() {}, _snd() {},
  });
  hud.showSplatted(args);
  return hud.splatLayer.children[0];
}
// The real 'splatted' handler body from main.js, with its collaborators as fixtures.
function localDeath(source, { attacker, cause, splatCardTextImpl = splatCardText }) {
  const handler = section(source, "    on('splatted', ({ victim, attacker, cause }) => {", '\n    });\n') + '\n    });';
  let run; const shown = [];
  const game = { match: { attract: false, local: { team: 0 } }, hud: { showSplatted: a => shown.push(a), feed() {} },
    rig: { lookAt: { copy() {} } } };
  const victim = { isLocal: true, pos: { clone: () => ({}) }, team: 0 };
  const install = vm.runInNewContext(`(function (on) { ${handler} })`, {
    G: { audio: { play() {}, duck() {} }, teamHex: ['#f80', '#25f'] }, PLAYER: { respawnTime: 5 }, t: v => v, splatCardText: splatCardTextImpl, clamp: v => v,
  });
  install.call(game, (_name, fn) => { run = fn; });
  run.call(game, { victim, attacker, cause });
  return { shown: shown[0], game };
}
const rival = { name: 'Rival', team: 1, weaponId: 'shooter', alive: true };

test('negative control: native card binds the attacker name to SPLATTED BY and demotes the weapon', () => {
  const { shown } = localDeath(read('src/main.js'), { attacker: rival, cause: 'weapon' });
  assert.equal(shown.by, 'Rival');
  const el = showSplatted(read('src/ui/hud.js'), shown, rival);
  assert.equal(el.find('iw-spl__by').text(), 'SPLATTED BY');
  assert.equal(el.find('iw-spl__name').text(), 'Rival');
  assert.equal(el.find('iw-spl__wn').text(), WEAPONS.shooter.name);
});

test('#918: SPLATTED BY shows the weapon cause and the attacker is a separate secondary line', () => {
  const { shown } = localDeath(compose('src/main.js'), { attacker: rival, cause: 'weapon' });
  assert.equal(shown.by, WEAPONS.shooter.name);
  assert.equal(shown.who, 'Rival');
  const el = showSplatted(compose('src/ui/hud.js'), shown, rival);
  assert.equal(el.find('iw-spl__by').text(), 'SPLATTED BY');
  assert.equal(el.find('iw-spl__name').text(), WEAPONS.shooter.name);
  assert.notEqual(el.find('iw-spl__name').text(), rival.name);
  assert.equal(el.find('iw-spl__who').text(), 'Rival');
});

test('#918: a different weapon, sub or special produces its own cause text', () => {
  for (const [weaponId, cause, expected] of [
    ['roller', 'weapon', WEAPONS.roller.name], ['shooter', 'charger', WEAPONS.charger.name], ['blaster', 'blaster', WEAPONS.blaster.name],
    ['shooter', 'bomb', SUB_BOMB], ['charger', 'slam', SLAM],
  ]) {
    const result = splatCardText(cause, { ...rival, weaponId });
    assert.deepEqual({ ...result }, { cause: expected, who: 'Rival' }, `${weaponId}/${cause}`);
    assert.notEqual(result.cause, rival.name);
  }
});

test('#918: environmental and unattributed deaths state their cause; an attacker stays separate', () => {
  assert.deepEqual({ ...splatCardText('water', null) }, { cause: 'the sea', who: null });
  assert.deepEqual({ ...splatCardText('ink', null) }, { cause: 'enemy ink', who: null });
  assert.deepEqual({ ...splatCardText('weapon', null) }, { cause: 'enemy ink', who: null });
  assert.deepEqual({ ...splatCardText('water', rival) }, { cause: 'the sea', who: 'Rival' });
  assert.deepEqual({ ...splatCardText('ink', rival) }, { cause: 'enemy ink', who: 'Rival' });
  const hud = showSplatted(compose('src/ui/hud.js'), { by: 'the sea', who: null });
  assert.equal(hud.find('iw-spl__name').text(), 'the sea'); assert.equal(hud.find('iw-spl__who'), null);
});

test('#918: unknown or hostile causes never leak table prototypes; a cause-less attacker keeps its name', () => {
  assert.deepEqual({ ...splatCardText('constructor', rival) }, { cause: WEAPONS.shooter.name, who: 'Rival' });
  assert.deepEqual({ ...splatCardText('__proto__', { name: 'Boss', team: 1 }) }, { cause: 'Boss', who: null });
  assert.deepEqual({ ...splatCardText('weapon', { name: 'HULLBREAKER', team: 1 }) }, { cause: 'HULLBREAKER', who: null });
});

test('#918: respawn timing and the spectate camera are untouched', () => {
  const { shown, game } = localDeath(compose('src/main.js'), { attacker: rival, cause: 'weapon' });
  assert.equal(shown.respawn, 5);
  assert.equal(shown.byColor, '#25f');
  assert.equal(game.rig.mode, 'spectate');
});

test('#918: the connections fail closed on upstream drift', () => {
  const main = read('src/main.js'), hud = read('src/ui/hud.js');
  assert.throws(() => adaptSource('src/main.js', main.replace("t(cause === 'water' ? 'the sea' : 'enemy ink')", "t('enemy ink')")), /death card splat cause/);
  assert.throws(() => adaptSource('src/ui/hud.js', hud.replace("showSplatted({ by = null, byColor", "showSplatted({ by = null, color, byColor")), /death card opponent identity input|respawn lifecycle/);
  assert.throws(() => adaptSource('src/ui/hud.js', hud.replace("killer && killer.weaponId ? h('div', { class: 'iw-spl__wn' }", "killer && killer.weaponId ? h('div', { class: 'iw-spl__wx' }")), /death card opponent identity line|respawn lifecycle/);
});
