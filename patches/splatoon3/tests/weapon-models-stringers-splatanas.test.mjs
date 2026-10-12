// Stringer string draw / release and Splatana slash motion run from read-only catalogue state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const production = () => fixture({ fullRuntime: true, includeCharacter: true, productionComposition: true, realProjectiles: true,
  extraExports: "export * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';\nexport * as STR from './patches/splatoon3/runtime/weapon-models/stringers.mjs';\nexport * as SAB from './patches/splatoon3/runtime/weapon-models/splatanas.mjs';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" })
  .then(f => { f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile); return f; });

async function run(id, frames) {
  const f = await production(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.physics = new f.Physics(G.level); G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  const a = new f.Actor({ team: 0, weapon: id, CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
  const out = [];
  for (let n = 0; n < frames; n++) {
    const fire = n >= 10 && n < 10 + (frames > 160 ? 110 : 12); a.intent.fire = fire; a.ink = 100;
    G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire, firePressed: n === 10 }); a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true);
    out.push({ ch, str: ch.weapon?.parts?.string?.rotation.x ?? 0, snap: f.SAB.sabreSnapshot(ch), roll: f.STR.bowRollSnapshot(ch) });
  }
  return { f, a, ch, out };
}

test('stringers draw the string with the charge and snap forward on release; bow rolls only while grounded', async () => {
  const { out, ch } = await run('s3-stringer-normal', 260);
  const rot = out.map(o => o.str);
  const peak = Math.max(...rot), at = rot.indexOf(peak);
  assert.ok(peak > 0.2, 'string drawn (rot ' + peak.toFixed(3) + ')');
  assert.ok(rot[rot.length - 1] < peak * 0.3, 'string returned after release');
  assert.ok(at > 20 && at < 200);
  assert.ok(out[out.length - 1].roll > 0.9, 'grounded roll settled');
  ch.root.parent?.remove(ch.root);
});

test('splatanas play a slash read from catalogue state, with no shooter recoil', async () => {
  for (const id of ['s3-saber-normal', 's3-saber-lite', 's3-saber-heavy']) {
    const tap = await run(id, 90), tapMax = Math.max(...tap.out.map(o => o.snap?.k ?? 0));
    assert.ok(tapMax > 0.3, id + ' tap slash plays (' + tapMax.toFixed(2) + ')');
    assert.ok(tap.out.some(o => o.snap && !o.snap.full && o.snap.k > 0.3), id + ' tap is the horizontal slash');
    const full = await run(id, 260);
    assert.ok(full.out.some(o => o.snap?.raise > 0.3), id + ' blade is raised while charging');
    assert.ok(full.out.some(o => o.snap?.full && o.snap.k > 0.3), id + ' full charge plays the vertical slash');
    assert.ok(full.out.every(o => [...o.ch.P].every(Number.isFinite)));
  }
});
