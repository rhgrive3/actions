// Real Character/source-bank pair; only the native weapon target block differs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

export const NATIVE_WEAPON_TARGET_BASE = '84453765039f040cb937f6beb7fdb58d54f169dd';
export const NATIVE_WEAPON_TARGET_FIXTURE_SHA256 = '3509256a7dcaa32cc9a9a421d56e220eb1b21533a09e88602fe5d7983a2100ef';
const before = fs.readFileSync(new URL('./fixtures/native-weapon-target-84453765.js.txt', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(before).digest('hex'), NATIVE_WEAPON_TARGET_FIXTURE_SHA256,
  'fixed pre-guard weapon target block');

export function baselineNativeWeaponTargetSource(rel, raw) {
  const code = adaptBuildSource(rel, raw);
  if (rel !== 'src/game/character.js') return code;
  const first = '    // ---- weapon anchor → right arm IK\n';
  const last = '    w.pivot.rotation.set(P[SPIN], 0, 0);';
  assert.equal(code.split(first).length, 2, 'one target block');
  assert.equal(code.split(last).length, 2, 'one target end');
  const start = code.indexOf(first), end = code.indexOf(last, start);
  assert.ok(end > start);
  assert.match(code.slice(start, end), /const nativeWeaponTarget = this\.dual \|\| nativeRightIk;/,
    'reference restores the guarded production block');
  return code.slice(0, start) + before + code.slice(end);
}

export function nativeWeaponTargetPair() {
  return Promise.all([
    sourceLoadedActorFixture({sourceOnly: true, transform: baselineNativeWeaponTargetSource, random: () => .4}),
    sourceLoadedActorFixture({sourceOnly: true, random: () => .4}),
  ]);
}

const vector = v => v.toArray();
function values(object) {
  return Object.fromEntries(Object.keys(object).sort().flatMap(key => {
    const value = object[key];
    return value === null || ['number', 'boolean', 'string'].includes(typeof value)
      ? [[key, value]] : value?.isVector3 || value?.isQuaternion ? [[key, vector(value)]] : [];
  }));
}

export function nativeWeaponTargetSnapshot(api, actor, includeSkin = false) {
  const ch = actor.character, motion = ch.sourceMotion, nodes = [];
  ch.root.updateMatrixWorld(true); ch.skeleton.update();
  ch.root.traverse(node => nodes.push({name: node.name, visible: node.visible,
    position: vector(node.position), rotation: vector(node.quaternion), scale: vector(node.scale),
    world: Array.from(node.matrixWorld.elements)}));
  const point = new api.THREE.Vector3(), aim = new api.THREE.Vector3();
  const aimAvailable = ch.getAimMuzzle(aim, .2);
  const snapshot = {
    nodes, P: Array.from(ch.P), springs: Array.from(ch.sp),
    actor: values(actor), stats: values(actor.stats), runner: values(actor.weaponRunner), character: values(ch),
    muzzle: vector(ch.getMuzzle(point)), rightMuzzle: vector(ch.getMuzzleHand(point, 0)),
    leftMuzzle: vector(ch.getMuzzleHand(point, 1)), aimAvailable, aimMuzzle: vector(aim),
    head: vector(ch.getHeadPosition(point)),
    face: {mouth: vector(ch.u.uMouth.value), look: vector(ch.u.uLook.value)},
    bones: Array.from(ch.skeleton.boneMatrices), feet: ch.feet.map(values), ik: Array.from(ch.ikErr),
    source: {active: motion.active, state: motion.state, upper: motion.sourceUpper,
      keep: motion.keepSourceArms, activation: motion.activationTime,
      contact: Array.from(motion.contact || []), lift: Array.from(motion.lift || []),
      contacts: motion.retarget?.contacts.map(values)},
    shots: api.G.projectiles.list.map(shot => ({...values(shot),
      pos: shot.pos && vector(shot.pos), vel: shot.vel && vector(shot.vel)})),
  };
  if (includeSkin) {
    snapshot.skin = [];
    ch.root.traverse(node => {
      if (!node.isSkinnedMesh) return;
      const position = node.geometry.attributes.position, vertices = [];
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        node.applyBoneTransform(i, point); point.applyMatrix4(node.matrixWorld);
        vertices.push(...vector(point));
      }
      snapshot.skin.push(vertices);
    });
  }
  for (const [name, values] of [['pose', snapshot.P], ['springs', snapshot.springs], ['bones', snapshot.bones]])
    assert.ok(values.every(Number.isFinite), `finite ${name} output`);
  // Drop optional undefined fields identically across VM realms. All bone and
  // spring components remain present; this does not compare prototype identity.
  return JSON.parse(JSON.stringify(snapshot));
}
