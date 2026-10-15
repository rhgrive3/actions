// Presentation for the thirteen all-specials actions (special-models.mjs):
// the device each kid carries or rides while the special is active, the
// models of their deployed objects and of their projectiles.
//
// Observer only: it never steps gameplay, changes a timer, authors a hit,
// paint or network row. The all-specials runtime keeps its own primitive
// meshes (it moves and scales them); this layer hides them and draws the
// model at the same place. Character visibility changes (main weapon hidden
// while a device is held, kid hidden inside the Crab Tank ball / as the
// Kraken) are re-applied after every native Character.update, which itself
// re-derives the kid's visibility each frame.

import { buildSubModel, poseSubModel, isSharedGeometry } from './sub-models.mjs';
import { buildScreenSheet, INKSTRIKE_LID_OPEN, CRAB_TANK_GRIPS } from './special-models.mjs';

const INSTALL = Symbol.for('inkwave.s3.special-models.install.v1');
const OBJECTS = Symbol('inkwave.s3.special-models.objects'), ROUNDS = Symbol('inkwave.s3.special-models.rounds');
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeIn = x => { x = clamp01(x); return x * x * x; };
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const easeOutBack = x => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const kick = (age, rate = 18) => (age >= 0 && age < 2 ? Math.exp(-age * rate) : 0);   // 1 at the event, decaying

// Device motion keyed to the special's real events (local state or replayed
// presentation marks, actor._s3SpecialMarks). INKWAVE calibration against the
// Splatoon 3 footage cited in reference/special-vfx.md; not Nintendo curves.
export const SPECIAL_DEVICE_MOTION = Object.freeze({
  stamp: { rest: 0, raised: -1.35, strike: 1.2, windup: 6 / 60, hold: 4 / 60, recover: 0.2, throwBack: -1.9 },
  speakers: { deploy: 0.38, recoil: 0.07 },
  kraken: { emerge: 0.55, charge: 35 / 60 },
  status: 'presentation calibration (INKWAVE); original joint/device curves are not public',
});

// Device per special while it is active, and where it is attached.
//  host: 'kid' (kid space, feet at origin, +Z forward), 'chest' (chest bone),
//  'model' (the character model root, kid and squid both hidden).
export const SPECIAL_DEVICES = Object.freeze({
  // Grip under the small crate (S2 promo render); pos keeps the right hand where
  // it was before the grip moved there; the left hand steadies the small crate.
  tentaMissiles: [{ model: 'spTentaLauncher', host: 'kid', pos: [-0.31, 1.27, -0.07], rot: [-0.55, 0, 0.12], scale: 0.9, hideWeapon: true, hands: { R: [0.065, -0.34, 0.07], L: [0.16, -0.15, 0.15] } }],
  inkjet: [{ model: 'spInkjetPack', host: 'chest', pos: [0, -0.02, -0.21], rot: [0, 0, 0], scale: 0.62 },
    { model: 'spInkjetCannon', host: 'kid', pos: [-0.12, 0.98, 0.32], rot: [0, 0, 0], scale: 0.9, aim: true, hideWeapon: true, hands: { R: [0, -0.11, 0.02], L: [0, -0.085, 0.25] } }],
  booyahBomb: [{ model: 'spBooyahBall', host: 'kid', pos: [0, 1.95, 0.05], rot: [0, 0, 0], scale: 1, charge: true, hideWeapon: true, hands: { R: [0.12, -0.33, 0.02], L: [-0.12, -0.33, 0.02] } }],
  // Held by the handle end at the hands, head up in front (S3 screenshot);
  // the swing pivots about the grip.
  ultraStamp: [{ model: 'spUltraStamp', host: 'kid', pos: [0, 0.88, 0.33], rot: [2.88, 0, 0], scale: 0.85, swing: true, grip: [0, -0.66, -1.15], hideWeapon: true, hands: { R: [0, 0.63, 1.085], L: [0, 0.48, 0.77] } }],
  killerWail: [{ model: 'spKillerSpeaker', host: 'kid', speakers: true, scale: 1, hideWeapon: true }],
  // The tank stands on the ground round the standing kid (no riding pose):
  // the cockpit rim is between the kid's waist and chest, the hands take
  // the handlebars (CRAB_TANK_GRIPS).
  crabTank: [{ model: 'spCrabTank', host: 'kid', pos: [0, 0, -0.05], rot: [0, 0, 0], scale: 0.9, hideWeapon: true, crab: true, hands: CRAB_TANK_GRIPS }],
  reefslider: [{ model: 'spReefShark', host: 'kid', pos: [0, -0.1, 0.12], rot: [0, 0, 0], scale: 1, hideWeapon: true, hands: { R: [-0.215, 0.54, 0.18], L: [0.215, 0.54, 0.18] } }],
  // Worn on the back with the lid shut, tray down and lid outward (S3 promo
  // image); the free hand throws the markers.
  tripleInkstrike: [{ model: 'spInkstrikeCase', host: 'chest', pos: [0, 0.05, -0.15], rot: [-Math.PI / 2, Math.PI, 0], scale: 0.85, hideWeapon: true, lidClosed: true }],
  // Held in front in both hands by the yoke arms, the globe tipped forward on
  // its pivots (the S3 Promotional 3D Render shows it turned in the yoke).
  superChump: [{ model: 'spChumpLauncher', host: 'kid', pos: [0.1, 0.66, 0.34], rot: [0.2, 0, 0], scale: 0.78, tilt: 0.45, hideWeapon: true, hands: { R: [-0.13, 0.21, 0.03], L: [0.13, 0.21, 0.03] } }],
  krakenRoyale: [{ model: 'spKraken', host: 'model', pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, hideKid: true }],
  splattercolorScreen: [{ model: 'spScreenJar', host: 'kid', pos: [0.15, 0.85, 0.3], rot: [0, 0, 0], scale: 0.9, hideWeapon: true, hands: { R: [-0.1, 0.1, 0.02], L: [0.15, 0.12, 0] } }],
  waveBreaker: [{ model: 'spWaveBreaker', host: 'kid', pos: [0.2, 0.62, 0.32], rot: [0.25, 0, 0], scale: 0.55, hideWeapon: true, hands: { R: [0.13, 0.3, 0], L: [-0.2, 0.62, 0] } }],
  zipcaster: [{ inkCoat: true, line: true }],
});
// Projectile models. hideBlob: the model replaces the native round's drawn ink blob (S3 175.9-179.9s: Tenta
// Missiles fly as missiles with smoke, not as ink drops; the thrown Ultra Stamp is the stamp itself). The round's
// flight, hits and paint are untouched; only its draw radius (p.vis, read by Projectiles._draw alone) is shrunk.
export const SPECIAL_PROJECTILE_MODELS = Object.freeze({
  tentaMissiles: { model: 'spTentaMissile', scale: 1.4, along: true, hideBlob: true },
  booyahBomb: { model: 'spBooyahBall', scale: 1.25, along: false, spin: true },
  ultraStamp: { model: 'spUltraStamp', scale: 0.85, along: true, tumble: true, hideBlob: true },
});
// Six speakers in a hexagon round the kid (S3 promo screenshot 02).
const SPEAKER_RING = [[-0.55, 1.95], [0.55, 1.95], [-1.0, 1.35], [1.0, 1.35], [-0.55, 0.75], [0.55, 0.75]];

function disposeModel(group) {
  group?.removeFromParent?.();
  group?.traverse?.(o => {
    if (o.geometry && !isSharedGeometry(o.geometry)) o.geometry.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (!m || m.userData?.s3SharedInk) continue; m.map?.dispose?.(); m.dispose?.(); }
  });
}

// Ultra Stamp: hold → wind up overhead → slam to the source swing frame → recover for the next
// (local: the next swing time is known; remote: the replayed swing mark drives the follow-through).
function stampArc(a, s, state, t) {
  const M = SPECIAL_DEVICE_MOTION.stamp, marks = a._s3SpecialMarks || {};
  const last = Math.max(marks.swing ?? -99, marks.jumpSwing ?? -99), since = t - last;
  const holding = state ? !!state.stampHolding : since < 0.5;
  if (state?.phase === 'aimThrow') { s.stampArc = (s.stampArc ?? 0) + (M.throwBack - (s.stampArc ?? 0)) * 0.25; return s.stampArc; }
  let arc;
  if (since >= 0 && since < M.hold) arc = M.strike;
  else if (since >= M.hold && since < M.hold + M.recover) arc = M.strike + (holding ? M.raised - M.strike : M.rest - M.strike) * smooth((since - M.hold) / M.recover);
  else arc = holding ? M.raised : M.rest;
  if (state && holding && Number.isFinite(state.nextSwing) && Number.isFinite(state.t)) {
    const toNext = state.nextSwing - state.t;                              // anticipate the authoritative swing frame
    if (toNext >= 0 && toNext < M.windup) arc = M.strike + (M.raised - M.strike) * (1 - easeIn(1 - toNext / M.windup));
  }
  s.stampArc = arc;
  return arc;
}
// Model-space vertex sample of the Kraken (rest pose), cached on the model, for floor contact.
function krakenPoints(m) {
  if (m.userData?.krakenPts) return m.userData.krakenPts;
  const root = m.root, out = [];
  root.updateWorldMatrix(true, true);
  const inv = root.matrixWorld.clone().invert(), M = root.matrixWorld.clone(), v = root.position.clone();
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position; if (!pos) return;
    M.multiplyMatrices(inv, o.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 600));
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(M); out.push(v.x, v.y, v.z); }
  });
  // points are in the root's own (unscaled model) frame: the per-frame squash is applied by the caller
  (m.userData ||= {}).krakenPts = new Float32Array(out);
  return m.userData.krakenPts;
}

function animateDevice(a, s, d, spec, state, t, dt) {
  const marks = a._s3SpecialMarks || {}, age = t - s.startedAt, g = d.model.groups || {};
  const id = s.id, base = d.basePos ||= d.holder.position.clone();
  if (id === 'tentaMissiles') {
    // a kick per missile leaving the crate, the launcher tipping up while the salvo goes
    const idx = state?.missileIndex ?? -1;
    if (idx !== s.launched) { if (idx > s.launched && s.launched >= 0) s.launchAt = t; s.launched = idx; }
    const k = kick(t - s.launchAt, 20), salvo = state?.phase === 'launching' ? 1 : 0;
    s.salvo = (s.salvo ?? 0) + (salvo - (s.salvo ?? 0)) * Math.min(1, dt * 10);
    d.holder.position.set(base.x, base.y + 0.05 * s.salvo, base.z - 0.07 * k);
    d.holder.rotation.x = spec.rot[0] - 0.25 * s.salvo + 0.08 * k;
  } else if (id === 'inkjet') {
    if (g.flame) { const f = 0.85 + 0.15 * Math.sin(t * 53) + 0.1 * Math.sin(t * 31); g.flame.scale.set(f, 0.8 + 0.4 * f, f); }
    if (spec.aim) { const k = kick(t - (marks.shot ?? -99), 14); d.holder.position.set(base.x, base.y + 0.02 * k, base.z - 0.12 * k); d.holder.rotation.x = -(a.aimPitch || 0) - 0.25 * k; }
  } else if (id === 'booyahBomb') {
    const c = clamp01(state?.charge || 0), pulse = 1 + 0.035 * Math.sin(t * (8 + 16 * c));
    d.holder.scale.multiplyScalar(pulse);
    d.holder.position.set(base.x, base.y + 0.25 * c + 0.03 * Math.sin(t * 5), base.z);
    d.holder.rotation.y += dt * (0.6 + 2.5 * c);
  } else if (id === 'crabTank') {
    const shot = kick(t - (marks.shot ?? -99), 26), cannon = kick(t - (marks.cannon ?? -99), 9);
    const left = Math.floor((marks.shot ?? 0) * 60) % 2;                    // the claws fire alternately
    if (g.clawL) g.clawL.position.z = (g.clawL.userData.rest?.z ?? 0) - 0.06 * shot * left;
    if (g.clawR) g.clawR.position.z = (g.clawR.userData.rest?.z ?? 0) - 0.06 * shot * (1 - left);
    d.holder.position.set(base.x, base.y + 0.03 * Math.abs(Math.sin(t * 9)) * Math.min(1, Math.hypot(a.vel?.x || 0, a.vel?.z || 0) / 3), base.z - 0.16 * cannon);
    d.holder.rotation.x = spec.rot[0] - 0.12 * cannon;
  } else if (id === 'reefslider') {
    // the shark surfaces out of the ink, then bucks and rolls with the ride; brakes shudder before the burst
    const phase = state?.phase ?? a.specialActive?.phase, up = easeOutBack(age / 0.35);
    const ride = phase === 'dash' ? 1 : 0, brake = phase === 'brake' ? 1 : 0;
    d.holder.position.set(base.x + (brake ? 0.02 * Math.sin(t * 70) : 0), base.y - 0.35 * (1 - clamp01(up)) + 0.04 * Math.sin(t * 11) * ride, base.z);
    d.holder.rotation.set(spec.rot[0] - 0.12 * ride * (0.5 + 0.5 * Math.sin(t * 6)), spec.rot[1], spec.rot[2] + 0.07 * Math.sin(t * 5) * (ride + brake));
    d.holder.scale.setScalar(spec.scale * (0.7 + 0.3 * clamp01(up)) * (1 + 0.04 * brake * Math.sin(t * 40)));
  } else if (id === 'tripleInkstrike') {
    if (g.lid) { const open = smooth((t - (marks.marker ?? -99) + 0.25) / 0.12) * (1 - smooth((t - (marks.marker ?? -99) - 0.25) / 0.2));
      const throwing = state && Number.isFinite(state.throwAt) ? 1 : 0; s.lid = (s.lid ?? 0) + (Math.max(open, throwing) - (s.lid ?? 0)) * Math.min(1, dt * 14);
      g.lid.rotation.x = INKSTRIKE_LID_OPEN * (1 - s.lid); }
  } else if (id === 'superChump') {
    const k = kick(t - (marks.balloon ?? -99), 7);
    if (g.globe) { s.spin = (s.spin ?? 0) + dt * (1.2 + 22 * k); g.globe.rotation.set(spec.tilt || 0, s.spin, 0); }
    d.holder.position.set(base.x, base.y, base.z - 0.1 * k);
    d.holder.rotation.x = spec.rot[0] - 0.35 * k;
  } else if (id === 'krakenRoyale') {
    // S3 footage (83.0–94.9s): Kraken Royale is not upright. The giant squid lies along the floor, mantle
    // and fins leading, eyes on top, the two arms trailing, and swims with its arms; it crouches while
    // charging, stretches along the dash and noses up on a jump. The model is authored upright (mantle +Y,
    // face +Z), so the holder lays it down: Rx(-90°) turns the mantle backward with the face up, Ry(180°)
    // turns it to lead. In model space afterwards: x = side, y = length (mantle forward), z = up.
    const M = SPECIAL_DEVICE_MOTION.kraken, speed = Math.hypot(a.vel?.x || 0, a.vel?.z || 0), vy = a.vel?.y || 0, air = a.grounded === false;
    const phase = state?.phase ?? a.specialActive?.phase ?? remoteKrakenPhase(a);
    const emerge = easeOutBack(age / M.emerge), e = Math.max(0.01, emerge);
    let sx = 1, len = 1, up = 1;
    if (phase === 'charge') { const k = smooth((state?.chargeT || 0) / M.charge); len = 1 - 0.18 * k; sx = 1 + 0.12 * k; up = 1 + 0.1 * k + 0.02 * Math.sin(t * 40) * k; }
    else if (phase === 'dash') { len = 1.28; sx = 0.88; up = 0.86; }
    else if (phase === 'finish') { const k = smooth((age - (state?.duration ?? age)) / 0.8); sx = up = 1 - 0.55 * k; len = 1 - 0.6 * k; }
    else { const b = Math.sin(t * (5 + speed * 0.8)) * 0.04; up += b; len -= b * 0.5; }
    const land = kick(t - (marks.jump ?? -99), 10); up -= 0.28 * land; sx += 0.16 * land; len += 0.1 * land;
    s.krakenPitch = (s.krakenPitch ?? 0) + (clamp01((vy + 6) / 14) * 0.8 - 0.25 - (s.krakenPitch ?? 0)) * Math.min(1, dt * 10) * (air ? 1 : 0)
      + (air ? 0 : -(s.krakenPitch ?? 0) * Math.min(1, dt * 12));
    const roll = Math.sin(t * 3.1) * 0.05 + (phase === 'dash' ? Math.sin(t * 22) * 0.06 : 0);
    const rx = -Math.PI / 2 + (s.krakenPitch || 0);
    d.holder.rotation.set(rx, Math.PI, roll, 'YXZ');
    d.holder.scale.setScalar(spec.scale * e);
    d.model.root.scale.set(sx, len, up);
    // Rest the belly on the floor: the lowest model point under this frame's rotation and squash sits at the
    // host origin (the actor's feet). A fixed lift left the Kraken hovering about 0.2 above the ground.
    const pts = krakenPoints(d.model), cx = Math.cos(rx), ry0 = cx * Math.sin(roll), ry1 = cx * Math.cos(roll), ry2 = -Math.sin(rx);
    let minY = Infinity;
    for (let i = 0; i < pts.length; i += 3) { const y = ry0 * sx * pts[i] + ry1 * len * pts[i + 1] + ry2 * up * pts[i + 2]; if (y < minY) minY = y; }
    const lift = Number.isFinite(minY) ? -minY * spec.scale * e : 0.25 * up * e;
    d.holder.position.set(0, lift + 0.025 * Math.abs(Math.sin(t * (5 + speed * 0.8))) * (air ? 0 : 1), -1.15 * len * e);
    // the two arms sweep like a swimming squid; faster with speed, trailing flat on the dash
    const sweep = phase === 'dash' ? 0.12 : 0.35 + Math.min(0.35, speed * 0.05), freq = 6 + speed * 1.4;
    if (g.legL) g.legL.rotation.x = Math.sin(t * freq) * sweep - (phase === 'dash' ? 0.25 : 0);
    if (g.legR) g.legR.rotation.x = Math.sin(t * freq + Math.PI) * sweep - (phase === 'dash' ? 0.25 : 0);
  } else if (id === 'waveBreaker' || id === 'splattercolorScreen') {
    // raised ready to throw while the sub is held
    const ready = a.intent?.sub ? 1 : 0; s.ready = (s.ready ?? 0) + (ready - (s.ready ?? 0)) * Math.min(1, dt * 12);
    d.holder.position.set(base.x, base.y + 0.35 * s.ready, base.z - 0.15 * s.ready);
    d.holder.rotation.x = spec.rot[0] - 0.6 * s.ready;
  }
}

// The network carries a remote Kraken's special flag but not its charge/dash phase. The dash is unmistakable
// in the replicated velocity (21 m/s against 5.5 walking, 1.9 charging), so a remote Kraken over 12 m/s is drawn
// dashing; its charge cannot be told from standing still and is not drawn.
export function remoteKrakenPhase(a) {
  if (!a?.remote || a.specialActive?.id !== 'krakenRoyale') return null;
  return Math.hypot(a.vel?.x || 0, a.vel?.z || 0) > 12 ? 'dash' : null;
}

export function installSpecialModels(api) {
  const { THREE, G, Character, Projectiles } = api;
  if (!THREE || !Projectiles?.prototype?.update) return api;
  if (Projectiles.prototype[INSTALL]) return api;
  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true });
  const colorOf = (owner, team) => owner?.color || G.teamColors?.[owner?.team ?? team] || 0xffcc33;
  const inkMat = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, roughness: 0.42, metalness: 0.1 });
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, 1), grip = new THREE.Vector3(), pole = new THREE.Vector3();
  const leanQ = new THREE.Quaternion(), leanAxis = new THREE.Vector3(1, 0, 0), pivotA = new THREE.Vector3(), pivotB = new THREE.Vector3(), keep = new THREE.Matrix4(), inv = new THREE.Matrix4();

  // ---- deployed objects and projectiles --------------------------------------
  function objectModel(o) {
    const color = colorOf(o.owner, o.team), group = new THREE.Group();
    group.userData.s3SpecialObject = o.kind;
    const add = (id) => { const m = buildSubModel(THREE, id, inkMat(color)); if (m) group.add(m.root); return m; };
    const pres = { group, kind: o.kind, models: {} };
    if (o.kind === 'decoy') pres.models.main = add('spChumpDecoy');
    else if (o.kind === 'marker' || o.kind === 'strike') { pres.models.main = add('spInkstrikeBeacon'); pres.models.tornado = add('spInkstrikeTornado'); }
    else if (o.kind === 'wave') { pres.models.main = add('spWaveBreaker'); pres.rings = []; }
    else if (o.kind === 'screen') {
      pres.sheet = buildScreenSheet(THREE, color, o.width || 15, o.height || 9); group.add(pres.sheet);
      // S3 footage: the curtain rises out of the thrown jar, which stays at its foot.
      pres.models.jar = add('spScreenJar');
      if (pres.models.jar) pres.models.jar.root.scale.setScalar(1.1);
    }
    else return null;
    (G.scene || null)?.add?.(group);
    return pres;
  }
  function poseObject(o, pres, dt) {
    const g = pres.group, m = pres.models;
    if (o.mesh) o.mesh.visible = false;
    if (o.kind === 'screen') {
      // Unfurl over the 60F startup and fold back down over the 60F close (presentation of the
      // source StartFrame/EndFrame; the moving plane and its hits are unchanged).
      const H = o.height || 9, dur = o.dur || 680 / 60;
      const rise = clamp01(o.age / 1), fold = clamp01((o.age - (dur - 1)) / 1);
      const k = (1 - Math.pow(1 - rise, 3)) * (1 - fold * fold), wob = 1 + 0.04 * Math.sin(o.age * 9) * (1 - rise);
      g.position.copy(o.pos);
      g.rotation.set(0, Math.atan2(o.normal.x, o.normal.z), 0);
      pres.sheet.scale.set(0.35 + 0.65 * k * wob, Math.max(0.001, k), 1);
      pres.sheet.position.y = H / 2 * Math.max(0.001, k);
      pres.sheet.visible = k > 0.002;
      const mat = pres.sheet.userData.s3ScreenSheet;
      mat.mat.opacity = 0.8 + 0.06 * Math.sin(o.age * 7);
      if (mat.mat.uniforms?.uTime) mat.mat.uniforms.uTime.value = o.age;
      mat.tex.offset.x += dt * 0.02; mat.tex.offset.y += dt * 0.01;
      if (m.jar) { m.jar.root.rotation.y = o.age * 2.4; m.jar.root.position.y = 0.05 + 0.1 * Math.abs(Math.sin(o.age * 6)) * (1 - rise); poseSubModel(m.jar, { dt }); }
      return;
    }
    g.position.copy(o.pos);
    if (o.kind === 'decoy') { g.rotation.set(0, (o.index || 0) * 0.8, 0); if (o.phase === 'flight') g.position.y -= 0.6; poseSubModel(m.main, { dt }); return; }
    if (o.kind === 'marker' || o.kind === 'strike') {
      const strike = o.kind === 'strike';
      if (strike) g.position.copy(o.target || o.pos);
      m.main.root.rotation.y += dt * (strike ? 0 : 9);
      m.tornado.root.visible = strike;
      if (strike) {
        const r = Math.max(0.3, (o.currentRadius || 0.5) * 0.42);
        m.tornado.root.scale.set(r, 7, r);
        m.tornado.root.rotation.y += dt * 5;
      }
      return;
    }
    if (o.kind === 'wave') {
      g.rotation.set(0, 0, 0);
      const color = colorOf(o.owner, o.team);
      for (const [i, w] of (o.waves || []).entries()) {
        if (!pres.rings[i]) { const r = buildSubModel(THREE, 'spWaveRing', inkMat(color)); pres.rings[i] = r; g.add(r.root); }
        const age = Math.max(0, o.age - w.started), r = w.radius * clamp01(age / (o.maxWaveFrame || 3)), ring = pres.rings[i];
        ring.root.visible = r > 0.05 && age <= (o.maxWaveFrame || 3) + 0.25;
        ring.root.scale.set(Math.max(0.05, r), 1, Math.max(0.05, r));
      }
    }
  }
  function syncWorld(system, dt) {
    const live = system._s3AllSpecialObjects || [];
    const shown = system[OBJECTS] ||= new Map();
    for (const o of live) {
      if (!o || o.dead) continue;
      let pres = shown.get(o);
      if (!pres) { pres = objectModel(o); if (!pres) continue; shown.set(o, pres); }
      poseObject(o, pres, dt);
    }
    for (const [o, pres] of shown) if (o.dead || !live.includes(o)) { disposeModel(pres.group); shown.delete(o); }
    // Projectiles (pooled records: key on identity + activation seed).
    const rounds = system[ROUNDS] ||= new Map(), list = system.list || [];
    const seen = new Set();
    for (const p of list) {
      const spec = SPECIAL_PROJECTILE_MODELS[p?.wid];
      if (!spec || !p.pos) continue;
      let r = rounds.get(p);
      const tag = `${p.wid}:${p.s3AllSpecialSeed ?? p.seed}`;
      if (r && r.tag !== tag) { disposeModel(r.group); rounds.delete(p); r = null; }
      if (!r) {
        const m = buildSubModel(THREE, spec.model, inkMat(colorOf(p.owner, p.team)));
        if (!m) continue;
        r = { group: new THREE.Group(), model: m, tag, spin: 0 };
        r.group.userData.s3SpecialRound = p.wid;
        m.root.scale.setScalar(spec.scale);
        r.group.add(m.root); G.scene?.add?.(r.group); rounds.set(p, r);
      }
      seen.add(p);
      if (spec.hideBlob) { p.vis = 1e-4; p.sats = 0; }
      r.group.position.copy(p.pos);
      if (spec.along && p.vel?.lengthSq?.() > 1e-6) { v.copy(p.vel).normalize(); r.group.quaternion.setFromUnitVectors(fwd, v); }
      if (spec.tumble) { r.spin += dt * 9; r.model.root.rotation.x = r.spin; }
      if (spec.spin && r.model.groups.ribbons) r.model.groups.ribbons.rotation.y += dt * 6;
    }
    for (const [p, r] of rounds) if (!seen.has(p)) { disposeModel(r.group); rounds.delete(p); }
  }
  const update = Projectiles.prototype.update;
  Projectiles.prototype.update = function (dt, ...args) {
    const out = update.call(this, dt, ...args);
    if (dt > 0) syncWorld(this, dt);
    return out;
  };
  const clear = Projectiles.prototype.clear;
  if (clear) Projectiles.prototype.clear = function (...args) {
    for (const map of [this[OBJECTS], this[ROUNDS]]) if (map) { for (const r of map.values()) disposeModel(r.group); map.clear(); }
    return clear.apply(this, args);
  };

  // ---- devices on the kid ----------------------------------------------------
  if (!Character?.prototype?.update) return api;
  const states = new WeakMap();
  function retire(ch) {
    const s = states.get(ch);
    if (!s) return;
    for (const d of s.devices) disposeModel(d.holder);
    disposeModel(s.coatGroup); disposeModel(s.line); disposeModel(s.ball?.root?.parent);
    if (s.weapon) { s.weapon.pivot.visible = s.weaponVisible; if (s.weapon.left) s.weapon.left.pivot.visible = s.leftVisible; }
    states.delete(ch);
  }
  function hostOf(ch, host) {
    if (host === 'chest') return ch.bones?.chest || ch.kid;
    if (host === 'model') return ch.model || ch.kid?.parent;
    return ch.kid;
  }
  function begin(ch, id) {
    retire(ch);
    const s = { id, devices: [], weapon: null, swing: -1, swingAt: -1, startedAt: G.time || 0, launched: -1, launchAt: -99, shotAt: -99, shots: -1 };
    const color = ch.color || colorOf(ch.actor);
    for (const spec of SPECIAL_DEVICES[id] || []) {
      if (spec.inkCoat) { s.coat = true; continue; }
      if (spec.speakers) {
        for (const [x, y] of SPEAKER_RING) {
          const m = buildSubModel(THREE, spec.model, inkMat(color)), holder = new THREE.Group();
          holder.add(m.root); holder.position.set(x, y, -0.35); hostOf(ch, 'kid')?.add(holder);
          s.devices.push({ spec, holder, model: m, base: [x, y] });
        }
        continue;
      }
      const m = buildSubModel(THREE, spec.model, inkMat(color));
      if (!m) continue;
      const holder = new THREE.Group();
      holder.add(m.root); holder.position.set(...spec.pos); holder.rotation.set(...spec.rot); holder.scale.setScalar(spec.scale);
      if (spec.grip) m.root.position.set(...spec.grip);
      if (spec.lidClosed && m.groups.lid) m.groups.lid.rotation.x = INKSTRIKE_LID_OPEN;
      if (spec.tilt && m.groups.globe) m.groups.globe.rotation.x = spec.tilt;
      hostOf(ch, spec.host)?.add(holder);
      s.devices.push({ spec, holder, model: m });
    }
    states.set(ch, s);
    return s;
  }
  function inkCoat(ch, s, on) {
    // Zipcaster: the kid turns glossy team ink (S3 character turntable strip).
    // Skinned twins of the visible body meshes share the skeleton.
    if (!s.coatGroup && on) {
      s.coatGroup = new THREE.Group(); s.coatGroup.name = 'zipcaster-ink-coat';
      s.coatMat = new THREE.MeshStandardMaterial({ color: ch.color || colorOf(ch.actor), roughness: 0.08, metalness: 0.1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      s.coatPairs = [];
      ch.kid.traverse(o => {
        if (!o.isSkinnedMesh || !/^kid:/.test(o.name || '') || /eye|iris|pupil|tooth|mouth|brow/i.test(o.name)) return;
        const twin = new THREE.SkinnedMesh(o.geometry, s.coatMat);
        twin.bind(o.skeleton, o.bindMatrix); twin.frustumCulled = false; twin.renderOrder = (o.renderOrder || 0) + 1;
        s.coatGroup.add(twin); s.coatPairs.push([o, twin]);
      });
      ch.kid.add(s.coatGroup);
    }
    if (s.coatGroup) { s.coatGroup.visible = on; for (const [o, t] of s.coatPairs) t.visible = on && o.visible; }
  }
  function zipLine(ch, s, state, on) {
    if (!s.line && on) {
      s.line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1, 8, 1, true).translate(0, 0.5, 0),
        new THREE.MeshStandardMaterial({ color: ch.color || colorOf(ch.actor), roughness: 0.15 }));
      G.scene?.add?.(s.line);
    }
    if (!s.line) return;
    s.line.visible = on;
    if (!on) return;
    const hand = ch.bones?.handR, from = v; (hand ? hand.getWorldPosition(from) : from.copy(ch.actor.pos).setY(ch.actor.pos.y + 1));
    const to = state.zipTarget, d = to.clone().sub(from), len = d.length();
    s.line.position.copy(from); s.line.scale.set(1, Math.max(0.01, len), 1);
    if (len > 1e-6) s.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len));
  }
  function pose(ch, s, dt) {
    const a = ch.actor, state = a._s3AllSpecialState?.id === s.id ? a._s3AllSpecialState : null, t = G.time || 0;
    let hideWeapon = false, hideKid = false;
    for (const d of s.devices) {
      const spec = d.spec;
      if (spec.hideWeapon) hideWeapon = true;
      if (spec.hideKid) hideKid = true;
      poseSubModel(d.model, { dt, speed: Math.hypot(a.vel?.x || 0, a.vel?.z || 0) });
      if (spec.aim) d.holder.rotation.x = -(a.aimPitch || 0);
      if (spec.charge) {
        const c = clamp01(state?.charge || 0);
        d.holder.scale.setScalar(spec.scale * (0.55 + 0.75 * c));
        if (d.model.groups.ribbons) d.model.groups.ribbons.rotation.y += dt * (4 + 6 * c);
      }
      if (spec.swing) d.holder.rotation.x = spec.rot[0] + stampArc(a, s, state, t);
      if (spec.speakers) {
        // Deploy: the six speakers fly out of the kid's back and pop to size, then bob;
        // each laser tick kicks the cone back (S3 footage, Killer Wail 5.1 activation).
        const M = SPECIAL_DEVICE_MOTION.speakers, age = t - s.startedAt, k = easeOutBack(age / M.deploy), i = s.devices.indexOf(d);
        const laserAge = t - (a._s3SpecialMarks?.laser ?? -99), firing = a.specialActive?.phase === 'laser' || laserAge < 0.2;
        const recoil = kick(laserAge - (i % 3) * 0.012, 22) * M.recoil;
        d.holder.position.set(d.base[0] * k, 1.1 + (d.base[1] - 1.1) * k + Math.sin(t * 3 + d.base[0] * 2) * 0.05 * k, -0.35 - 0.25 * (1 - k) - recoil);
        d.holder.scale.setScalar(spec.scale * (0.15 + 0.85 * clamp01(k)) * (1 + recoil * 1.2));
        d.holder.rotation.set(-(a.aimPitch || 0) + recoil * 2, (1 - clamp01(k)) * (d.base[0] > 0 ? 1.2 : -1.2), 0);
        const m = d.model.materials?.get('ink'); if (m?.emissiveIntensity != null) m.emissiveIntensity = firing ? 0.5 + 0.4 * Math.sin(t * 30) : 0.08 + 0.5 * kick(age, 4);
      }
      animateDevice(a, s, d, spec, state, t, dt);
      if (spec.crab) {
        const ball = a.specialActive?.pose === 'ball' || state?.ballMode;
        d.holder.visible = !ball;
        if (ball) {
          hideKid = true;
          if (!s.ball) { s.ball = buildSubModel(THREE, 'spCrabBall', inkMat(ch.color || colorOf(a))); const g = new THREE.Group(); g.add(s.ball.root); G.scene?.add?.(g); }
          const g = s.ball.root.parent; g.visible = true; g.position.copy(a.pos); g.position.y += 0.78;
          s.ballRoll = (s.ballRoll || 0) + dt * Math.hypot(a.vel?.x || 0, a.vel?.z || 0) / 0.75;
          g.rotation.set(s.ballRoll, a.yaw || 0, 0, 'YXZ');
          if (state?.ballMesh) state.ballMesh.visible = false;
        } else if (s.ball) s.ball.root.parent.visible = false;
      }
    }
    // Reefslider rider (S3 footage 102.8s): crouched forward over the shark, not sitting upright. Character.update
    // rebuilds the kid transform every frame about the hips, so the lean is re-applied after it; the shark (a kid
    // child) is counter-transformed to keep its own world pose, then the hands reach the handles below.
    if (s.id === 'reefslider' && ch.kid && ch.kid.visible !== false) {
      const phase = state?.phase ?? a.specialActive?.phase, age = t - s.startedAt;
      const target = phase === 'dash' ? 0.72 : phase === 'brake' ? 0.55 : phase === 'recovery' ? 0.2 : 0.35 * smooth(age / 0.3);
      s.lean = (s.lean ?? 0) + (target - (s.lean ?? 0)) * Math.min(1, dt * 9);
      const holders = s.devices.map(d => { d.holder.updateWorldMatrix(true, false); return [d.holder, d.holder.matrixWorld.clone()]; });
      pivotA.set(0, 0.62, 0).applyQuaternion(ch.kid.quaternion);
      leanQ.setFromAxisAngle(leanAxis, s.lean); ch.kid.quaternion.multiply(leanQ);
      pivotB.set(0, 0.62, 0).applyQuaternion(ch.kid.quaternion);
      ch.kid.position.add(pivotA).sub(pivotB); ch.kid.position.y -= 0.16 * s.lean;
      ch.kid.updateMatrixWorld(true);
      for (const [h, world] of holders) {
        inv.copy(h.parent.matrixWorld).invert(); keep.multiplyMatrices(inv, world);
        keep.decompose(h.position, h.quaternion, h.scale); h.updateMatrixWorld(true);
      }
    }
    // Hands on the device: the native two-bone arm solver reaches each grip
    // (kid space), so a held device is carried, not floating.
    if (ch.limbs && ch._solveLimb && ch.kid?.visible !== false) for (const d of s.devices) {
      const hands = d.spec.hands;
      if (!hands || !d.holder.visible) continue;
      d.holder.updateWorldMatrix(true, true);
      for (const side of ['R', 'L']) {
        if (!hands[side]) continue;
        grip.set(...hands[side]); d.model.root.localToWorld(grip); ch.kid.worldToLocal(grip);
        pole.set(side === 'L' ? 0.8 : -0.8, -0.5, -0.22);
        ch._solveLimb(side === 'L' ? ch.limbs.armL : ch.limbs.armR, grip, pole, null, 1, side === 'L' ? 0 : 1);
      }
    }
    if (s.coat) { inkCoat(ch, s, true); zipLine(ch, s, state || {}, state?.phase === 'zip' && !!state.zipTarget); }
    if (hideWeapon && ch.weapon?.pivot) {
      if (!s.weapon) { s.weapon = ch.weapon; s.weaponVisible = ch.weapon.pivot.visible; s.leftVisible = ch.weapon.left?.pivot.visible; }
      ch.weapon.pivot.visible = false; if (ch.weapon.left) ch.weapon.left.pivot.visible = false;
    }
    if (hideKid) { if (ch.kid) ch.kid.visible = false; if (ch.squidRoot) ch.squidRoot.visible = false; }
  }
  const cp = Character.prototype, chUpdate = cp.update, dispose = cp.dispose;
  cp.update = function (dt, ...args) {
    const out = chUpdate.call(this, dt, ...args), a = this.actor;
    const id = a?.alive && !a.superJumpState ? a.specialActive?.id : null;
    let s = states.get(this);
    if (!id || !SPECIAL_DEVICES[id]) { if (s) retire(this); return out; }
    if (!s || s.id !== id) s = begin(this, id);
    pose(this, s, Number.isFinite(dt) ? dt : 0);
    return out;
  };
  if (dispose) cp.dispose = function (...args) { retire(this); return dispose.apply(this, args); };
  // Read-only view of the live device holders, for presentation layers that anchor effects to them.
  if (!cp.s3SpecialDevices) cp.s3SpecialDevices = function () { return states.get(this)?.devices || null; };
  return api;
}
export default installSpecialModels;
