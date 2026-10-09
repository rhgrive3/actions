import * as THREE from 'three';
// Splat Roller middle hinge / fold (issue #916) — presentation layer only.
//
// Native `buildRoller()` bakes the shaft, cast hub, yoke arms, bearing bosses and
// reservoir into ONE merged buffer that `finishParts()` publishes as
// `bodyStatic` / `inkStatic` ("everything that never moves"). The drum is the
// only moving piece and it hangs directly off the whole-weapon group, so a
// vertical flick swings a full-length rigid object (reproduced on main f31f5da4
// in evidence/additional-100/cl7-916-main-reproduction.log through the complete
// production adapter composition).
//
// This module is the single owner of the fold and is deliberately standalone so
// the parent can combine it with the independent #915 weapon-transform work
// without anchor or ownership conflicts:
//   1. rollerFoldModel(d)   — runs inside the weapon BUILD chain (adapter), splits
//                             the merged native frame at the middle joint and hands
//                             the roller-side half to a real articulated
//                             `parts.hinge` / `parts.hingeInk` group instead of
//                             bodyStatic. Splitting is by closed connected
//                             component, never by a cutting plane, so both halves
//                             stay closed surfaces and the unfolded rest pose is
//                             identical to the native model.
//   2. attachRollerFold(...) — builds ONE hinge Group in Character._weaponInstance
//                             and reparents the hinge parts and the whole
//                             drum/caps mesh under it (adapter connection).
//   3. installRollerFold(...) — render-layer transform owner. It only READS the
//                             existing attack state (`character.s3RollerFlick`, owner
//                             `s3RollerAttack`, or network-applied `s3RollerFoldAttack`,
//                             plus `character.wRoll`)
//                             and never writes runner timing,
//                             ink, paint, projectiles or hit shapes.
//
// Splatoon 3 publishes the existence of the fold (folded for the vertical swing,
// unfolded for horizontal swings and rolling) but NOT the hinge angle or the
// per-frame curve. Everything in ROLLER_FOLD below is explicit INKWAVE rig
// calibration against public footage, never an extracted Nintendo value.
const V3 = THREE.Vector3;
export const ROLLER_FOLD = Object.freeze({
  // Middle joint = the centre of the native cast hub that closes the shaft tip.
  hinge: Object.freeze({ x: 0, y: 0, z: 0.716 }),
  // Connected-component classifier. The native shaft tip reaches z=.715 and the
  // hub's front reaches z=.752; .72 keeps the shaft/ferrule on the handle side and
  // the hub + yoke + reservoir on the roller side with margin on both sides.
  splitZ: 0.72,
  shaftMaxZ: 0.71,     // fail-closed: the handle side must still contain the shaft
  yokeMaxZ: 0.9,       // fail-closed: the roller side must still contain the yoke
  // Folded angle about the joint's local X (the drum axle direction). -105° tucks
  // the drum above and back along the handle: the axle centre lands at y=.199,
  // clearing the .175 drum radius plus the .012 shaft radius, and shortens the
  // handle->drum reach from .916 to .686. Calibration, not Nintendo data.
  angle: -1.8326,
  // Fold/unfold time constant (1/s): ~0.10 s to 95%, so a horizontal flick is open
  // well before its 21F release and a rolled drum never leaves the floor half-folded.
  rate: 30,
});

/** Closed connected components of an indexed triangle buffer (mergeGeometries never welds across Pieces). */
function componentSplit(geometry) {
  const index = geometry.index, pos = geometry.attributes.position, count = pos.count;
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const tri = index.count / 3;
  for (let t = 0; t < tri; t++) {
    const a = index.getX(t * 3), b = index.getX(t * 3 + 1), c = index.getX(t * 3 + 2);
    union(a, b); union(b, c);
  }
  const maxZ = new Map();
  const owner = new Int32Array(tri);
  for (let t = 0; t < tri; t++) {
    const root = find(index.getX(t * 3));
    owner[t] = root;
    const z = Math.max(pos.getZ(index.getX(t * 3)), pos.getZ(index.getX(t * 3 + 1)), pos.getZ(index.getX(t * 3 + 2)));
    if (!(maxZ.get(root) >= z)) maxZ.set(root, z);
  }
  return { owner, maxZ };
}

/** Re-index a subset of triangles into a standalone geometry carrying every original attribute. */
function extract(geometry, keep) {
  const src = geometry.attributes, index = geometry.index, tri = index.count / 3;
  const map = new Int32Array(src.position.count).fill(-1);
  const order = [], tris = [];
  for (let t = 0; t < tri; t++) {
    if (!keep(t)) continue;
    tris.push(t);
    for (let k = 0; k < 3; k++) {
      const i = index.getX(t * 3 + k);
      if (map[i] < 0) { map[i] = order.length; order.push(i); }
    }
  }
  if (!tris.length) return null;
  const out = new THREE.BufferGeometry();
  for (const key in src) {
    const a = src[key], data = new a.array.constructor(a.itemSize * order.length);
    for (let i = 0; i < order.length; i++) {
      const from = order[i] * a.itemSize, to = i * a.itemSize;
      for (let c = 0; c < a.itemSize; c++) data[to + c] = a.array[from + c];
    }
    out.setAttribute(key, new THREE.BufferAttribute(data, a.itemSize, a.normalized));
  }
  const built = new Uint32Array(tris.length * 3);
  for (let t = 0; t < tris.length; t++) for (let k = 0; k < 3; k++) built[t * 3 + k] = map[index.getX(tris[t] * 3 + k)];
  out.setIndex(new THREE.BufferAttribute(built, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

function splitAtJoint(geometry, label, requireFrameExtents) {
  if (!geometry) throw new Error(`INKWAVE roller fold: native ${label} geometry is missing; the articulated joint cannot be built`);
  const { owner, maxZ } = componentSplit(geometry);
  const moving = t => maxZ.get(owner[t]) >= ROLLER_FOLD.splitZ;
  const handle = extract(geometry, t => !moving(t));
  const roller = extract(geometry, moving);
  if (!handle || !roller) throw new Error(`INKWAVE roller fold: native ${label} did not separate at the middle joint; review upstream changes`);
  const handleMax = handle.boundingBox.max.z, rollerMax = roller.boundingBox.max.z;
  // The ink overlay is narrower than the body frame and does not reach the shaft end.
  // Validate those structural extents against the body buffer only.
  if (requireFrameExtents) {
    if (handleMax < ROLLER_FOLD.shaftMaxZ) throw new Error(`INKWAVE roller fold: native ${label} handle side lost the shaft (${handleMax})`);
    if (rollerMax < ROLLER_FOLD.yokeMaxZ) throw new Error(`INKWAVE roller fold: native ${label} roller side lost the yoke (${rollerMax})`);
  }
  return { handle, roller };
}

/** BUILD-chain stage: move the roller-side half of the merged native frame into a real `parts` group. */
export function rollerFoldModel(d) {
  if (!d || d.kind !== 'roller' || !d.parts) throw new Error('INKWAVE roller fold: expected the native Roller definition');
  const pivot = new V3(ROLLER_FOLD.hinge.x, ROLLER_FOLD.hinge.y, ROLLER_FOLD.hinge.z);
  const body = splitAtJoint(d.body, 'body', true);
  const ink = splitAtJoint(d.ink, 'ink', false);
  // finishParts() re-centres each part on its pivot, merges every part source back
  // into def.body/def.ink (so the complete-at-rest model and the far LOD are
  // unchanged) and publishes the remainder as the never-moving bodyStatic/inkStatic.
  d.body = body.handle;
  d.ink = ink.handle;
  d.parts.hinge = { src: body.roller, pivot, mat: 'body' };
  d.parts.hingeInk = { src: ink.roller, pivot, mat: 'ink' };
  d.fold = { pivot, move: ['hinge', 'hingeInk', 'led'] };
  return d;
}

/** Character connection: one articulated hinge Group owning the roller-side parts and the drum. */
export function attachRollerFold(d, off, parts, drum) {
  const spec = d && d.fold;
  if (!spec) return null;
  const group = new THREE.Group();
  group.name = 'rollerFold';
  group.position.copy(spec.pivot);
  off.add(group);
  for (const key of spec.move) {
    const g = parts[key];
    if (!g) continue;
    g.position.sub(spec.pivot);      // the group sits at the pivot, children keep their authored offset
    group.add(g);
  }
  if (drum) { drum.position.sub(spec.pivot); group.add(drum); }
  return group;
}

function rollerAttack(ch) {
  const runner = ch?._runner?.() ?? ch?.actor?.weaponRunner;
  const hasRemoteSnapshot = runner?.a?.remote && Object.hasOwn(runner, 's3RollerFoldAttack');
  const flick = hasRemoteSnapshot ? runner.s3RollerFoldAttack
    : ch?.s3RollerFlick ?? runner?.s3RollerAttack ?? (runner?.a?.remote ? runner?.s3RollerFoldAttack : null);
  return flick && typeof flick.vertical === 'boolean' ? flick : null;
}

function foldTarget(ch) {
  const flick = rollerAttack(ch);
  if (flick) return flick.vertical ? 1 : 0;   // folded for the vertical swing, open for the horizontal one
  return (ch.wRoll || 0) >= 0.5 ? 0 : 1;      // open while rolling, folded at rest / carry
}

function resetHinge(w) {
  if (!w?.fold) return;
  w.foldT = 1;
  w.fold.rotation.x = ROLLER_FOLD.angle;
}

function resetCharacterHinges(ch) {
  const weapons = new Set([ch?.weapon, ...Object.values(ch?.weapons || {})]);
  for (const w of weapons) resetHinge(w);
}

function applyFold(ch, dt, w) {
  if (!w || !w.fold || ch.weaponKind !== 'roller') return;
  // The far LOD draws the merged complete-at-rest weapon, so the drum has to sit on
  // its authored offset there instead of the folded one.
  const want = w.near === false ? 0 : foldTarget(ch);
  if (!Number.isFinite(w.foldT)) w.foldT = want;
  else {
    const step = Number.isFinite(dt) && dt > 0 ? 1 - Math.exp(-ROLLER_FOLD.rate * Math.min(0.1, dt)) : 0;
    w.foldT = Math.max(0, Math.min(1, w.foldT + (want - w.foldT) * step));
    if (Math.abs(want - w.foldT) < 1e-4) w.foldT = want;
  }
  // Absolute write every frame: a reset, swap or dispose can never accumulate a transform.
  w.fold.rotation.x = ROLLER_FOLD.angle * w.foldT;
}

const INSTALL = Symbol.for('inkwave.s3.roller-fold.install.v1');
/** Render-layer transform owner. Reads the existing attack state; never writes it. */
export function installRollerFold({ Character }, _profile) {
  const P = Character?.prototype;
  if (typeof P?._animWeapon !== 'function') throw new Error('Roller fold requires the actual public Character');
  if (Object.hasOwn(P, INSTALL)) return;
  Object.defineProperty(P, INSTALL, { value: true });
  const anim = P._animWeapon;
  const setWeapon = P.setWeapon, setVisible = P.setVisible, dispose = P.dispose;
  P._animWeapon = function (dt, s, w) {
    const result = anim.call(this, dt, s, w);
    for (let x = w; x; x = x.left) applyFold(this, dt, x);
    return result;
  };
  if (typeof setWeapon === 'function') P.setWeapon = function (...args) {
    const changed = args[0] !== this.weaponKind;
    if (changed) resetHinge(this.weapon);
    const result = setWeapon.apply(this, args);
    if (changed) resetHinge(this.weapon);
    return result;
  };
  if (typeof setVisible === 'function') P.setVisible = function (visible, ...args) {
    const owner = !visible ? this._owner?.() : null;
    if (owner && !owner.alive) resetCharacterHinges(this);
    return setVisible.call(this, visible, ...args);
  };
  if (typeof dispose === 'function') P.dispose = function (...args) {
    resetCharacterHinges(this);
    return dispose.apply(this, args);
  };
}

/** Read-only view for regressions; the group and its transform stay owned by this module. */
export function rollerFoldSnapshot(ch, w) {
  if (!w || !w.fold) return null;
  return {
    fold: Number.isFinite(w.foldT) ? w.foldT : null,
    angle: w.fold.rotation.x,
    near: w.near !== false,
    vertical: rollerAttack(ch)?.vertical ?? null,
    rolling: (ch?.wRoll || 0) >= 0.5,
    drumParent: w.drum && w.drum.parent === w.fold ? 'fold' : (w.drum?.parent?.name || null),
  };
}
