import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { deathGearPenalty } from '../runtime/clothing-gear.mjs';
import { rollerContactCandidate } from '../runtime/roller.mjs';
import { chargerActorBeforeStop } from '../runtime/weapons-charger-flight.mjs';
import { resolveSubAtCharge, SUCTION, CURLING } from '../runtime/kit-subs.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const readPublic = rel => fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
const readPatch = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('#1130 water/fall keeps Respawn Punisher wearer Special loss without enemy-only respawn frames', () => {
  const victim = { team: 0, s3: { loadout: [{}, { main: 'respawnPunisher' }] } };
  const tuning = {
    clothingGear: { respawnPunisher: {
      quickRespawnAPScale: 0.5, specialSaverAPScale: 0.5,
      targetFrames: 45, selfFrames: 68, targetSpecialLoss: 0.15, selfSpecialLoss: 0.15,
    } },
    gear: { quickRespawn: [0, 0, 0], specialSaver: [0, 0, 0] },
    gearExtra: { quickRespawnAroundFrames: null },
    respawnChaseTime: 5,
  };
  const curve = () => 1;
  for (const cause of ['water', 'fall', 'out', 'bounds', 'void']) {
    const p = deathGearPenalty(victim, null, cause, tuning, {}, curve);
    assert.equal(p.selfSpecial, true, cause);
    assert.equal(p.self, false, cause);
    assert.equal(p.frames, 0, cause + ' must not invent enemy-only respawn frames');
    assert.equal(p.loss, 0.15, cause + ' keeps the wearer Special penalty');
  }
});

test('#1120 Ink Vac firing phase consumes a real ZR release edge, not the held suction level', () => {
  const code = readPatch('patches/splatoon3/runtime/kit-ink-vac.mjs');
  assert.ok(code.includes('state.exhaleArmed = !!state.fireHeld;'));
  assert.ok(code.includes('const releaseEdge = state.exhaleArmed && state.fireHeld && !fire;'));
  assert.ok(code.includes('if (releaseEdge || state.t + 1e-10 >= INK_VAC_CALIBRATION.exhaleHoldSeconds) release(state);'));
  assert.ok(!code.includes('if (fire || state.t + 1e-10 >= INK_VAC_CALIBRATION.exhaleHoldSeconds) release(state);'));
});

test('#1122 Roller body capsule follows aim pitch and no longer uses the fixed dy slab', () => {
  const player = { radius: 0.35, height: 1.9, squidHeight: 0.8 };
  const actor = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, aimPitch: 0 };
  const high = { pos: { x: 0, y: 0.9, z: 0.75 }, form: 'kid' };
  assert.equal(rollerContactCandidate(actor, high, { rollWidth: 99 }, player), false,
    'neutral lowered drum does not reach the elevated capsule');
  actor.aimPitch = 0.6;
  assert.equal(rollerContactCandidate(actor, high, { rollWidth: 0.1 }, player), true,
    'raising the actual drum by pitch reaches the elevated capsule independent of paint width');

  const adapted = adaptSource('src/game/weapons.js', readPublic('src/game/weapons.js'));
  assert.ok(adapted.includes('rollerContactCandidate(a, e, w, PLAYER)'));
  assert.ok(!adapted.includes('fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2'));
});

test('#1123 Suction/Curling keep their source-specific explosion paint records', () => {
  const suction = resolveSubAtCharge(SUCTION, 0);
  assert.equal(suction.paintRadius, 5);
  assert.equal(suction.crossPaintRadius, 2.5);
  assert.equal(suction.splashSatellites, 15);
  assert.equal(suction.splashSatelliteRadius, 1.116);

  const tap = resolveSubAtCharge(CURLING, 0);
  const full = resolveSubAtCharge(CURLING, 1);
  assert.equal(tap.paintRadius, 2.133);
  assert.equal(tap.crossPaintRadius, 1);
  assert.equal(tap.splashSatellites, 12);
  assert.equal(tap.splashSatelliteRadius, 0.805);
  assert.equal(full.paintRadius, 5);
  assert.equal(full.crossPaintRadius, 2.1);

  const adapted = adaptSource('src/game/weapons.js', readPublic('src/game/weapons.js'));
  assert.ok(adapted.includes('kitBombExplosionPaint(SUB, b, G.paint)'));
  assert.ok(adapted.includes('if (kitArea == null) {'), 'generic Splat Bomb keeps its old fallback');
});

test('#1131 an aborted room invalidates an awaited Judd continuation before results/XP resume', () => {
  const code = adaptSource('src/main.js', readPublic('src/main.js'));
  assert.ok(code.includes('const judgeEpoch = this._s3JudgeEpoch = (this._s3JudgeEpoch || 0) + 1;'));
  assert.ok(code.includes("if (this._s3JudgeEpoch !== judgeEpoch || this.match !== m || m.state !== 'judge') return;"));
  const quit = code.indexOf('async quitToMenu()');
  const invalidate = code.indexOf('this._s3JudgeEpoch = (this._s3JudgeEpoch || 0) + 1;', quit);
  const fade = code.indexOf('await this._fade', quit);
  assert.ok(quit >= 0 && invalidate > quit && (fade < 0 || invalidate < fade),
    'quit invalidates Judd synchronously before any fade await');
});

test('#1135 zero-damage Slosher landing splash cannot append a victim to the volley cache', () => {
  const code = adaptSource('src/game/weapons.js', readPublic('src/game/weapons.js'));
  const fn = code.slice(code.indexOf('_sloshSplash(p, at, direct)'), code.indexOf('fireBlaster(a, w', code.indexOf('_sloshSplash(p, at, direct)')));
  const gate = fn.indexOf('if (w.splashDamage > 0)');
  const cache = fn.indexOf('p.vol.hits.push(e)');
  assert.ok(gate >= 0 && cache > gate);
  assert.ok(fn.indexOf("G.audio?.play('slosh_land'") > fn.indexOf('\n    }\n    if (p.owner.isLocal'),
    'visual landing FX stay outside the qualifying damage gate');
});

test('#1125 network composition carries Blaster startup as presentation-only sidecar', () => {
  const code = readPatch('patches/network-replication/adapter.mjs');
  assert.ok(code.includes('bw = Object.create(null)'));
  assert.ok(code.includes('msg.bw = bw'));
  assert.ok(code.includes('snap.blasterWindup = windup'));
  assert.ok(code.includes('o.blasterWindup ='));
  assert.ok(code.includes("wr.s3BlasterWindup = a.weapon.kind === \\'blaster\\' ? Math.max(0, Number(S.blasterWindup) || 0) : 0;"));
});

test('#1134 Charger actor candidates are clipped strictly before the nearest defense contact', () => {
  assert.equal(chargerActorBeforeStop(0.4, 10, 5), true);
  assert.equal(chargerActorBeforeStop(0.5, 10, 5), false, 'equal-distance defense wins the tie');
  assert.equal(chargerActorBeforeStop(0.6, 10, 5), false);
  const code = readPatch('patches/splatoon3/runtime/weapons-charger-flight.mjs');
  assert.ok(code.includes('if(chargerActorBeforeStop(t,length,distance))actors.push'));
  assert.ok(code.indexOf('const defense=system.kitDefenseCandidate') < code.indexOf('const actors=[]'),
    'defense stop distance is resolved before actor candidates are admitted');
});
