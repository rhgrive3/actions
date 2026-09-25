import * as THREE from "three";
import { Player } from "../entities/Player";
import { WeaponKind } from "../data/weapons";
import { TEAM_COLORS } from "../data/tuning";

const SKIN = [0xf3c9a5, 0xd9a173, 0x8c5a3c, 0xf7d8bc];
const SHIRT = [0x2d2f3a, 0xffffff, 0x3f8f6b, 0xe9c84a, 0x8a3fbf, 0xff6a3d];

function mat(color: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export function buildWeaponModel(kind: WeaponKind, teamHex: number): { group: THREE.Group; drum?: THREE.Mesh; tankInk?: THREE.Mesh } {
  const g = new THREE.Group();
  const team = mat(teamHex);
  const white = mat(0xf2f2ee), dark = mat(0x2a2a2e), metal = mat(0x8d949c);
  if (kind === "shooter") {
    // Splattershot: water-gun body, top tank, nozzle, grip
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.42), white); body.position.set(0, 0, -0.15); g.add(body);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 12), new THREE.MeshLambertMaterial({ color: 0xdff3f5, transparent: true, opacity: 0.55 }));
    tank.rotation.x = Math.PI / 2; tank.position.set(0, 0.12, -0.08); g.add(tank);
    const tankInk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 12), team); tankInk.rotation.x = Math.PI / 2; tankInk.position.copy(tank.position); g.add(tankInk);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 10), team); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.01, -0.44); g.add(nozzle);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.18, 10), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.32); g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.08), dark); grip.position.set(0, -0.12, -0.02); grip.rotation.x = -0.25; g.add(grip);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.04, 0.3), team); stripe.position.set(0, -0.02, -0.15); g.add(stripe);
    return { group: g, tankInk };
  }
  if (kind === "roller") {
    // Splat Roller: handle, fork frame, heavy drum
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), metal); handle.rotation.x = Math.PI / 2 - 0.35; handle.position.set(0, -0.15, -0.45); g.add(handle);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.1), dark); frame.position.set(0, -0.36, -0.85); g.add(frame);
    const forkL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), dark); forkL.position.set(-0.45, -0.55, -0.85); g.add(forkL);
    const forkR = forkL.clone(); forkR.position.x = 0.45; g.add(forkR);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.86, 16), team); drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.7, -0.85); g.add(drum);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), dark); axle.rotation.z = Math.PI / 2; axle.position.copy(drum.position); g.add(axle);
    const tread = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 16), dark); tread.rotation.z = Math.PI / 2; tread.position.copy(drum.position); g.add(tread);
    const tankInk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), team); tankInk.rotation.x = Math.PI / 2; tankInk.position.set(0, 0.02, -0.1); g.add(tankInk);
    return { group: g, drum, tankInk };
  }
  // Splat Charger: long barrel, body, top tank, scope
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 10), mat(0x2c6a4f)); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.75); g.add(barrel);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.5), white); body.position.set(0, 0, -0.1); g.add(body);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12), new THREE.MeshLambertMaterial({ color: 0xdff3f5, transparent: true, opacity: 0.55 })); tank.rotation.x = Math.PI / 2; tank.position.set(0, 0.13, -0.15); g.add(tank);
  const tankInk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.32, 12), team); tankInk.rotation.x = Math.PI / 2; tankInk.position.copy(tank.position); g.add(tankInk);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), dark); scope.rotation.x = Math.PI / 2; scope.position.set(0.0, 0.24, -0.2); g.add(scope);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.12, 10), team); tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.02, -1.4); g.add(tip);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.08), dark); grip.position.set(0, -0.14, -0.02); g.add(grip);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.25), dark); stock.position.set(0, -0.02, 0.25); g.add(stock);
  return { group: g, tankInk };
}

export class CharacterModel {
  root = new THREE.Group();
  human = new THREE.Group();
  squid = new THREE.Group();
  upper = new THREE.Group();
  head = new THREE.Group();
  legL = new THREE.Group(); legR = new THREE.Group();
  armL = new THREE.Group(); armR = new THREE.Group();
  weapon: THREE.Group;
  drum?: THREE.Mesh; tankInk?: THREE.Mesh; tankFill: THREE.Mesh;
  tentacles: THREE.Mesh[] = [];
  phase = 0;
  drumSpin = 0;
  aura: THREE.Mesh;
  nameTag?: THREE.Sprite;
  teamHex: number;
  private tmp = new THREE.Vector3();

  constructor(public player: Player, seed: number) {
    this.teamHex = TEAM_COLORS[player.team].hex;
    const teamMat = mat(this.teamHex);
    const skin = mat(SKIN[seed % SKIN.length]);
    const shirt = mat(SHIRT[(seed * 3 + player.team) % SHIRT.length]);
    const shoe = mat(0x1e1e22);
    const dark = mat(0x1a1a1e);
    // legs
    for (const [grp, sx] of [[this.legL, -1], [this.legR, 1]] as const) {
      grp.position.set(sx * 0.12, 0.62, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.45, 8), dark); thigh.position.y = -0.24; grp.add(thigh);
      const shoeM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), shoe); shoeM.position.set(0, -0.54, 0.04); grp.add(shoeM);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.29), mat(0xffffff)); sole.position.set(0, -0.6, 0.04); grp.add(sole);
      this.human.add(grp);
    }
    // torso (compact) + upper body pivot
    this.upper.position.y = 0.62; this.human.add(this.upper);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.24), shirt); torso.position.y = 0.21; this.upper.add(torso);
    // ink tank on back (glass + fill)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 12), new THREE.MeshLambertMaterial({ color: 0xe9f6f8, transparent: true, opacity: 0.45 }));
    tank.position.set(0, 0.22, 0.22); this.upper.add(tank);
    this.tankFill = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 12), teamMat); this.tankFill.position.copy(tank.position); this.upper.add(this.tankFill);
    const tankCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), dark); tankCap.position.set(0, 0.42, 0.22); this.upper.add(tankCap);
    // arms
    for (const [grp, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      grp.position.set(sx * 0.22, 0.38, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.4, 8), skin); arm.position.y = -0.2; grp.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skin); hand.position.y = -0.42; grp.add(hand);
      this.upper.add(grp);
    }
    // head — large, slightly squashed sphere; characteristic Inkling proportions (head ≈ 1/3 body height)
    this.head.position.y = 0.46; this.upper.add(this.head);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), skin); headM.scale.set(1, 0.92, 1.02); headM.position.y = 0.2; this.head.add(headM);
    // eyes: big almond masks with pupils
    for (const sx of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), mat(0xffffff)); eyeW.scale.set(1, 1.25, 0.5); eyeW.position.set(sx * 0.11, 0.2, -0.22); this.head.add(eyeW);
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), dark); mask.scale.set(1.15, 1.35, 0.35); mask.position.set(sx * 0.11, 0.2, -0.205); this.head.add(mask);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0x2a1d4a)); pupil.scale.set(1, 1.4, 0.5); pupil.position.set(sx * 0.105, 0.19, -0.265); this.head.add(pupil);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), mat(0xffffff)); shine.position.set(sx * 0.09, 0.22, -0.3); this.head.add(shine);
    }
    // ears (pointed)
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), skin); ear.rotation.z = -sx * Math.PI / 2; ear.position.set(sx * 0.3, 0.2, 0); this.head.add(ear); }
    // tentacle hair: cap + 2 long back tentacles + 2 short front bangs (tubes)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), teamMat); cap.position.y = 0.21; cap.scale.set(1, 0.95, 1.05); this.head.add(cap);
    const tentDefs: [number, number, number, number][] = [[-0.16, 0.16, 0.7, 0.5], [0.16, 0.16, 0.7, 0.5], [-0.24, -0.12, 0.25, 0.28], [0.24, -0.12, 0.25, 0.28]];
    for (const [x, z, len, sway] of tentDefs) {
      const pts = [new THREE.Vector3(x, 0.35, z), new THREE.Vector3(x * 1.4, 0.25, z * 1.6), new THREE.Vector3(x * 1.5, 0.3 - len * 0.5, z * 1.9), new THREE.Vector3(x * 1.2, 0.3 - len, z * 1.3 + 0.1)];
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.075, 7, false), teamMat);
      tube.userData.sway = sway; this.head.add(tube); this.tentacles.push(tube);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(lighten(this.teamHex, 0.35))); tip.position.copy(pts[3]); tube.add(tip);
      tip.position.sub(new THREE.Vector3()); // local to tube (identity)
    }
    // weapon in right hand
    const w = buildWeaponModel(player.weapon.kind, this.teamHex);
    this.weapon = w.group; this.drum = w.drum; this.tankInk = w.tankInk;
    this.weapon.position.set(0, -0.42, -0.05);
    this.armR.add(this.weapon);
    this.root.add(this.human);
    // squid form: flattened ellipsoid + fins + eyes + tentacle tips
    const sq = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), teamMat); sq.scale.set(0.8, 0.55, 1.3); sq.position.y = 0.2; this.squid.add(sq);
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), teamMat); fin.rotation.z = sx * Math.PI / 2; fin.rotation.y = 0.3 * sx; fin.scale.set(0.35, 1, 1); fin.position.set(sx * 0.4, 0.18, -0.1); this.squid.add(fin);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mat(0xffffff)); eye.position.set(sx * 0.16, 0.26, -0.22); this.squid.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), dark); pupil.position.set(sx * 0.16, 0.27, -0.28); this.squid.add(pupil);
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 6), teamMat); t.rotation.x = -Math.PI / 2 + 0.2; t.position.set(sx * (0.08 + i * 0.1), 0.12, 0.55 + i * 0.05); this.squid.add(t); }
    }
    this.squid.visible = false;
    this.root.add(this.squid);
    // Flow Aura ring (Ver 11.0.0+)
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: lighten(this.teamHex, 0.4), transparent: true, opacity: 0.8 }));
    this.aura.rotation.x = Math.PI / 2; this.aura.position.y = 0.1; this.aura.visible = false; this.root.add(this.aura);
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.frustumCulled = true; } });
  }

  update(dt: number, alpha: number, time: number) {
    const p = this.player;
    // interpolated transform
    this.root.position.lerpVectors(p.prevPos, p.pos, alpha);
    this.root.rotation.y = p.bodyYaw;
    if (!p.alive) {
      // splat: pop up then fade (ghost) — hide after splat animation
      const t = 1 - Math.max(0, p.splatTimer) / 1.2;
      this.root.visible = p.splatTimer > 0;
      this.root.scale.setScalar(Math.max(0.01, 1 - t)); this.root.position.y += t * 1.2; this.root.rotation.y += t * 6;
      return;
    }
    this.root.visible = true;
    // respawn pop + invulnerability blink
    const blink = p.invulnerable > 0 ? (Math.sin(time * 30) > 0 ? 1 : 0.35) : 1;
    this.root.scale.setScalar(p.state === "RESPAWN" && p.stateTime < 0.25 ? 0.4 + 2.4 * p.stateTime : 1);
    // morph
    const b = p.squidBlend;
    const ease = b * b * (3 - 2 * b);
    this.human.visible = ease < 0.98; this.squid.visible = ease > 0.02;
    // anticipation: human compresses down before vanishing; squid pops from compressed to full
    this.human.scale.set(1 + ease * 0.35, Math.max(0.05, 1 - ease * 0.95), 1 + ease * 0.35);
    this.squid.scale.set(Math.max(0.05, ease * 1.15 - Math.max(0, ease - 0.85) * 1.0), Math.max(0.05, ease), Math.max(0.05, ease));
    const speed = p.moveSpeedNow;
    if (ease > 0.5) {
      // swim animation: bob + wobble + tilt into motion; wall swim points up the wall
      const bob = Math.sin(time * 14) * 0.03 * Math.min(1, speed / 6);
      this.squid.position.y = bob + (p.onOwnInk && p.grounded ? -0.12 : 0.05);
      this.squid.rotation.z = Math.sin(time * 10) * 0.08 * Math.min(1, speed / 6);
      this.squid.rotation.x = p.state === "SWIM_WALL" ? -Math.PI / 2.4 : (p.grounded ? 0 : -p.vel.y * 0.04);
      this.squid.scale.z *= 1 + Math.min(0.35, speed / 30);
      this.squid.scale.x *= 1 - Math.min(0.2, speed / 50);
      if (p.state === "SQUID_ROLL") this.squid.rotation.x = -p.stateTime * 18;
      // hide fully submerged squid partially (sink into ink) when on own ink
      this.squid.visible = true;
    }
    if (ease < 0.5) {
      // locomotion
      const moving = speed > 0.3 && p.grounded;
      this.phase += dt * (moving ? Math.max(6, speed * 2.4) : 0);
      const sw = moving ? Math.sin(this.phase) : 0;
      const amp = Math.min(1, speed / 4.8) * 0.75;
      this.legL.rotation.x = sw * amp; this.legR.rotation.x = -sw * amp;
      if (!p.grounded) { this.legL.rotation.x = -0.5; this.legR.rotation.x = 0.35; }
      const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.04 : Math.sin(time * 2) * 0.01;
      this.upper.position.y = 0.62 + bob - p.landSquash * 0.15;
      this.human.scale.y *= 1 - p.landSquash * 0.2; this.human.scale.x *= 1 + p.landSquash * 0.1; this.human.scale.z *= 1 + p.landSquash * 0.1;
      // lean into movement direction (local space)
      const c = Math.cos(-p.bodyYaw), s = Math.sin(-p.bodyYaw);
      const lx = p.vel.x * c - p.vel.z * s, lz = p.vel.x * s + p.vel.z * c;
      this.upper.rotation.x = THREE.MathUtils.lerp(this.upper.rotation.x, -lz * 0.03 - p.aimPitch * 0.35, 1 - Math.exp(-dt * 10));
      this.upper.rotation.z = THREE.MathUtils.lerp(this.upper.rotation.z, -lx * 0.03, 1 - Math.exp(-dt * 10));
      // aim offset: head follows pitch more than torso
      this.head.rotation.x = -p.aimPitch * 0.4;
      // weapon pose per kind
      const kind = p.weapon.kind;
      const fire = p.wr.firingAnim;
      if (kind === "shooter") {
        this.armR.rotation.x = -Math.PI / 2 - p.aimPitch * 0.6 + fire * 0.12; this.armR.rotation.z = 0.15;
        this.armL.rotation.x = -Math.PI / 2 + 0.3 - p.aimPitch * 0.5; this.armL.rotation.z = -0.6;
        this.weapon.position.z = -0.05 + fire * 0.05;
      } else if (kind === "roller") {
        const ph = p.wr.rollerPhase;
        if (ph === "roll") { this.armR.rotation.x = -0.9; this.armR.rotation.z = 0.05; this.weapon.rotation.x = 0.35; this.drumSpin += speed * dt / 0.3; }
        else if (ph === "hflick_startup") { const t = 1 - p.wr.rollerTimer / (p.weapon.roller!.hFlickStartup); this.armR.rotation.x = -1.4 - t * 0.4; this.armR.rotation.z = -0.9 * t; this.weapon.rotation.x = 0.4; }
        else if (ph === "hflick_recover") { const t = 1 - p.wr.rollerTimer / (p.weapon.roller!.hFlickRecovery); this.armR.rotation.x = -1.5; this.armR.rotation.z = THREE.MathUtils.lerp(-0.9, 1.1, Math.min(1, t * 3)); this.weapon.rotation.x = 0.4 - Math.min(1, t * 3) * 0.3; }
        else if (ph === "vflick_startup") { const t = 1 - p.wr.rollerTimer / (p.weapon.roller!.vFlickStartup); this.armR.rotation.x = -1.2 - t * 1.6; this.armR.rotation.z = 0.1; this.weapon.rotation.x = 0.2 + t * 0.6; }
        else if (ph === "vflick_recover") { const t = 1 - p.wr.rollerTimer / (p.weapon.roller!.vFlickRecovery); this.armR.rotation.x = THREE.MathUtils.lerp(-2.8, -0.6, Math.min(1, t * 2.5)); this.weapon.rotation.x = THREE.MathUtils.lerp(0.8, -0.2, Math.min(1, t * 2.5)); }
        else { this.armR.rotation.x = -1.1; this.armR.rotation.z = 0.1; this.weapon.rotation.x = 0.2; }
        this.armL.rotation.x = this.armR.rotation.x * 0.8; this.armL.rotation.z = -0.3;
        if (this.drum) this.drum.rotation.x = this.drumSpin;
      } else {
        const ch = p.wr.charging ? 1 : 0;
        this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -Math.PI / 2 - p.aimPitch * 0.7 + ch * 0.1 + fire * 0.2, 1 - Math.exp(-dt * 14)); this.armR.rotation.z = 0.05;
        this.armL.rotation.x = this.armR.rotation.x + 0.15; this.armL.rotation.z = -0.55;
        this.weapon.position.z = -0.05 + fire * 0.12;
      }
      // tentacle sway
      for (const t of this.tentacles) { t.rotation.x = Math.sin(time * 3 + t.userData.sway * 10) * 0.05 * t.userData.sway + (moving ? Math.sin(this.phase * 2) * 0.08 : 0); }
    }
    // ink tank fill level
    const level = Math.max(0.03, p.ink / 100);
    this.tankFill.scale.y = level; this.tankFill.position.y = 0.22 - (1 - level) * 0.16;
    this.aura.visible = p.flowAura > 0;
    if (this.aura.visible) { this.aura.rotation.z = time * 3; this.aura.scale.setScalar(1 + Math.sin(time * 6) * 0.1); }
    (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.8 * blink;
    void this.tmp;
  }
}

export function lighten(hex: number, k: number) {
  const c = new THREE.Color(hex); c.lerp(new THREE.Color(0xffffff), k); return c.getHex();
}
