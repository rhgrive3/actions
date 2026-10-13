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
import { buildScreenSheet } from './special-models.mjs';

const INSTALL = Symbol.for('inkwave.s3.special-models.install.v1');
const OBJECTS = Symbol('inkwave.s3.special-models.objects'), ROUNDS = Symbol('inkwave.s3.special-models.rounds');
const clamp01 = x => Math.max(0, Math.min(1, x));

// Device per special while it is active, and where it is attached.
//  host: 'kid' (kid space, feet at origin, +Z forward), 'chest' (chest bone),
//  'model' (the character model root, kid and squid both hidden).
export const SPECIAL_DEVICES = Object.freeze({
  tentaMissiles: [{ model: 'spTentaLauncher', host: 'kid', pos: [-0.24, 1.2, -0.02], rot: [-0.55, 0, 0.12], scale: 0.9, hideWeapon: true, hands: { R: [0, -0.24, 0.06], L: [0.16, -0.06, 0.13] } }],
  inkjet: [{ model: 'spInkjetPack', host: 'chest', pos: [0, -0.02, -0.21], rot: [0, 0, 0], scale: 0.62 },
    { model: 'spInkjetCannon', host: 'kid', pos: [-0.12, 0.98, 0.32], rot: [0, 0, 0], scale: 0.9, aim: true, hideWeapon: true, hands: { R: [0, -0.11, 0.02], L: [0, -0.05, 0.24] } }],
  booyahBomb: [{ model: 'spBooyahBall', host: 'kid', pos: [0, 1.95, 0.05], rot: [0, 0, 0], scale: 1, charge: true, hideWeapon: true, hands: { R: [0.05, -0.36, 0.02] } }],
  // Held by the handle end at the hands, head up in front (S3 screenshot);
  // the swing pivots about the grip.
  ultraStamp: [{ model: 'spUltraStamp', host: 'kid', pos: [0, 0.88, 0.33], rot: [2.88, 0, 0], scale: 0.85, swing: true, grip: [0, -0.66, -1.15], hideWeapon: true, hands: { R: [0, 0.63, 1.085], L: [0, 0.48, 0.77] } }],
  killerWail: [{ model: 'spKillerSpeaker', host: 'kid', speakers: true, scale: 1, hideWeapon: true }],
  crabTank: [{ model: 'spCrabTank', host: 'kid', pos: [0, -0.32, -0.05], rot: [0, 0, 0], scale: 0.9, hideWeapon: true, crab: true, hands: { R: [-0.12, 1.12, 0.1], L: [0.12, 1.12, 0.1] } }],
  reefslider: [{ model: 'spReefShark', host: 'kid', pos: [0, -0.1, 0.12], rot: [0, 0, 0], scale: 1, hideWeapon: true, hands: { R: [-0.09, 0.79, -0.02], L: [0.09, 0.79, -0.02] } }],
  tripleInkstrike: [{ model: 'spInkstrikeCase', host: 'kid', pos: [0, 0.86, 0.3], rot: [0.35, 0, 0], scale: 0.85, hideWeapon: true, hands: { R: [-0.24, 0.09, 0], L: [0.24, 0.09, 0] } }],
  superChump: [{ model: 'spChumpLauncher', host: 'kid', pos: [0.18, 0.86, 0.28], rot: [0.2, 0, 0], scale: 0.9, hideWeapon: true, hands: { R: [-0.1, 0.16, 0.04], L: [0.12, 0.3, 0.04] } }],
  krakenRoyale: [{ model: 'spKraken', host: 'model', pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, hideKid: true }],
  splattercolorScreen: [{ model: 'spScreenJar', host: 'kid', pos: [0.15, 0.85, 0.3], rot: [0, 0, 0], scale: 0.9, hideWeapon: true, hands: { R: [-0.1, 0.1, 0.02], L: [0.15, 0.12, 0] } }],
  waveBreaker: [{ model: 'spWaveBreaker', host: 'kid', pos: [0.2, 0.62, 0.32], rot: [0.25, 0, 0], scale: 0.55, hideWeapon: true, hands: { R: [0.13, 0.3, 0], L: [-0.2, 0.62, 0] } }],
  zipcaster: [{ inkCoat: true, line: true }],
});
// Projectile models (the native ink round keeps drawing its ink blob).
export const SPECIAL_PROJECTILE_MODELS = Object.freeze({
  tentaMissiles: { model: 'spTentaMissile', scale: 1.4, along: true },
  booyahBomb: { model: 'spBooyahBall', scale: 1.25, along: false, spin: true },
  ultraStamp: { model: 'spUltraStamp', scale: 0.85, along: true, tumble: true },
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

export function installSpecialModels(api) {
  const { THREE, G, Character, Projectiles } = api;
  if (!THREE || !Projectiles?.prototype?.update) return api;
  if (Projectiles.prototype[INSTALL]) return api;
  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true });
  const colorOf = (owner, team) => owner?.color || G.teamColors?.[owner?.team ?? team] || 0xffcc33;
  const inkMat = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.08, roughness: 0.42, metalness: 0.1 });
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, 1), grip = new THREE.Vector3(), pole = new THREE.Vector3();

  // ---- deployed objects and projectiles --------------------------------------
  function objectModel(o) {
    const color = colorOf(o.owner, o.team), group = new THREE.Group();
    group.userData.s3SpecialObject = o.kind;
    const add = (id) => { const m = buildSubModel(THREE, id, inkMat(color)); if (m) group.add(m.root); return m; };
    const pres = { group, kind: o.kind, models: {} };
    if (o.kind === 'decoy') pres.models.main = add('spChumpDecoy');
    else if (o.kind === 'marker' || o.kind === 'strike') { pres.models.main = add('spInkstrikeBeacon'); pres.models.tornado = add('spInkstrikeTornado'); }
    else if (o.kind === 'wave') { pres.models.main = add('spWaveBreaker'); pres.rings = []; }
    else if (o.kind === 'screen') { pres.sheet = buildScreenSheet(THREE, color, o.width || 15, o.height || 9); group.add(pres.sheet); }
    else return null;
    (G.scene || null)?.add?.(group);
    return pres;
  }
  function poseObject(o, pres, dt) {
    const g = pres.group, m = pres.models;
    if (o.mesh) o.mesh.visible = false;
    if (o.kind === 'screen') {
      g.position.copy(o.pos); g.position.y += (o.height || 9) / 2;
      g.rotation.set(0, Math.atan2(o.normal.x, o.normal.z), 0);
      const mat = pres.sheet.userData.s3ScreenSheet;
      mat.mat.opacity = 0.78 + 0.08 * Math.sin(o.age * 7);
      mat.tex.offset.x += dt * 0.02; mat.tex.offset.y += dt * 0.01;
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
    const s = { id, devices: [], weapon: null, swing: -1, swingAt: -1 };
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
      if (spec.swing && state) {
        if (state.swings !== s.swing) { s.swing = state.swings; s.swingAt = t; }
        const k = clamp01((t - s.swingAt) / 0.32), arc = s.swingAt >= 0 ? Math.sin(k * Math.PI) * 1.6 : 0;
        d.holder.rotation.x = spec.rot[0] + arc;
      }
      if (spec.speakers) {
        const firing = a.specialActive?.phase === 'laser';
        d.holder.position.set(d.base[0], d.base[1] + Math.sin(t * 3 + d.base[0] * 2) * 0.05, -0.35);
        d.holder.rotation.set(-(a.aimPitch || 0), 0, 0);
        const m = d.model.materials?.get('ink'); if (m?.emissiveIntensity != null) m.emissiveIntensity = firing ? 0.5 + 0.4 * Math.sin(t * 30) : 0.08;
      }
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
  return api;
}
export default installSpecialModels;
