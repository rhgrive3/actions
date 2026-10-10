import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adaptSource } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const readPublic = rel => fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
const readPatch = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const s3 = rel => adaptSource(rel, readPublic(rel));
// Replication applies after gameplay, touch, reliability and quality overlays.
// Partial composition misses the shared action-clock anchor introduced there.
const networked = rel => adaptBuildSource(rel, readPublic(rel));

test('#1128 Roller flick launch uses legal actor aim pitch without the legacy plateau clamp', () => {
  const code = readPatch('patches/splatoon3/runtime/weapons-fidelity.mjs');
  assert.ok(code.includes('let pitch=Number.isFinite(actor.aimPitch)?actor.aimPitch:0;'));
  assert.ok(!code.includes('let pitch=Math.max(-.2,Math.min(.5,actor.aimPitch));'));
});

test('#1109 adapted Roller contact uses nonzero stick admission rather than hs > 1.0', () => {
  const code = s3('src/game/weapons.js');
  assert.ok(code.includes('rollerStickActive(a) && rollerContactCandidate(a, e, w, PLAYER)'));
  assert.ok(code.includes('if (G.boss && rollerStickActive(a))'));
  assert.ok(code.includes("import { rollerStickActive, rollerContactCandidate } from '../../patches/splatoon3/runtime/roller.mjs';"));
  assert.ok(!code.includes('Math.abs(dy) < 1.2 && hs > 1.0'));
  assert.ok(!code.includes('if (G.boss && hs > 1.0)'));
});

test('#1112 network paint replay keeps canonical CPU splat values at full precision', () => {
  const code = networked('src/net/netmatch.js');
  assert.ok(code.includes("this._rec(['s', c.x, c.y, c.z, radius, team, o.seed ?? Math.random(), o.kind ?? 0,"));
  assert.ok(code.includes('st ? st.x : 0, st ? st.y : 0, st ? st.z : 0, st ? (o.stretchAmt ?? 1) : 0'));
  assert.ok(!code.includes("this._rec(['s', r2(c.x), r2(c.y), r2(c.z), r2(radius)"));
});

test('#1121 remote Slosher carries and applies continuous windup elapsed time', () => {
  const code = networked('src/net/netmatch.js');
  assert.ok(code.includes('wp = Object.create(null)'));
  assert.ok(code.includes("x.weapon?.kind === 'slosher'"));
  assert.ok(code.includes('snap.sloshElapsed = pose ? pose[0] : -1'));
  assert.ok(code.includes('o.sloshElapsed = a.sloshElapsed + (b.sloshElapsed - a.sloshElapsed) * u'));
  assert.ok(code.includes('Number.isFinite(S.sloshElapsed) && S.sloshElapsed >= 0 ? S.sloshElapsed'));
});

test('#1117 remote Tidal Slam carries validated phase and elapsed presentation state', () => {
  const code = networked('src/net/netmatch.js');
  assert.ok(code.includes("sp?.id === 'slam'"));
  assert.ok(code.includes("({ rise:1, hang:2, fall:3 }[sp.phase] || 0)"));
  assert.ok(code.includes('snap.slamPhase = pose ? pose[1] : 0'));
  assert.ok(code.includes("a.specialActive?.id === 'slam' && S.slamPhase"));
  assert.ok(code.includes("['','rise','hang','fall'][S.slamPhase]"));
  assert.ok(code.includes('a.specialActive.t = Math.max(0, S.slamT || 0)'));
});

test('#1119 Locker portrait targets release only after queued/readback work is safe', () => {
  const code = s3('src/game/showcase.js');
  assert.ok(code.includes('_releasePortraitTargets(final = false)'));
  assert.ok(code.includes("(this._pflight || 0) > 0 || this._pq?.some?.((x) => x.cbs?.length)"));
  assert.ok(code.includes("const leavingPortraitScreen = this.mode === 'locker';"));
  assert.ok(code.includes('if (leavingPortraitScreen) this._releasePortraitTargets(false);'));
  assert.ok(code.includes('this._releasePortraitTargets(true);'));
  assert.ok(code.includes('if (this._portraitReleasePending && this._pflight === 0) this._releasePortraitTargets(false)'));
  assert.ok(code.includes('this._prt?.dispose(); this._prt8?.dispose();'));
});

test('#1118 native bomb step can be consumed by Ink Vac without a bomb explosion', () => {
  const code = s3('src/game/weapons.js');
  const vac = readPatch('patches/splatoon3/runtime/kit-ink-vac.mjs');
  const defense = readPatch('patches/splatoon3/runtime/kit-defense.mjs');
  assert.ok(code.includes('const s3BombDefense = this.kitBombDefenseCandidate?.(b, _v, b.pos);'));
  assert.ok(code.includes("if (s3BombDefense.kind === 'bubbler') {"));
  assert.ok(code.includes('this._releaseBomb(b); this.bombs.splice(i, 1); continue;'));
  assert.ok(vac.includes('if (nativeBomb) nativeBomb.s3InkVacAbsorbed = true;'));
  assert.ok(defense.includes("consider(api.inkVacAbsorbCandidate(actor, start, end, probe), 'ink-vac');"));
});

test('#1113 Splat/Suction Bomb first-contact lane includes Big Bubbler and stage-first arbitration', () => {
  const code = s3('src/game/weapons.js');
  const defense = readPatch('patches/splatoon3/runtime/kit-defense.mjs');
  assert.ok(defense.includes("if (subId !== 'bomb' && subId !== 'suction') return null;"));
  assert.ok(defense.includes("consider(this.kitBarrierCandidate?.(probe, start, end), 'bubbler');"));
  assert.ok(defense.includes('probe.damage = kitBombDamageMax(api.SUB, b, api.SUB.bomb.damageMax);'));
  assert.ok(code.includes('const s3WorldDistance = hit.hit ? _v.distanceTo(hit.point) : Infinity;'));
  assert.ok(code.includes('s3BombDefense.distance < s3WorldDistance - 1e-10'));
  const contact = code.indexOf("if (s3BombDefense.kind === 'bubbler')");
  const explode = code.indexOf('this._explodeBomb(b);', contact);
  assert.ok(contact >= 0 && explode > contact, 'Bubbler first contact detonates at the selected contact point');
});
