import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
const compose = rel => adaptSource(rel, read(rel));
const section = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing section ${start}`);
  return source.slice(a, b);
};

async function firstEnemyInkTick(kind, { ink = null, cooldown = 0, kidT = 1 } = {}) {
  const f = await fixture();
  f.G.paint.sample = () => 2;
  const a = f.make(kind);
  a.kidT = kidT;
  a.intent.move.set(0, 0, 1);
  a.intent.fire = true;
  a.weaponRunner.cooldown = cooldown;
  if (ink != null) a.ink = ink;
  const expectedShot = a.s3.modifiers.enemyShotSpeed;
  const expectedWalk = a.s3.modifiers.enemyMoveSpeed;
  let store = f.PLAYER.enemyInkSpeed;
  const selected = [];
  Object.defineProperty(f.PLAYER, 'enemyInkSpeed', {
    configurable: true,
    get() { return store; },
    set(v) { selected.push(v); store = v; },
  });
  const shots = f.shots.length;
  a.update(1 / 60);
  return { f, a, selected, emitted: f.shots.length - shots, expectedShot, expectedWalk };
}

test('#1068 Shooter and Dualies select enemy-shot movement on the same fixed tick as the first real shot', async () => {
  for (const kind of ['shooter', 'dualies']) {
    const r = await firstEnemyInkTick(kind);
    assert.equal(r.emitted, 1, `${kind} emits on the first admitted tick`);
    assert.equal(r.selected[0], r.expectedShot, `${kind} movement already uses the shot curve on that tick`);
    assert.notEqual(r.selected[0], r.expectedWalk);
  }
});

test('#1068 empty, cooldown-blocked and emerge-delay attempts do not preselect the shot curve', async () => {
  for (const kind of ['shooter', 'dualies']) {
    const empty = await firstEnemyInkTick(kind, { ink: 0 });
    assert.equal(empty.emitted, 0);
    assert.equal(empty.selected[0], empty.expectedWalk, `${kind} empty attempt`);

    const cooling = await firstEnemyInkTick(kind, { cooldown: 0.2 });
    assert.equal(cooling.emitted, 0);
    assert.equal(cooling.selected[0], cooling.expectedWalk, `${kind} cooldown attempt`);

    const emerging = await firstEnemyInkTick(kind, { kidT: 0 });
    assert.equal(emerging.emitted, 0);
    assert.equal(emerging.selected[0], emerging.expectedWalk, `${kind} emerge-delay attempt`);
  }
});

test('#1060 composed Blaster burst keeps damage/FX but has no generic impactRadius floor stamp', () => {
  const source = compose('src/game/weapons.js');
  const burst = section(source, '  _blastBurst(p, at, direct) {', '\n  _updateBombs(dt) {');
  assert.match(burst, /G\.fx\?\.explosion/);
  assert.match(burst, /weapon:impact/);
  assert.match(burst, /distanceDamage\(w\.damageBands/);
  assert.doesNotMatch(burst, /G\.paint\.splat/);
  assert.doesNotMatch(burst, /w\.impactRadius/);
});

test('#1066 Private Battle gates persistent level progression and omits the normal XP panel', () => {
  const main = compose('src/main.js');
  const judge = section(main, '  async _judge() {', '\n  _fade(to, ms) {');
  assert.match(judge, /const privateBattle = !!G\.netm/);
  assert.match(judge, /const gained = privateBattle \? 0 : Math\.round/);
  assert.match(judge, /if \(!privateBattle\) \{[\s\S]*p\.xp \+= gained;[\s\S]*saveJSON\('inkwave\.profile', p\);[\s\S]*\}/);
  assert.match(judge, /if \(G\.netm\) data\.online = true/);

  const menus = compose('src/ui/menus.js');
  assert.match(menus, /iw-res__foot' \}, online \? null : xpPanel/);
});

test('#1058 Charger publishes current/clamped and unobstructed full reach to two HUD markers', () => {
  const player = compose('src/game/player.js');
  assert.match(player, /chargerCurrentReach = new THREE\.Vector3\(\)/);
  assert.match(player, /const fullRange = G\.projectiles\?\.chargerReach \? G\.projectiles\.chargerReach\(1\) : w\.rangeMax/);
  assert.match(player, /const stop = Math\.min\(range,[\s\S]*best\)/);
  assert.match(player, /chargerCurrentReach\.copy\(start\)\.addScaledVector\(fwd, stop\)/);
  assert.match(player, /chargerFullReach\.copy\(start\)\.addScaledVector\(fwd, fullRange\)/);

  const main = compose('src/main.js');
  assert.match(main, /chargerCurrent: m\.controller\?\.chargerReachVisible \? m\.controller\.chargerCurrentReach : null/);
  assert.match(main, /chargerFull: m\.controller\?\.chargerReachVisible \? m\.controller\.chargerFullReach : null/);

  const hud = compose('src/ui/hud.js');
  assert.match(hud, /--crx/);
  assert.match(hud, /--cfx/);
  assert.match(hud, /classList\.toggle\('has-reach', reachOn\)/);

  const css = fs.readFileSync(new URL('patches/splatoon3/ui.css', ROOT), 'utf8');
  assert.match(css, /\.iw-ret--charger\.has-reach::before/);
  assert.match(css, /\.iw-ret--charger\.has-reach::after/);
});
