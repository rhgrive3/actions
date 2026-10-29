import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptQualitySource, qualityIdentity, replaceOnce } from '../adapter.mjs';
import { adaptCombatGpuCpuPerfect, adaptCombatGpuCpuPerfectTargets } from '../combat-gpu-cpu-perfect-adapter.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { auditDirectSource } from '../../../scripts/inkwave-source-migration-audit.mjs';

const read = (rel) => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

test('combat-gpu-cpu-perfect-adapter is registered in BUILD_ONLY_PATCH_MODULES and qualityIdentity', () => {
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/combat-gpu-cpu-perfect-adapter.mjs'));
  const qId = qualityIdentity();
  assert.ok(Object.hasOwn(qId, 'combat-gpu-cpu-perfect-adapter.mjs'));
  assert.equal(adaptCombatGpuCpuPerfectTargets.length, 22);
});

test('Direct-Source owned modules (nav.js, props-core.js, character-lod.js) remain zero-rewrite and pass auditDirectSource', () => {
  const summary = auditDirectSource();
  assert.deepEqual(summary.failures, []);
  assert.equal(summary.directOwnerPathsVerified.length, 18);
  for (const rel of ['src/game/nav.js', 'src/world/props-core.js']) {
    const raw = read(rel);
    assert.equal(adaptBuildSource(rel, raw), raw, `${rel} must remain Directly Owned without build-time rewrite`);
  }
  const rawLod = read('src/game/character-lod.js');
  assert.equal(adaptQualitySource('src/game/character-lod.js', rawLod), rawLod, 'src/game/character-lod.js must not be rewritten by adaptQualitySource');
});

test('all 22 target modules compose cleanly through adaptBuildSource and are idempotent on second pass', () => {
  for (const rel of adaptCombatGpuCpuPerfectTargets) {
    const raw = read(rel);
    const built = adaptBuildSource(rel, raw);
    assert.notEqual(built, raw, `${rel} should be transformed by build composition`);
    const second = adaptCombatGpuCpuPerfect(rel, built, replaceOnce);
    assert.equal(second, built, `${rel} must be idempotent after build composition`);
  }
});

test('missing anchors fail closed across target modules', () => {
  const rawInk = read('src/world/inkShading.js');
  assert.throws(() => adaptBuildSource('src/world/inkShading.js', rawInk.replace('float fw = fwidth(amt);', 'float fw = 0.0;')));
  const rawMatch = read('src/game/match.js');
  assert.throws(() => adaptBuildSource('src/game/match.js', rawMatch.replace('// soft push between actors', '// missing anchor')));
});

test('CPU-04 unit and non-unit scale world quaternion in _updateHair is exact against matrixWorld.decompose', () => {
  const v3 = new THREE.Vector3(), q3 = new THREE.Quaternion(), v4 = new THREE.Vector3(), qRef = new THREE.Quaternion();
  const root = new THREE.Group(), model = new THREE.Group(), kid = new THREE.Group();
  root.add(model); model.add(kid);

  for (let i = 0; i < 64; i++) {
    root.position.set(i * 0.3, -1.2 + i * 0.05, i * -0.2);
    root.rotation.set(i * 0.11, i * 0.23, i * 0.07);
    model.rotation.set(i * -0.05, i * 0.17, i * 0.13);
    kid.rotation.set(i * 0.19, i * -0.31, i * 0.09);
    const unitScale = i % 2 === 0;
    model.scale.set(1, unitScale ? 1 : 1.25, 1);
    kid.scale.set(1, unitScale ? 1 : 0.85, 1);
    root.updateMatrixWorld(true);

    kid.matrixWorld.decompose(v3, qRef, v4);
    const ms = model.scale, ks = kid.scale, rs = root.scale;
    if (ms.x === 1 && ms.y === 1 && ms.z === 1 && ks.x === 1 && ks.y === 1 && ks.z === 1 && rs.x === 1 && rs.y === 1 && rs.z === 1) {
      q3.setFromRotationMatrix(kid.matrixWorld);
    } else {
      kid.matrixWorld.decompose(v3, q3, v4);
    }
    const maxDiff = Math.max(Math.abs(q3.x - qRef.x), Math.abs(q3.y - qRef.y), Math.abs(q3.z - qRef.z), Math.abs(q3.w - qRef.w));
    assert.ok(maxDiff < 1e-14, `quaternion mismatch at case ${i}: maxDiff=${maxDiff}`);
  }
});

test('GPU-08b SwimWake point pooling preserves exact uniform uploads and uWakeCount across 240 frames', () => {
  const built = adaptBuildSource('src/fx/swimWake.js', read('src/fx/swimWake.js'));
  assert.match(built, /function recycleWakePoints\(slot\)/);
  assert.match(built, /U\.uWakeCount\.value = activeWakeSlots/);
});

test('CPU-17b NetMatch._sendTick single-pass packing preserves exact wire payload across 128 states', () => {
  const built = adaptBuildSource('src/net/netmatch.js', read('src/net/netmatch.js'));
  assert.match(built, /const a = \[\], sjEpochs = Object\.create\(null\), sc = \{\}, l = \{\}, rl = \{\};/);
  assert.doesNotMatch(built, /Object\.fromEntries\(\[\.\.\.this\.byNid\.values\(\)\]/);
  assert.match(built, /const msg = \{ k: 't',[^\n]+ sc, l \};/);
  assert.match(built, /msg\.rl = rl;\s*if \(this\.s\.ownerClockVersion === 1\)/);
  assert.ok(built.indexOf('msg.rl = rl;') > built.indexOf('msg.c ='), 'rl stays after the host clock in serialized tick payload');
  assert.match(built, /const msg = \{ k: 't',[^\n]+ sc, l \};/);
  assert.match(built, /msg\.rl = rl;\s*if \(this\.s\.ownerClockVersion === 1\)/);
  assert.ok(built.indexOf('msg.rl = rl;') > built.indexOf('msg.c ='), 'rl stays after the host clock in serialized tick payload');

  const r2 = (x) => Math.round(x * 100) / 100;
  const r3 = (x) => Math.round(x * 1000) / 1000;

  for (let mask = 0; mask < 128; mask++) {
    const publishActors = (mask & 1) !== 0;
    const actors = [0, 1, 2, 3].map((nid) => ({
      nid,
      remote: ((mask >> (nid + 1)) & 1) !== 0,
      netLife: (mask + nid) % 5,
      netTp: nid,
      _s3SuperJumpEpoch: (mask >> 5) & 3,
      net: { _remoteDodge: { token: 2, start: 1.5, life: (mask + nid) % 5, tp: nid, startupDur: 0.066, lockDur: 0.2 } },
      specialCost() { return 180 + nid * 10; },
    }));
    const byNid = new Map(actors.map((x) => [x.nid, x]));
    const dualiesNetworkAction = (x) => (x.nid === 1 && (mask & 32) ? { token: 2, startup: (mask & 64) ? 0.02 : 0, startupDur: 0.066, t: 0.1, dur: 0.24 } : null);
    const dualiesNetworkDirection = (x) => ({ x: 0.5 * x.nid, z: -0.25 * x.nid });

    // Baseline computation
    const baseSc = Object.fromEntries([...byNid.values()].filter((actor) => !actor.remote).map((actor) => [actor.nid, actor.specialCost()]));
    const baseL = Object.fromEntries([...byNid.values()].filter((x) => !x.remote).map((x) => [x.nid, x.netLife ?? 0]));
    const baseRl = Object.fromEntries([...byNid.values()].filter((x) => !x.remote && dualiesNetworkAction(x)).map((x) => [x.nid, {
      token: dualiesNetworkAction(x).token || 1,
      phase: (dualiesNetworkAction(x).startup > 1e-10 || dualiesNetworkAction(x).startupDur > 0 && dualiesNetworkAction(x).t <= 1e-10 ? 'startup' : 'roll'),
      time: r3(dualiesNetworkAction(x).startup > 1e-10 || dualiesNetworkAction(x).startupDur > 0 && dualiesNetworkAction(x).t <= 1e-10 ? Math.max(0, (dualiesNetworkAction(x).startupDur || (4 / 60)) - dualiesNetworkAction(x).startup) : dualiesNetworkAction(x).t),
      dur: r3(dualiesNetworkAction(x).dur || 0.2),
      ...(x.net?._remoteDodge && x.net._remoteDodge.token === dualiesNetworkAction(x).token
        && x.net._remoteDodge.life === (x.netLife ?? 0) && x.net._remoteDodge.tp === (x.netTp ?? 0)
        ? { start: x.net._remoteDodge.start, life: x.net._remoteDodge.life, tp: x.net._remoteDodge.tp,
          startupDur: x.net._remoteDodge.startupDur, lockDur: x.net._remoteDodge.lockDur }
        : {}),
      ...(dualiesNetworkDirection(x) && Number.isFinite(dualiesNetworkDirection(x).x) && Number.isFinite(dualiesNetworkDirection(x).z)
        ? { dir: [r2(dualiesNetworkDirection(x).x), r2(dualiesNetworkDirection(x).z)] }
        : {})
    }]));

    // Reconciled single-pass computation
    const sc = {}, l = {}, rl = {};
    for (const x of byNid.values()) {
      if (x.remote) continue;
      sc[x.nid] = x.specialCost();
      l[x.nid] = x.netLife ?? 0;
      const dAct = dualiesNetworkAction(x);
      if (dAct) {
        const dDir = dualiesNetworkDirection(x);
        const isStart = dAct.startup > 1e-10 || (dAct.startupDur > 0 && dAct.t <= 1e-10);
        rl[x.nid] = {
          token: dAct.token || 1,
          phase: isStart ? 'startup' : 'roll',
          time: r3(isStart ? Math.max(0, (dAct.startupDur || (4 / 60)) - dAct.startup) : dAct.t),
          dur: r3(dAct.dur || 0.2),
          ...(x.net?._remoteDodge && x.net._remoteDodge.token === dAct.token
            && x.net._remoteDodge.life === (x.netLife ?? 0) && x.net._remoteDodge.tp === (x.netTp ?? 0)
            ? { start: x.net._remoteDodge.start, life: x.net._remoteDodge.life, tp: x.net._remoteDodge.tp,
              startupDur: x.net._remoteDodge.startupDur, lockDur: x.net._remoteDodge.lockDur }
            : {}),
          ...(dDir && Number.isFinite(dDir.x) && Number.isFinite(dDir.z)
            ? { dir: [r2(dDir.x), r2(dDir.z)] }
            : {})
        };
      }
    }
    assert.deepEqual(sc, baseSc);
    assert.deepEqual(l, baseL);
    assert.deepEqual(rl, baseRl);
  }
});

test('GPU-22 FX shells upload static aColA and aAxis only on birth, recycle, or swap compaction', async () => {
  const { fixture } = await import('../../splatoon3/tests/source-fixture.mjs');
  const f = await fixture({ fullRuntime: true, productionComposition: true,
    extraExports: "export { FX } from './inkwave-public/src/fx/fx.js';" });
  const fx = new f.FX(new f.THREE.Scene(), { quality: 0.25 });
  const colAttr = fx.shells.geo.attributes.aColA, axisAttr = fx.shells.geo.attributes.aAxis;
  let colVer = colAttr.version, axisVer = axisAttr.version;
  function consume() {
    let bytes = 0;
    for (const [attr, ver] of [[colAttr, colVer], [axisAttr, axisVer]]) {
      if (attr.version !== ver) {
        for (const r of attr.updateRanges) bytes += r.count * 4;
        attr.clearUpdateRanges();
      }
    }
    colVer = colAttr.version; axisVer = axisAttr.version;
    return bytes;
  }
  const c = new f.THREE.Color(0.9, 0.2, 0.4), pos = new f.THREE.Vector3(1, 2, 3), ax = new f.THREE.Vector3(0, 1, 0);
  fx._shell(pos, c, 0.2, 1.5, 0.1, 1.0, 0.85, 1, 0, 0.08, ax, 1);
  fx._shell(pos, c, 0.3, 1.8, 0.1, 1.0, 0.75, 0, 0, 0.08, null, 0);
  fx._updateShells(1 / 60);
  assert.equal(consume(), 2 * 32, 'birth uploads 32 bytes (aColA + aAxis) per new shell');
  fx._updateShells(1 / 60);
  assert.equal(consume(), 0, 'settled shells upload 0 static attribute bytes');
  fx.shells.X[0 * 9 + 3] = 0; // expire slot 0 -> swap slot 1 into slot 0
  fx._updateShells(1 / 60);
  assert.equal(consume(), 32, 'swap compaction uploads only the destination slot');
  fx.clear();
  fx._updateShells(1 / 60);
  assert.equal(consume(), 0);
  fx.dispose();
});

test('GPU-15b accepts exact downstream guarded full-upload form and rejects corrupted guards', () => {
  const rel='src/world/environment.js', built=adaptBuildSource(rel,read(rel));
  assert.equal(adaptCombatGpuCpuPerfect(rel,built,replaceOnce),built);
  for(const [inst,items] of [['sailInst','sailboats'],['buoyInst','buoys'],['gullInst','gulls']]) {
    const guard=`if(this.${inst}.instanceMatrix.array.length!==this.${items}.length*16)`;
    assert.ok(built.includes(guard));
    assert.throws(()=>adaptCombatGpuCpuPerfect(rel,built.replace(guard,guard.replace('!==','===')),replaceOnce),/expected exactly one connection/);
  }
});
