import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GEO, M, TEAM_COLORS, type TeamId, type UnitKind } from "./units";

/* ============================================================
   Character rigs. Every rig faces +Z (facing = atan2(x, z)).
   Static meshes of each bone are merged into one vertex-coloured
   geometry, so posing a unit costs ~10 matrix updates per frame.
   ============================================================ */

export interface Spring { x: number; v: number }
export interface RigPart { group: THREE.Group; geometry: THREE.BufferGeometry; material: THREE.Material }
export type HandMode = "fixed" | "follow";

export interface UnitRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hand: THREE.Group;
  lLeg: THREE.Group;
  rLeg: THREE.Group;
  lArm: THREE.Group;
  rArm: THREE.Group;
  cloak: THREE.Group | null;
  flLeg?: THREE.Group;
  frLeg?: THREE.Group;
  blLeg?: THREE.Group;
  brLeg?: THREE.Group;
  headH: number;
  heavy: boolean;
  scale: number;
  tilt: number;
  kind: UnitKind;
  handMode: HandMode;
  handRest: number;
  parts: RigPart[];
  fx: Record<string, Spring>;
}

const PI = Math.PI;
const dark = (c: number, f = 0.55) => new THREE.Color(c).multiplyScalar(f).getHex();
const light = (c: number, f = 0.35) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), f).getHex();
const bCache = new Map<number, THREE.MeshBasicMaterial>();
const B = (c: number) => {
  let m = bCache.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); bCache.set(c, m); }
  return m;
};
const STEEL = 0xaab3c2, STEEL_LIGHT = 0xdce3ed, STEEL_DARK = 0x5c6472, IRON = 0x434954;
const GOLD = 0xe0b04a, GOLD_LIGHT = 0xf5d478, BRASS = 0xb88a3e, COPPER = 0xc87442;
const LEATHER = 0x523a24, LEATHER_DARK = 0x2f2114, BONE = 0xe8e0c8, BONE_DARK = 0xc7bea2;
const steel = (c = STEEL) => M(c, 0.32, 0.82);
const gold = (c = GOLD) => M(c, 0.28, 0.85);
const leather = (c = LEATHER) => M(c, 0.78, 0.08);
const cloth = (c: number) => M(c, 0.88, 0.04);
const boneMat = (c = BONE) => M(c, 0.68, 0.06);

function part(
  parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
  sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/* ============ faces: every humanoid shares one eye construction ============ */

interface Face {
  sep?: number; y?: number; z?: number; size?: number;
  sclera?: number; pupil?: number; brow?: number; browColor?: number;
  uneven?: boolean; look?: number; lookY?: number;
  mouth?: "smile" | "flat" | "open" | "grin" | "none";
  socket?: boolean;
}

function addFace(head: THREE.Group, skin: number, f: Face = {}) {
  const sep = f.sep ?? 0.105, y = f.y ?? 0.03, z = f.z ?? 0.222, r = f.size ?? 0.064;
  const skinDark = dark(skin, 0.78), skinShadow = dark(skin, 0.65);
  for (const s of [-1, 1]) {
    const k = f.uneven && s > 0 ? 1.4 : 1;
    if (f.socket) {
      part(head, GEO.sph, boneMat(BONE_DARK), r * 1.72, r * 1.9, r * 0.96, s * sep, y, z - 0.008);
      part(head, GEO.sph, B(0x0b0907), r * 1.55, r * 1.75, r * 0.9, s * sep, y, z);
      part(head, GEO.sph, B(f.pupil ?? 0x7fe8ff), r * 0.56, r * 0.56, r * 0.42, s * sep, y - 0.005, z + r * 0.46);
      part(head, GEO.sph, B(0xffffff), r * 0.22, r * 0.22, r * 0.15, s * sep + r * 0.12, y + r * 0.12, z + r * 0.72);
    } else {
      part(head, GEO.sph, M(skinDark, 0.65), r * 1.18 * k, r * 1.24 * k, r * 0.56 * k, s * sep, y, z - 0.012);
      part(head, GEO.box, M(skinShadow, 0.65), r * 1.9 * k, r * 0.24 * k, r * 0.52 * k, s * sep, y + r * 0.88 * k, z + 0.006, 0, 0, -s * 0.06);
      part(head, GEO.sph, B(f.sclera ?? 0xf7f3e6), r * k, r * 1.12 * k, r * 0.62 * k, s * sep, y, z);
      part(head, GEO.sph, B(f.pupil ?? 0x16110d), r * 0.56 * k, r * 0.64 * k, r * 0.4 * k,
        s * sep * 0.94 + (f.look ?? 0) * r * 0.25 * (f.uneven && s > 0 ? -1 : 1), y + (f.lookY ?? 0) * r * 0.3, z + r * 0.5 * k);
      part(head, GEO.sph, B(0xffffff), r * 0.19 * k, r * 0.19 * k, r * 0.12 * k, s * sep * 0.94 + r * 0.16, y + r * 0.3, z + r * 0.85 * k);
      part(head, GEO.sph, B(0xe8f4ff), r * 0.1 * k, r * 0.1 * k, r * 0.08 * k, s * sep * 0.94 - r * 0.14, y - r * 0.2, z + r * 0.82 * k);
      part(head, GEO.sph, M(light(skin, 0.12), 0.56), r * 0.92, r * 0.56, r * 0.44, s * (sep + 0.035), y - 0.068, z - 0.014);
    }
    if (f.brow !== undefined || !f.socket) {
      part(head, GEO.box, B(f.browColor ?? 0x2a1d12), r * 2.25, r * 0.34, r * 0.54, s * sep, y + r * 1.55, z + 0.015, 0, 0, s * (f.brow ?? 0));
    }
  }
  const mouth = f.mouth ?? "smile";
  if (mouth === "smile") {
    part(head, GEO.box, B(0x3a1c14), 0.1, 0.02, 0.03, 0, -0.118, 0.236);
    for (const s of [-1, 1]) part(head, GEO.box, B(0x3a1c14), 0.04, 0.02, 0.03, s * 0.058, -0.103, 0.233, 0, 0, -s * 0.7);
    part(head, GEO.box, M(skinDark, 0.65), 0.075, 0.016, 0.024, 0, -0.138, 0.232);
  } else if (mouth === "flat") {
    part(head, GEO.box, B(0x3a1c14), 0.11, 0.02, 0.03, 0, -0.12, 0.236);
    part(head, GEO.box, M(skinDark, 0.65), 0.09, 0.018, 0.025, 0, -0.138, 0.232);
  } else if (mouth === "open") {
    part(head, GEO.box, B(0x2a0e0c), 0.12, 0.075, 0.03, 0, -0.125, 0.235);
    part(head, GEO.box, B(0xe9e3cf), 0.1, 0.022, 0.03, 0, -0.098, 0.241);
    part(head, GEO.box, B(0xe9e3cf), 0.09, 0.018, 0.03, 0, -0.15, 0.239);
  } else if (mouth === "grin") {
    part(head, GEO.box, B(0x2a0e0c), 0.17, 0.07, 0.03, 0, -0.118, 0.234);
    part(head, GEO.box, B(0xf3eedc), 0.15, 0.028, 0.03, 0, -0.105, 0.242);
    part(head, GEO.box, B(0xf3eedc), 0.13, 0.022, 0.03, 0, -0.138, 0.24);
  }
  if (!f.socket) {
    part(head, GEO.box, M(skin, 0.58), 0.04, 0.076, 0.05, 0, -0.018, 0.248, -0.22, 0, 0);
    part(head, GEO.sph, M(skin, 0.6), 0.044, 0.038, 0.044, 0, -0.048, 0.26);
    for (const s of [-1, 1]) part(head, GEO.sph, M(skinDark, 0.62), 0.022, 0.02, 0.022, s * 0.022, -0.052, 0.254);
  } else part(head, GEO.cone, B(0x0b0907), 0.036, 0.074, 0.032, 0, -0.058, 0.252, PI, 0, 0);
}

/* ============ humanoid ============ */

type HumanKind = Exclude<UnitKind, "knight" | "robot" | "tank" | "railgun">;
interface Look { skin: number; armor: number; pants: number; boot: number; chest: number; scale: number; head: number; legs: number; tilt: number }

function lookOf(kind: HumanKind, tc: number, tcd: number): Look {
  const base: Look = { skin: 0xe6b88e, armor: tc, pants: 0x2f3540, boot: 0x241d13, chest: 0.74, scale: 1, head: 1.28, legs: 1, tilt: 0.04 };
  switch (kind) {
    case "spear": return base;
    case "guardian": return { ...base, armor: 0x8d96a6, pants: 0x3a404c, boot: 0x2b2f38, chest: 0.9, scale: 1.06, head: 1.24, legs: 0.92, tilt: 0.02 };
    case "archer": return { ...base, armor: 0x6e5a38, pants: 0x4a3b28, boot: 0x2a2016, chest: 0.66, scale: 0.98, tilt: 0.06 };
    case "crossbow": return { ...base, armor: tcd, pants: 0x353a44, chest: 0.76, scale: 1.02, head: 1.26, legs: 0.98, tilt: 0.05 };
    case "swordsman": return { ...base, armor: 0x9aa3b2, pants: 0x3d4450, chest: 0.72, scale: 1.0, head: 1.26, legs: 1.02, tilt: 0.05 };
    case "halberdier": return { ...base, armor: 0x7f8896, pants: 0x333945, chest: 0.78, scale: 1.06, head: 1.22, legs: 0.98, tilt: 0.03 };
    case "paladin": return { ...base, armor: 0xd8dbe2, pants: 0x2f3540, boot: 0x2b2f38, chest: 0.86, scale: 1.14, head: 1.2, legs: 0.96, tilt: 0.02 };
    case "orc": return { ...base, skin: 0x84b455, armor: 0x55452e, pants: 0x3a3326, boot: 0x1f1a12, chest: 0.92, scale: 1.22, head: 1.2, legs: 0.92, tilt: 0.1 };
    case "berserker": return { ...base, skin: 0xd29a6c, armor: 0xd29a6c, pants: 0x4f3a26, boot: 0x2a2016, chest: 0.82, scale: 1.1, head: 1.24, tilt: 0.1 };
    case "javelin": return { ...base, skin: 0xcf966a, armor: 0x7a6242, pants: 0x4a3b28, chest: 0.7, scale: 1.0, head: 1.28, legs: 1.02, tilt: 0.06 };
    case "bomber": return { ...base, skin: 0xcf966a, armor: 0x6b5a3e, pants: 0x2f3540, chest: 0.8, head: 1.3, legs: 0.9, tilt: 0.08 };
    case "shaman": return { ...base, skin: 0x8fa060, armor: 0x6a5a3a, pants: 0x4a4230, boot: 0x3a3020, chest: 0.7, scale: 1.04, head: 1.3, legs: 0.92, tilt: 0.14 };
    case "troll": return { ...base, skin: 0x8a9a78, armor: 0x8a9a78, pants: 0x5a4a3a, boot: 0x3a2c20, chest: 1.0, scale: 1.7, head: 1.02, legs: 0.88, tilt: 0.16 };
    case "giant": return { ...base, skin: 0xbf9070, armor: 0xbf9070, pants: 0x5a4a3a, boot: 0x3a2c20, chest: 1.05, scale: 1.9, head: 1.0, legs: 0.86, tilt: 0.12 };
    case "elf": return { ...base, skin: 0xf0dcb8, armor: 0x3f6b3a, pants: 0x2f4a2c, boot: 0x4a3826, chest: 0.58, scale: 0.97, legs: 1.08, tilt: 0.03 };
    case "monk": return { ...base, skin: 0xdca87e, armor: 0xc8a058, pants: 0xb08a4a, boot: 0x5a4630, chest: 0.66, scale: 1.0, head: 1.26, legs: 1.04, tilt: 0.06 };
    case "assassin": return { ...base, armor: 0x2b2f3a, pants: 0x23262e, boot: 0x18191f, chest: 0.62, scale: 0.96, head: 1.24, legs: 1.02, tilt: 0.16 };
    case "mage": return { ...base, armor: tc, pants: 0x2a2f3a, boot: tcd, chest: 0.64, head: 1.28, tilt: 0.02 };
    case "frost": return { ...base, skin: 0xe8dcc8, armor: 0x4f7fbf, pants: 0x2f4462, boot: 0x2a3a52, chest: 0.64, head: 1.28, tilt: 0.02 };
    case "cleric": return { ...base, armor: 0xf0ead8, pants: 0xd8cfb0, boot: 0x5a4630, chest: 0.68, head: 1.28, tilt: 0.02 };
    case "zombie": return { ...base, skin: 0x9fb072, armor: 0x5a5a44, pants: 0x3a3a2e, boot: 0x2a2a20, chest: 0.72, head: 1.3, tilt: 0.32 };
    case "skeleton": return { ...base, skin: 0xece5cd, armor: 0xece5cd, pants: 0xe0d9c0, boot: 0xcfc8ae, chest: 0.5, scale: 1.02, head: 1.35, legs: 1.05, tilt: 0.05 };
    case "bonearcher": return { ...base, skin: 0xe6dfc6, armor: 0xe6dfc6, pants: 0xd8d0b4, boot: 0xc6bfa6, chest: 0.5, scale: 1.0, head: 1.35, legs: 1.05, tilt: 0.05 };
    case "vampire": return { ...base, skin: 0xe8dcd0, armor: 0x241f2c, pants: 0x1c1824, boot: 0x141119, chest: 0.72, scale: 1.06, head: 1.24, legs: 1.04, tilt: 0.05 };
    case "king": return { ...base, skin: 0xefc39a, armor: 0x8a2f3c, pants: 0x5a1620, boot: 0x3d1016, chest: 0.88, scale: 1.2, head: 1.2, legs: 0.94, tilt: 0.03 };
    case "pirate": return { ...base, skin: 0xd19a6a, armor: 0x4a3a52, pants: 0x2e2734, boot: 0x241d22, chest: 0.72, scale: 1.02, head: 1.26, legs: 1.0, tilt: 0.07 };
    case "zeus": return { ...base, skin: 0xe9c9a0, armor: 0xf2ead4, pants: 0xf2ead4, boot: 0xc2a45c, chest: 0.98, scale: 1.3, head: 1.14, legs: 1.12, tilt: 0.0 };
  }
}

function buildHumanoid(kind: HumanKind, team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc), tcl = new THREE.Color(tc).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  const L = lookOf(kind, tc, tcd);
  const cw = L.chest, ww = cw * 0.84;
  const skel = kind === "skeleton" || kind === "bonearcher";
  const armored = kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin" || kind === "king" || kind === "vampire" || kind === "zeus";
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  root.scale.setScalar(L.scale);
  const body = new THREE.Group();
  root.add(body);
  const hipY = 1.02 * L.legs;

  const mkLeg = (side: number) => {
    const p = new THREE.Group();
    p.position.set(side * (0.17 + cw * 0.05), hipY, 0);
    body.add(p);
    if (skel) {
      part(p, GEO.sph, boneMat(L.skin), 0.078, 0.078, 0.078, 0, -0.04, 0);
      part(p, GEO.cyl, boneMat(L.skin), 0.048, 0.42 * L.legs, 0.048, 0, -0.24 * L.legs, 0);
      part(p, GEO.sph, boneMat(L.pants), 0.082, 0.076, 0.086, 0, -0.45 * L.legs, 0.02);
      part(p, GEO.cyl, boneMat(L.pants), 0.042, 0.42 * L.legs, 0.042, side * 0.012, -0.67 * L.legs, 0);
      part(p, GEO.cyl, boneMat(BONE_DARK), 0.024, 0.38 * L.legs, 0.024, -side * 0.022, -0.67 * L.legs, -0.012);
      part(p, GEO.box, boneMat(L.boot), 0.11, 0.085, 0.24, 0, -0.92 * L.legs, 0.05);
      for (const t of [-0.032, 0, 0.032]) part(p, GEO.box, boneMat(L.skin), 0.02, 0.036, 0.075, t, -0.94 * L.legs, 0.165);
      return p;
    }
    const th = kind === "orc" || kind === "troll" || kind === "giant" ? 0.28 : 0.24;
    const shinM = armored ? (kind === "paladin" ? steel(0xd8dbe2) : kind === "king" || kind === "zeus" ? gold(L.boot) : steel(STEEL_DARK)) : M(L.pants, 0.8);
    part(p, GEO.box, M(L.pants, 0.82), th, 0.46 * L.legs, th * 1.12, 0, -0.23 * L.legs, 0);
    part(p, GEO.box, shinM, th * 0.9, 0.42 * L.legs, th * 1.02, 0, -0.67 * L.legs, -0.01);
    const kneeM = armored ? (kind === "paladin" || kind === "king" || kind === "zeus" ? gold() : steel(STEEL_LIGHT)) : leather(0x3d2d1d);
    part(p, GEO.sph, kneeM, th * 0.56, 0.11, th * 0.62, 0, -0.45 * L.legs, th * 0.42);
    part(p, GEO.box, kneeM, th * 1.08, 0.09, th * 1.16, 0, -0.45 * L.legs, 0.01);
    if (armored) part(p, GEO.box, kneeM, 0.035, 0.14, 0.12, side * th * 0.56, -0.45 * L.legs, 0.04);
    part(p, GEO.box, leather(LEATHER_DARK), th * 0.98, 0.09, th * 1.08, 0, -0.82 * L.legs, 0);
    part(p, GEO.box, armored ? shinM : leather(L.boot), th * 1.06, 0.16, th * 1.5, 0, -0.92 * L.legs, 0.05);
    part(p, GEO.sph, armored ? shinM : leather(L.boot), th * 0.5, 0.08, th * 0.55, 0, -0.93 * L.legs, 0.18);
    part(p, GEO.box, M(0x18130e, 0.9), th * 1.08, 0.045, th * 1.56, 0, -0.99 * L.legs, 0.05);
    if (kind === "orc" || kind === "giant" || kind === "berserker" || kind === "troll") part(p, GEO.box, M(0x4a3a28), th * 1.18, 0.11, th * 1.26, 0, -0.3 * L.legs, 0);
    if (kind === "zombie" && side < 0) part(p, GEO.box, boneMat(), 0.085, 0.16, 0.085, 0, -0.58 * L.legs, 0.09);
    return p;
  };
  const lLeg = mkLeg(1), rLeg = mkLeg(-1);

  const torso = new THREE.Group();
  torso.position.set(0, hipY + 0.04, 0);
  torso.rotation.x = L.tilt;
  body.add(torso);

  if (skel) {
    part(torso, GEO.box, boneMat(L.skin), ww * 0.96, 0.13, cw * 0.52, 0, 0.02, 0);
    for (let i = 0; i < 6; i++) {
      part(torso, GEO.box, boneMat(L.skin), 0.085, 0.105, 0.09, 0, 0.14 + i * 0.12, -0.03);
      part(torso, GEO.cone, boneMat(L.pants), 0.03, 0.075, 0.03, 0, 0.14 + i * 0.12, -0.095, -PI / 2, 0, 0);
    }
    part(torso, GEO.box, boneMat(L.skin), 0.072, 0.48, 0.042, 0, 0.48, cw * 0.25);
    part(torso, GEO.sph, B(kind === "bonearcher" ? 0x7eff9e : tcl), 0.075, 0.11, 0.065, 0, 0.48, 0.01);
    for (let i = 0; i < 4; i++) {
      const ry = 0.26 + i * 0.14, rw = cw * (0.86 + i * 0.05);
      for (const s of [-1, 1]) {
        const broken = kind === "skeleton" && i === 1 && s < 0;
        part(torso, GEO.box, boneMat(L.skin), broken ? rw * 0.34 : rw * 0.48, 0.048, cw * 0.52, s * (rw * 0.25), ry, 0.01);
      }
    }
    part(torso, GEO.box, boneMat(L.skin), cw * 1.08, 0.055, 0.08, 0, 0.78, 0.02);
    part(torso, GEO.box, M(tc), cw * 1.05, 0.1, cw * 0.56, 0, 0.74, 0.0, 0, 0, 0.35);
    part(torso, GEO.box, cloth(tcd), ww * 0.96, 0.24, 0.04, -0.08, -0.09, cw * 0.27, 0, 0, 0.08);
  } else if (kind === "mage" || kind === "frost") {
    const robe = kind === "frost" ? 0x4f7fbf : tc;
    part(torso, GEO.box, M(robe), cw, 0.8, cw * 0.62, 0, 0.42, 0);
    part(torso, GEO.cone, M(robe), 0.62, 1.7, 0.62, 0, -0.2, 0);
    part(torso, GEO.ring, steel(GOLD), 0.62, 0.62, 0.62, 0, -1.04, 0, PI / 2, 0, 0);
    part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.1, 0.84, 0.05, 0, 0.0, cw * 0.32 + 0.02);
    part(torso, GEO.box, M(kind === "frost" ? 0xbfe4ff : 0xd9c08a), cw * 1.02, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, leather(0x4a2a18), 0.12, 0.24, 0.18, -cw * 0.54, 0.0, 0.06, 0, 0, 0.18);
    part(torso, GEO.box, gold(), 0.13, 0.06, 0.19, -cw * 0.54, 0.0, 0.06, 0, 0, 0.18);
  } else if (kind === "cleric" || kind === "monk" || kind === "shaman") {
    const robe = kind === "cleric" ? 0xf0ead8 : kind === "monk" ? 0xc8a058 : 0x6a5a3a;
    part(torso, GEO.box, M(robe), cw, 0.8, cw * 0.62, 0, 0.42, 0);
    part(torso, GEO.cone, M(robe), 0.66, 1.7, 0.66, 0, -0.2, 0);
    part(torso, GEO.ring, steel(kind === "monk" ? 0x8a6a2a : GOLD), 0.66, 0.66, 0.66, 0, -1.04, 0, PI / 2, 0, 0);
    part(torso, GEO.box, M(tc), 0.2, 1.6, 0.04, 0, -0.1, cw * 0.32 + 0.05);
    if (kind === "shaman") {
      for (let i = 0; i < 5; i++) part(torso, GEO.sph, M(0xe8e0c8), 0.068, 0.088, 0.052, -0.24 + i * 0.12, 0.7 - Math.abs(i - 2) * 0.03, cw * 0.31 + 0.04);
      part(torso, GEO.box, M(0xd8cfb0), cw * 0.9, 0.2, 0.06, 0, 0.1, -cw * 0.31 - 0.03);
    }
    if (kind === "cleric") {
      part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.22, 0.05, 0.05, 0, 0.58, cw * 0.32 + 0.08);
      part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.05, 0.22, 0.05, 0, 0.58, cw * 0.32 + 0.08);
    }
  } else {
    const zOff = kind === "zombie" ? 0.06 : 0;
    part(torso, GEO.box, M(L.armor), ww, 0.38, cw * 0.58, 0, 0.22, zOff);
    part(torso, GEO.box, M(L.armor), cw, 0.48, cw * 0.63, 0, 0.58, zOff);
    part(torso, GEO.box, M(0x2a2016), ww + 0.06, 0.13, cw * 0.65, 0, 0.04, zOff);
    part(torso, GEO.box, gold(BRASS), 0.14, 0.15, 0.05, 0, 0.04, cw * 0.32 + zOff + 0.02);
    part(torso, GEO.box, steel(STEEL_LIGHT), 0.06, 0.022, 0.058, 0.01, 0.04, cw * 0.32 + zOff + 0.025);
    part(torso, GEO.box, leather(LEATHER), 0.11, 0.14, 0.09, -ww * 0.48, -0.02, zOff + 0.08, 0, 0, 0.12);
  }
  part(torso, GEO.cyl, skel ? boneMat(L.skin) : M(L.skin, 0.6), skel ? 0.055 : 0.11, 0.18, skel ? 0.055 : 0.11, 0, 0.9, 0);

  // faction- and role-specific torso detail
  if (kind === "spear") {
    part(torso, GEO.box, steel(0x9aa3b2), cw + 0.04, 0.4, cw * 0.64, 0, 0.62, 0);
    part(torso, GEO.box, M(tcd), cw * 0.9, 0.3, cw * 0.68, 0, -0.14, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(0x9aa3b2), 0.2, 0.15, 0.2, s * (cw / 2 + 0.1), 0.74, 0);
  } else if (kind === "guardian") {
    part(torso, GEO.box, steel(), cw + 0.05, 0.8, cw * 0.66, 0, 0.42, 0);
    part(torso, GEO.box, M(tc), cw * 0.5, 0.7, cw * 0.66 + 0.02, 0, 0.38, 0);
    part(torso, GEO.box, M(GOLD, 0.4, 0.5), cw * 0.5 + 0.02, 0.06, cw * 0.66 + 0.03, 0, 0.62, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(), 0.27, 0.2, 0.27, s * (cw / 2 + 0.12), 0.74, 0);
  } else if (kind === "swordsman") {
    part(torso, GEO.box, steel(0x9aa3b2), cw + 0.03, 0.34, cw * 0.65, 0, 0.56, 0);
    part(torso, GEO.box, M(tc), cw + 0.03, 0.09, cw * 0.66, 0, 0.34, 0, 0, 0, 0.4);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(), 0.19, 0.14, 0.19, s * (cw / 2 + 0.1), 0.72, 0);
  } else if (kind === "halberdier") {
    part(torso, GEO.box, steel(0x7f8896), cw + 0.05, 0.6, cw * 0.66, 0, 0.5, 0);
    part(torso, GEO.box, M(tc), cw * 0.34, 0.72, cw * 0.68, 0, 0.4, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, steel(0x7f8896), 0.24, 0.2, 0.24, s * (cw / 2 + 0.12), 0.74, 0);
  } else if (kind === "paladin") {
    part(torso, GEO.box, steel(0xd8dbe2), cw + 0.06, 0.82, cw * 0.68, 0, 0.44, 0);
    part(torso, GEO.box, M(tc), cw * 0.44, 0.76, cw * 0.7, 0, 0.4, 0);
    part(torso, GEO.box, M(GOLD, 0.35, 0.7), cw * 0.46, 0.06, cw * 0.71, 0, 0.66, 0);
    part(torso, GEO.box, M(GOLD, 0.35, 0.7), cw + 0.07, 0.06, cw * 0.69, 0, 0.16, 0);
    for (const s of [-1, 1]) {
      part(torso, GEO.sph, steel(0xd8dbe2), 0.3, 0.24, 0.3, s * (cw / 2 + 0.14), 0.76, 0);
      part(torso, GEO.cone, M(GOLD, 0.35, 0.7), 0.09, 0.3, 0.09, s * (cw / 2 + 0.14), 0.98, 0, -0.3, 0, -s * 0.5);
    }
  } else if (kind === "archer" || kind === "bonearcher") {
    part(torso, GEO.box, M(0x4a3926), cw + 0.03, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, M(tc), cw + 0.03, 0.09, cw * 0.66, 0, 0.62, 0, 0, 0, 0.5);
    part(torso, GEO.cyl, M(0x4a3220), 0.13, 0.62, 0.13, 0.2, 0.5, -0.3, 0.22, 0, 0);
    for (let i = 0; i < 4; i++) {
      part(torso, GEO.cyl, M(skel ? 0xd8d0b4 : 0xb69250), 0.02, 0.34, 0.02, 0.14 + i * 0.04, 0.9, -0.33);
      part(torso, GEO.box, skel ? M(0x3a2418) : B(tcl), 0.05, 0.1, 0.012, 0.14 + i * 0.04, 1.02, -0.33);
      part(torso, GEO.box, skel ? M(0x3a2418) : B(tcl), 0.012, 0.1, 0.05, 0.14 + i * 0.04, 1.02, -0.33);
    }
  } else if (kind === "crossbow") {
    part(torso, GEO.box, M(0x6e5a38), cw + 0.04, 0.2, cw * 0.67, 0, 0.1, 0);
    part(torso, GEO.box, M(0xd9cfa8), 0.1, 0.8, cw * 0.65, 0.18, 0.42, 0.0);
    part(torso, GEO.box, M(0x4a3926), 0.3, 0.3, 0.14, -0.1, 0.3, -cw * 0.34 - 0.04);
    for (let i = 0; i < 3; i++) part(torso, GEO.cyl, steel(), 0.02, 0.2, 0.02, -0.18 + i * 0.07, 0.5, -cw * 0.34 - 0.06);
  } else if (kind === "javelin") {
    part(torso, GEO.box, M(0x7a6242), cw + 0.03, 0.16, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, M(tc), cw + 0.03, 0.08, cw * 0.67, 0, 0.6, 0, 0, 0, -0.4);
    for (let i = 0; i < 3; i++) part(torso, GEO.cyl, M(0x9a7a4a), 0.03, 1.5, 0.03, -0.16 + i * 0.07, 0.7, -0.3, 0.1, 0, 0.06);
  } else if (kind === "orc") {
    part(torso, GEO.box, M(tc), cw * 1.06, 0.1, cw * 0.66, 0, 0.62, 0, 0, 0, 0.55);
    part(torso, GEO.box, M(0x6b5a3e), cw * 0.7, 0.36, cw * 0.62 + 0.02, 0, 0.0, 0);
    for (const s of [-1, 1]) {
      part(torso, GEO.sph, M(0x3d3426, 0.8, 0.2), 0.3, 0.2, 0.3, s * (cw / 2 + 0.14), 0.76, 0);
      part(torso, GEO.cone, steel(0x8b939f), 0.07, 0.22, 0.07, s * (cw / 2 + 0.14), 0.96, 0);
    }
  } else if (kind === "berserker") {
    for (const s of [-1, 1]) part(torso, GEO.box, M(0x4a3220), 0.1, 0.95, cw * 0.66, s * 0.0, 0.42, 0, 0, 0, s * 0.62);
    part(torso, GEO.box, M(tc), cw * 0.9, 0.12, cw * 0.62 + 0.02, 0, 0.1, 0);
    part(torso, GEO.sph, M(0xe8e0c8), 0.08, 0.08, 0.05, 0, 0.5, cw * 0.32 + 0.03);
  } else if (kind === "bomber") {
    part(torso, GEO.box, M(0x3b2f20), cw + 0.05, 0.3, cw * 0.66, 0, 0.08, 0);
    part(torso, GEO.box, M(tc), 0.14, 0.82, cw * 0.65, -0.2, 0.42, 0, 0, 0, 0.35);
    part(torso, GEO.box, M(0x3b2f20), 0.5, 0.52, 0.22, 0, 0.5, -cw * 0.31 - 0.08);
    for (const x of [-0.14, 0.14]) {
      part(torso, GEO.sph, M(0x25252a, 0.5, 0.2), 0.13, 0.13, 0.13, x, 0.82, -cw * 0.31 - 0.08);
      part(torso, GEO.box, B(0xff9a3a), 0.025, 0.07, 0.025, x, 0.98, -cw * 0.31 - 0.08);
    }
    for (let i = 0; i < 3; i++) part(torso, GEO.sph, M(0x25252a, 0.5, 0.2), 0.09, 0.09, 0.09, -0.2 + i * 0.2, 0.0, cw * 0.33 + 0.04);
  } else if (kind === "troll") {
    part(torso, GEO.sph, M(L.skin), cw * 0.6, 0.52, 0.52, 0, 0.26, 0.08);
    part(torso, GEO.box, M(0x6a4a30), cw * 1.1, 0.4, cw * 0.66, 0, -0.08, 0);
    part(torso, GEO.box, M(0x4e6a3a), cw * 0.92, 0.5, cw * 0.66, 0, 0.56, 0.0);
    for (const s of [-1, 1]) part(torso, GEO.sph, M(0x3f5a2e), 0.34, 0.24, 0.34, s * (cw / 2 + 0.2), 0.8, 0);
    for (let i = 0; i < 3; i++) part(torso, GEO.cone, B(0xf0e6c0), 0.04, 0.16, 0.04, -0.12 + i * 0.12, 0.14, cw * 0.33 + 0.02);
  } else if (kind === "giant") {
    part(torso, GEO.sph, M(L.skin), cw * 0.6, 0.5, 0.5, 0, 0.26, 0.1);
    part(torso, GEO.box, M(0x6a4a30), cw * 1.1, 0.4, cw * 0.66, 0, -0.08, 0);
    part(torso, GEO.box, M(0x7a5a3c), cw * 0.9, 0.5, cw * 0.65, 0, 0.55, 0.0);
    for (const s of [-1, 1]) part(torso, GEO.sph, M(0x4a3a2a), 0.32, 0.24, 0.32, s * (cw / 2 + 0.2), 0.8, 0);
  } else if (kind === "elf") {
    part(torso, GEO.box, M(0x2c4f2a), cw + 0.03, 0.12, cw * 0.66, 0, 0.08, 0);
    part(torso, GEO.box, M(0xd9c08a, 0.5, 0.4), cw * 0.5, 0.06, cw * 0.66, 0, 0.62, 0);
    part(torso, GEO.box, M(0x4a3826), 0.1, 0.6, 0.08, -0.18, 0.5, -0.3, 0.1, 0, 0);
    part(torso, GEO.cone, M(0x2f6a35), 0.2, 0.55, 0.12, 0, -0.36, 0.0);
    part(torso, GEO.box, M(tc), 0.07, 0.32, 0.03, 0.0, 0.0, cw * 0.32 + 0.03);
  } else if (kind === "monk") {
    part(torso, GEO.box, M(0xb08a4a), cw + 0.02, 0.5, cw * 0.66, 0, 0.5, 0);
    part(torso, GEO.box, M(tc), cw + 0.04, 0.1, cw * 0.68, 0, 0.32, 0);
    part(torso, GEO.box, M(0xd9c08a), 0.14, 0.6, 0.05, 0.0, 0.1, 0, 0, 0, 0.5);
  } else if (kind === "assassin") {
    part(torso, GEO.box, M(tc), cw + 0.03, 0.1, cw * 0.66, 0, 0.62, 0, 0, 0, -0.5);
    part(torso, GEO.box, M(0x14151a), cw + 0.04, 0.12, cw * 0.66, 0, 0.1, 0);
    part(torso, GEO.box, steel(0x6b7280), 0.1, 0.34, 0.06, 0.2, 0.0, cw * 0.33);
  } else if (kind === "vampire") {
    part(torso, GEO.box, M(0x241f2c), cw + 0.04, 0.8, cw * 0.64, 0, 0.42, 0);
    part(torso, GEO.box, M(0x8a1f2a), cw * 0.3, 0.7, cw * 0.66, 0, 0.4, 0);
    part(torso, GEO.box, M(GOLD, 0.35, 0.7), cw + 0.05, 0.06, cw * 0.66, 0, 0.14, 0);
    for (const s of [-1, 1]) part(torso, GEO.sph, M(0x241f2c), 0.26, 0.18, 0.26, s * (cw / 2 + 0.12), 0.74, 0);
    part(torso, GEO.ring, steel(GOLD), 0.34, 0.34, 0.05, 0, 0.46, cw * 0.33 + 0.02);
  } else if (kind === "zombie") {
    part(torso, GEO.box, M(0x4a4a38), 0.22, 0.46, 0.05, -0.18, 0.12, cw * 0.31 + 0.06);
    part(torso, GEO.box, M(0x3a3a2a), 0.2, 0.3, 0.05, 0.2, 0.55, cw * 0.31 + 0.06, 0, 0, 0.3);
    part(torso, GEO.sph, M(0x5a2a22), 0.14, 0.1, 0.05, 0.16, 0.36, cw * 0.31 + 0.07);
    part(torso, GEO.box, M(0xe0d8c0), 0.18, 0.03, 0.04, 0.16, 0.5, cw * 0.31 + 0.07);
  }
  detailTorso(kind, torso, cw, tc);

  // cloak
  let cloak: THREE.Group | null = null;
  const cloakColor: Partial<Record<HumanKind, [number, number, number]>> = {
    spear: [tcd, 0.9, 1.1], guardian: [tcd, 0.96, 1.24], halberdier: [tcd, 0.86, 1.1], king: [0x8a1c28, 1.16, 1.48], zeus: [0xf4eee0, 1.08, 1.44],
    elf: [0x2f5f33, 0.8, 1.2], mage: [tcd, 0.8, 1.25], frost: [0x3a5f8f, 0.8, 1.25],
    assassin: [tc, 0.22, 1.5], skeleton: [tcd, 0.6, 0.9], bonearcher: [tcd, 0.6, 0.9], cleric: [0xd9cfb0, 0.7, 1.1],
    paladin: [tcd, 1.0, 1.3], vampire: [0x2a1420, 1.5, 1.7], shaman: [0x4a4230, 0.8, 1.2], monk: [tc, 0.7, 1.0],
  };
  const cc = cloakColor[kind];
  if (cc) {
    cloak = new THREE.Group();
    cloak.position.set(0, 0.8, -cw * 0.34);
    torso.add(cloak);
    part(cloak, GEO.box, M(cc[0]), cw * cc[1], cc[2], 0.05, 0, -cc[2] * 0.5, 0);
    for (const s of [-1, 1]) part(cloak, GEO.box, cloth(dark(cc[0], 0.82)), cw * cc[1] * 0.22, cc[2] * 0.96, 0.052, s * cw * cc[1] * 0.38, -cc[2] * 0.49, -0.015, 0, s * 0.14, -s * 0.04);
    part(cloak, GEO.box, cloth(kind === "king" || kind === "paladin" || kind === "zeus" || kind === "cleric" || kind === "mage" ? GOLD : tc), cw * cc[1] * 1.02, 0.065, 0.056, 0, -cc[2] + 0.04, 0);
    if (kind === "vampire") part(cloak, GEO.box, M(cc[0]), cw * 0.24, cc[2] * 0.85, 0.04, 0.0, -cc[2] * 1.0, -0.06);
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0);
  head.scale.setScalar(L.head);
  torso.add(head);
  part(head, GEO.sph, M(L.skin, 0.6), 0.26, 0.28, 0.26);
  if (!skel) {
    part(head, GEO.box, M(L.skin, 0.58), 0.28, 0.14, 0.24, 0, -0.14, 0.04);
    for (const s of [-1, 1]) part(head, GEO.sph, M(L.skin, 0.6), 0.05, 0.07, 0.04, s * 0.255, -0.01, 0.0);
  }
  let headExtra = 0;
  const dome = (c: number, r: number, y: number, metal = false, sy = 0.9) =>
    part(head, GEO.dome, metal ? steel(c) : M(c), r, r * sy, r, 0, y, -0.005);
  const teeth = (c = 0xf0e6c0) => { for (let i = 0; i < 4; i++) part(head, GEO.box, B(c), 0.02, 0.05, 0.01, -0.06 + i * 0.04, -0.19, 0.2); };

  switch (kind) {
    case "spear":
      dome(0x9aa3b2, 0.3, 0.07, true);
      part(head, GEO.ring, steel(0x6b7280), 0.3, 0.3, 0.3, 0, 0.07, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(0x9aa3b2), 0.05, 0.22, 0.04, 0, -0.01, 0.275);
      for (const s of [-1, 1]) part(head, GEO.box, steel(0x9aa3b2), 0.04, 0.17, 0.17, s * 0.265, -0.04, 0.0);
      part(head, GEO.box, M(tc), 0.07, 0.2, 0.5, 0, 0.3, -0.06, -0.3, 0, 0);
      headExtra = 0.15;
      addFace(head, L.skin, { brow: 0.12, mouth: "flat" });
      break;
    case "guardian":
      dome(0x8d96a6, 0.32, 0.07, true);
      part(head, GEO.ring, steel(GOLD), 0.32, 0.32, 0.32, 0, 0.08, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(), 0.06, 0.26, 0.05, 0, 0.0, 0.282);
      for (const s of [-1, 1]) part(head, GEO.box, steel(), 0.05, 0.22, 0.2, s * 0.28, -0.05, 0.0);
      part(head, GEO.box, M(tc), 0.08, 0.26, 0.4, 0, 0.34, -0.05, -0.2, 0, 0);
      headExtra = 0.15;
      addFace(head, L.skin, { brow: 0.16, mouth: "flat" });
      break;
    case "archer":
      dome(tcd, 0.31, 0.04);
      part(head, GEO.cone, M(tcd), 0.28, 0.4, 0.28, 0, 0.0, -0.19, -1.15, 0, 0);
      part(head, GEO.box, M(tcl), 0.03, 0.2, 0.06, 0.22, 0.26, -0.05, 0.3, 0, -0.5);
      addFace(head, L.skin, { mouth: "smile" });
      break;
    case "bonearcher":
      part(head, GEO.box, M(L.skin, 0.7), 0.28, 0.1, 0.2, 0, -0.22, 0.08);
      part(head, GEO.box, M(tc), 0.5, 0.07, 0.5, 0, 0.16, 0);
      teeth(0xe6dfc6);
      addFace(head, L.skin, { socket: true, pupil: 0x9fffa8, brow: 0.2, mouth: "none", size: 0.06 });
      break;
    case "crossbow":
      dome(0x7a808c, 0.31, 0.11, true, 1.05);
      part(head, GEO.cyl, steel(0x7a808c), 0.45, 0.035, 0.45, 0, 0.1, 0);
      addFace(head, L.skin, { brow: 0.1, mouth: "flat" });
      break;
    case "swordsman":
      dome(0x9aa3b2, 0.3, 0.08, true, 0.95);
      part(head, GEO.ring, steel(0x6b7280), 0.3, 0.3, 0.3, 0, 0.08, 0, PI / 2, 0, 0);
      for (const s of [-1, 1]) part(head, GEO.box, steel(0x9aa3b2), 0.04, 0.14, 0.14, s * 0.26, -0.06, 0.0);
      addFace(head, L.skin, { brow: 0.14, mouth: "smile" });
      break;
    case "halberdier":
      dome(0x7f8896, 0.3, 0.1, true, 1.1);
      part(head, GEO.box, steel(0x7f8896), 0.06, 0.2, 0.32, 0, 0.02, 0.24);
      part(head, GEO.box, M(tc), 0.07, 0.16, 0.44, 0, 0.3, -0.04, -0.25, 0, 0);
      addFace(head, L.skin, { brow: 0.16, mouth: "flat" });
      break;
    case "paladin":
      dome(0xd8dbe2, 0.32, 0.08, true);
      part(head, GEO.ring, steel(GOLD), 0.32, 0.32, 0.32, 0, 0.08, 0, PI / 2, 0, 0);
      part(head, GEO.box, steel(0xd8dbe2), 0.05, 0.24, 0.04, 0, 0.0, 0.28);
      for (const s of [-1, 1]) {
        part(head, GEO.box, steel(0xd8dbe2), 0.04, 0.2, 0.2, s * 0.275, -0.04, 0.0);
        const wing = part(head, GEO.cone, M(GOLD, 0.35, 0.7), 0.07, 0.34, 0.07, s * 0.24, 0.3, -0.05, -0.2, 0, -s * 0.35);
        void wing;
      }
      part(head, GEO.cone, M(tc), 0.09, 0.4, 0.09, 0, 0.42, -0.12, -0.35, 0, 0);
      headExtra = 0.2;
      addFace(head, L.skin, { brow: 0.14, mouth: "flat" });
      break;
    case "orc":
      part(head, GEO.box, M(L.skin, 0.6), 0.5, 0.11, 0.3, 0, 0.115, 0.1);
      part(head, GEO.sph, M(L.skin, 0.6), 0.2, 0.16, 0.14, 0, -0.17, 0.12);
      for (const s of [-1, 1]) {
        part(head, GEO.cone, M(0xf0e6c0, 0.5), 0.055, 0.2, 0.055, s * 0.13, -0.19, 0.2, -0.35, 0, 0);
        part(head, GEO.cone, M(L.skin, 0.6), 0.07, 0.3, 0.06, s * 0.3, 0.1, 0, 0, 0, -s * 1.25);
      }
      part(head, GEO.box, M(tcd, 0.6, 0.3), 0.54, 0.09, 0.54, 0, 0.2, 0);
      addFace(head, L.skin, { sclera: 0xffe9a0, pupil: 0xd02a1c, brow: 0.42, mouth: "grin", browColor: 0x1d1a10 });
      break;
    case "berserker":
      for (let i = 0; i < 5; i++) part(head, GEO.cone, M(tc), 0.05, 0.3 - Math.abs(i - 2) * 0.05, 0.06, 0, 0.3 - Math.abs(i - 2) * 0.03, 0.14 - i * 0.075, 0, 0, 0);
      part(head, GEO.box, M(0x8a5a32), 0.27, 0.12, 0.2, 0, -0.22, 0.12);
      addFace(head, L.skin, { brow: 0.36, mouth: "open", browColor: 0x3a2412 });
      headExtra = 0.12;
      break;
    case "javelin":
      dome(tcd, 0.3, 0.06);
      part(head, GEO.cone, M(tcd), 0.26, 0.36, 0.26, 0, 0.0, -0.18, -1.1, 0, 0);
      part(head, GEO.box, M(0xd9c08a), 0.5, 0.06, 0.5, 0, -0.02, 0);
      addFace(head, L.skin, { brow: 0.12, mouth: "smile" });
      break;
    case "bomber":
      dome(tc, 0.285, 0.07);
      part(head, GEO.cone, M(tc), 0.1, 0.22, 0.1, 0, 0.02, -0.3, -1.9, 0, 0);
      part(head, GEO.box, M(0x2a2016), 0.22, 0.03, 0.04, 0, -0.06, 0.255);
      for (const s of [-1, 1]) {
        part(head, GEO.ring, steel(0xb9803a), 0.095, 0.095, 0.1, s * 0.105, 0.04, 0.235);
        part(head, GEO.box, M(0x2a2016), 0.06, 0.05, 0.5, s * 0.27, 0.07, 0.0);
      }
      addFace(head, L.skin, { brow: 0.2, mouth: "grin", sclera: 0xfaf3d8 });
      break;
    case "shaman":
      for (let i = 0; i < 4; i++) part(head, GEO.cone, B(0xe8e0c8), 0.05, 0.22, 0.05, -0.16 + i * 0.11, 0.28, 0.0, 0, 0, 0);
      part(head, GEO.box, M(0xd8cfb0), 0.52, 0.32, 0.34, 0, 0.0, 0.02);
      part(head, GEO.box, B(0x1a140c), 0.4, 0.1, 0.04, 0, 0.02, 0.2);
      part(head, GEO.cone, B(0xf0e6c0), 0.06, 0.16, 0.06, 0, 0.22, 0.22, PI / 2, 0, 0);
      addFace(head, L.skin, { socket: true, pupil: 0xffd06a, size: 0.062, brow: 0.1, mouth: "none" });
      break;
    case "troll":
      part(head, GEO.box, M(L.skin, 0.6), 0.44, 0.18, 0.26, 0, -0.16, 0.08);
      part(head, GEO.box, M(0x3f5a2e), 0.48, 0.08, 0.06, 0, 0.14, 0.23);
      for (let i = 0; i < 3; i++) part(head, GEO.cone, M(0x2f4a22), 0.06, 0.24, 0.06, -0.1 + i * 0.1, 0.3, 0.0);
      for (const s of [-1, 1]) {
        part(head, GEO.cone, B(0xf0e6c0), 0.04, 0.16, 0.04, s * 0.1, -0.2, 0.18, 0.2, 0, 0);
        part(head, GEO.cone, M(L.skin, 0.6), 0.07, 0.26, 0.06, s * 0.29, 0.08, 0, 0, 0, -s * 1.2);
      }
      addFace(head, L.skin, { brow: 0.3, mouth: "open", sep: 0.1, size: 0.07, y: 0.04, sclera: 0xf6e8a8, pupil: 0x2a3a14 });
      break;
    case "giant":
      part(head, GEO.box, M(L.skin, 0.6), 0.46, 0.2, 0.26, 0, -0.17, 0.08);
      part(head, GEO.box, M(0x2a1d12), 0.5, 0.08, 0.06, 0, 0.14, 0.23);
      for (let i = 0; i < 4; i++) part(head, GEO.cone, M(0x3a2a1a), 0.06, 0.2, 0.06, -0.1 + i * 0.07, 0.3, 0.0);
      for (const s of [-1, 1]) {
        part(head, GEO.sph, M(L.skin, 0.6), 0.06, 0.09, 0.05, s * 0.27, 0, 0);
        part(head, GEO.cone, B(0xf0e6c0), 0.04, 0.13, 0.04, s * 0.1, -0.2, 0.17, 0.2, 0, 0);
      }
      addFace(head, L.skin, { brow: 0.3, mouth: "open", sep: 0.09, size: 0.07, y: 0.05 });
      break;
    case "elf":
      for (const s of [-1, 1]) part(head, GEO.cone, M(L.skin, 0.6), 0.075, 0.34, 0.07, s * 0.28, 0.12, 0, 0, 0, -s * 1.25);
      dome(0xe8d9a0, 0.288, 0.07, false, 1.0);
      part(head, GEO.cone, M(0xe8d9a0), 0.12, 0.42, 0.12, 0, -0.08, -0.27, 0.35, 0, 0);
      part(head, GEO.ring, steel(0xd6c98a), 0.285, 0.285, 0.285, 0, 0.1, 0, PI / 2 - 0.1, 0, 0);
      part(head, GEO.sph, M(0x4fc27a), 0.04, 0.05, 0.03, 0, 0.18, 0.27);
      addFace(head, L.skin, { sclera: 0xf8f6ea, pupil: 0x2a9a5a, brow: -0.08, mouth: "smile", browColor: 0x9a8350 });
      break;
    case "monk":
      part(head, GEO.box, M(tc), 0.52, 0.09, 0.52, 0, 0.16, 0);
      for (const s of [-1, 1]) part(head, GEO.sph, M(L.skin, 0.6), 0.05, 0.07, 0.04, s * 0.255, -0.01, 0.0);
      addFace(head, L.skin, { brow: -0.1, mouth: "smile", pupil: 0x2a1a10 });
      break;
    case "assassin":
      dome(0x24262e, 0.3, 0.05, false, 1.0);
      part(head, GEO.cone, M(0x24262e), 0.26, 0.4, 0.26, 0, 0.0, -0.2, -1.1, 0, 0);
      part(head, GEO.box, M(0x1b1c22), 0.5, 0.22, 0.34, 0, -0.14, 0.04);
      part(head, GEO.box, M(tc), 0.54, 0.06, 0.54, 0, 0.1, 0);
      addFace(head, L.skin, { size: 0.052, brow: 0.5, mouth: "none", pupil: 0x0d0a08, y: 0.045 });
      break;
    case "mage":
      part(head, GEO.cone, M(0xece7d6, 0.8), 0.1, 0.34, 0.09, 0, -0.27, 0.15, PI, 0, 0);
      part(head, GEO.cone, M(tcd), 0.27, 0.58, 0.27, 0, 0.44, 0, -0.12, 0, 0);
      part(head, GEO.cone, M(tcd), 0.12, 0.3, 0.12, 0, 0.7, -0.07, -0.8, 0, 0);
      part(head, GEO.cyl, M(tcd), 0.46, 0.05, 0.46, 0, 0.2, 0);
      part(head, GEO.ring, steel(GOLD), 0.27, 0.27, 0.27, 0, 0.23, 0, PI / 2, 0, 0);
      addFace(head, L.skin, { brow: -0.05, mouth: "smile", browColor: 0xece7d6 });
      headExtra = 0.55;
      break;
    case "frost":
      part(head, GEO.cone, M(0xe4f2ff, 0.8), 0.1, 0.3, 0.09, 0, -0.26, 0.15, PI, 0, 0);
      part(head, GEO.cone, M(0x3a5f8f), 0.28, 0.6, 0.28, 0, 0.44, 0, -0.16, 0, 0);
      part(head, GEO.cone, M(0x6a9fd8), 0.13, 0.3, 0.13, 0, 0.74, -0.08, -0.7, 0, 0);
      part(head, GEO.cyl, M(0x3a5f8f), 0.47, 0.05, 0.47, 0, 0.2, 0);
      for (const s of [-1, 1]) part(head, GEO.cone, B(0xbfe8ff), 0.05, 0.26, 0.05, s * 0.2, 0.24, -0.05, -0.6, 0, -s * 0.4);
      addFace(head, L.skin, { sclera: 0xeaf6ff, pupil: 0x2a6ad8, brow: -0.06, mouth: "flat", browColor: 0xdceaf5 });
      headExtra = 0.5;
      break;
    case "cleric":
      for (const s of [-1, 1]) part(head, GEO.sph, M(0xcfc6b0), 0.08, 0.1, 0.12, s * 0.22, 0.04, -0.06);
      part(head, GEO.ring, steel(GOLD), 0.3, 0.3, 0.3, 0, 0.58, 0, PI / 2, 0, 0);
      addFace(head, L.skin, { brow: -0.22, mouth: "smile", pupil: 0x3a2a1a });
      headExtra = 0.35;
      break;
    case "zombie":
      part(head, GEO.sph, M(0x4a3325), 0.19, 0.09, 0.09, 0.14, 0.06, 0.2);
      part(head, GEO.box, M(0xe0d8c0), 0.14, 0.12, 0.05, -0.12, 0.2, 0.18, 0, 0, 0.3);
      for (let i = 0; i < 3; i++) part(head, GEO.cone, M(0x3a3224), 0.03, 0.12, 0.03, -0.08 + i * 0.08, 0.28, 0.0);
      part(head, GEO.box, M(L.skin, 0.6), 0.2, 0.05, 0.15, 0, -0.21, 0.1);
      addFace(head, L.skin, { sclera: 0xe6e8a8, pupil: 0x2a2a14, uneven: true, look: 1.2, brow: -0.25, mouth: "open", size: 0.07, browColor: 0x3a3a20 });
      break;
    case "skeleton":
      part(head, GEO.box, M(L.skin, 0.7), 0.28, 0.1, 0.2, 0, -0.22, 0.08);
      for (let i = 0; i < 5; i++) part(head, GEO.box, B(0x2a2418), 0.012, 0.07, 0.01, -0.08 + i * 0.04, -0.2, 0.18);
      addFace(head, L.skin, { socket: true, pupil: tcl, brow: 0.2, mouth: "none", size: 0.06 });
      break;
    case "vampire":
      for (const s of [-1, 1]) part(head, GEO.cone, M(L.skin, 0.6), 0.07, 0.3, 0.07, s * 0.28, 0.1, 0, 0, 0, -s * 1.15);
      dome(0x141018, 0.3, 0.05, false, 1.05);
      part(head, GEO.box, M(0x8a1f2a), 0.06, 0.3, 0.5, 0, 0.28, -0.1, -0.3, 0, 0);
      for (const s of [-1, 1]) part(head, GEO.cone, B(0xf6f2e6), 0.035, 0.14, 0.03, s * 0.07, -0.2, 0.2, 0.1, 0, 0);
      addFace(head, L.skin, { sclera: 0xf2e8e0, pupil: 0x8a1420, brow: 0.2, mouth: "grin", size: 0.06 });
      break;
    case "king":
      dome(0x6d2530, 0.3, 0.06, false, 1.0);
      // crown band + points
      part(head, GEO.cyl, M(GOLD, 0.32, 0.75), 0.3, 0.1, 0.3, 0, 0.12, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(head, GEO.cone, M(GOLD, 0.32, 0.75), 0.055, 0.24, 0.055, Math.cos(a) * 0.26, 0.26, Math.sin(a) * 0.26);
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        part(head, GEO.sph, B(0x8c1f2a), 0.045, 0.045, 0.045, Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26);
      }
      part(head, GEO.box, M(0xf0d9b0), 0.28, 0.16, 0.06, 0, -0.2, 0.16); // beard
      addFace(head, L.skin, { brow: 0.1, mouth: "flat", sclera: 0xf8f2e4, pupil: 0x3a2a18 });
      break;
    case "pirate":
      dome(0x2e2734, 0.29, 0.05, false, 1.0);
      part(head, GEO.box, M(0x8a1f2a), 0.52, 0.14, 0.5, 0, 0.09, 0, 0, 0, 0.06); // bandana
      part(head, GEO.box, M(0x8a1f2a), 0.1, 0.3, 0.08, 0.24, -0.02, -0.12, 0.2, 0, 0.3); // tail
      part(head, GEO.sph, M(0x1c161e), 0.085, 0.085, 0.04, -0.105, 0.035, 0.235); // eyepatch
      part(head, GEO.box, M(0xd8cfb8), 0.04, 0.04, 0.3, 0.12, 0.03, 0.02, 0, 0, 0.2); // strap
      part(head, GEO.box, M(0x4a3828), 0.26, 0.12, 0.12, 0, -0.2, 0.14); // beard
      addFace(head, L.skin, { brow: 0.2, mouth: "grin", size: 0.058 });
      break;
    case "zeus": {
      const hair = 0xf2ede0;
      dome(hair, 0.31, 0.055, false, 1.02);
      part(head, GEO.sph, M(hair, 0.78), 0.33, 0.3, 0.32, 0, -0.02, -0.13);
      for (let i = 0; i < 5; i++) {
        part(head, GEO.box, M(hair, 0.78), 0.09, 0.34, 0.11, -0.24 + i * 0.12, -0.16, -0.14 - i * 0.02, 0.22, 0, (i - 2) * 0.12);
      }
      part(head, GEO.cyl, M(GOLD, 0.3, 0.82), 0.315, 0.07, 0.315, 0, 0.12, 0);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const h = 0.3 + (i % 2) * 0.2;
        part(head, GEO.cone, M(GOLD, 0.28, 0.85), 0.045, h, 0.045, Math.cos(a) * 0.28, 0.22 + h * 0.5, Math.sin(a) * 0.28, 0, 0, Math.cos(a) * 0.2);
        part(head, GEO.sph, B(0x9fd8ff), 0.045, 0.045, 0.045, Math.cos(a) * 0.28, 0.22 + h, Math.sin(a) * 0.28);
      }
      part(head, GEO.box, M(GOLD, 0.3, 0.85), 0.36, 0.12, 0.32, 0, 0.16, 0.05);
      part(head, GEO.sph, B(0x9fd8ff), 0.07, 0.07, 0.05, 0, 0.16, 0.23);
      addFace(head, L.skin, { sclera: 0xbfe6ff, pupil: 0x2c79d8, brow: -0.18, mouth: "smile", size: 0.072, browColor: 0xf2ede0 });
      part(head, GEO.cone, M(hair, 0.8), 0.22, 0.62, 0.19, 0, -0.3, 0.13, PI, 0, 0);
      part(head, GEO.box, M(hair, 0.8), 0.42, 0.13, 0.18, 0, -0.17, 0.11);
      for (let i = 0; i < 4; i++) {
        const t = i - 1.5;
        part(head, GEO.box, M(hair, 0.8), 0.09, 0.34, 0.1, t * 0.1, -0.42 - i * 0.05, 0.06 - i * 0.03, 0.18, 0, t * 0.12);
      }
      for (const sd of [-1, 1]) {
        part(head, GEO.box, M(hair, 0.8), 0.17, 0.09, 0.11, sd * 0.13, -0.17, 0.12, 0, 0, sd * 0.42);
      }
      break;
    }
  }
  detailHead(kind, head, tc, tcl, L.skin);

  // arms
  const bareArms = kind === "berserker" || kind === "giant" || kind === "orc" || kind === "troll" || kind === "monk";
  const mkArm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * (cw / 2 + 0.15), 0.8, 0);
    torso.add(a);
    const t = skel ? 0.09 : 0.2;
    const sleeveC = bareArms ? L.skin : L.armor;
    const foreC = kind === "spear" || kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin"
      ? 0x8b93a1
      : kind === "archer" || kind === "crossbow" || kind === "javelin" || kind === "bonearcher" ? 0x4a3826
      : bareArms ? L.skin : L.armor;
    part(a, GEO.sph, skel ? boneMat(L.skin) : M(sleeveC), t * 0.62, t * 0.62, t * 0.62, 0, -0.02, 0);
    part(a, GEO.box, M(sleeveC), t, 0.42, t * 1.1, 0, -0.19, 0);
    part(a, GEO.sph, armored ? steel(STEEL_LIGHT) : M(foreC), t * 0.56, t * 0.52, t * 0.6, 0, -0.38, -0.01);
    part(a, GEO.box, M(foreC), t * 0.88, 0.36, t * 0.98, 0, -0.5, 0);
    if (kind === "mage" || kind === "cleric" || kind === "frost" || kind === "shaman") part(a, GEO.cone, M(kind === "mage" ? tc : L.armor), 0.2, 0.4, 0.2, 0, -0.5, 0, PI, 0, 0);
    if (bareArms) part(a, GEO.box, M(0x4a3a28), t * 1.1, 0.1, t * 1.1, 0, -0.52, 0);
    part(a, GEO.sph, M(L.skin), 0.095, 0.095, 0.095, 0, -0.72, 0);
    for (const f of [-0.036, 0, 0.036]) part(a, GEO.box, armored ? steel(STEEL_DARK) : M(L.skin), 0.032, 0.06, 0.045, f, -0.77, 0.03, 0.2, 0, 0);
    return a;
  };
  const lArm = mkArm(1), rArm = mkArm(-1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.04);
  rArm.add(hand);

  let handMode: HandMode = "follow";
  let handRest = 0;
  const polearm = (len: number, thick: number, tipLen: number, head?: "axe" | "spear" | "halberd") => {
    part(hand, GEO.cyl, M(0x6b4a2a, 0.7), thick, len, thick, 0, 0, len * 0.35, PI / 2, 0, 0);
    part(hand, GEO.cone, steel(STEEL_DARK), thick * 1.6, 0.18, thick * 1.6, 0, 0, -len * 0.14, -PI / 2, 0, 0);
    part(hand, GEO.cyl, steel(STEEL_LIGHT), thick * 1.45, 0.14, thick * 1.45, 0, 0, len * 0.72, PI / 2, 0, 0);
    if (head === "axe") {
      part(hand, GEO.box, steel(0x8b939f), 0.06, 0.5, 0.44, 0, 0.02, len * 0.78);
      part(hand, GEO.box, steel(STEEL_LIGHT), 0.032, 0.56, 0.12, 0, 0.22, len * 0.8);
      part(hand, GEO.box, steel(0x8b939f), 0.06, 0.3, 0.3, 0, -0.02, len * 0.3);
    } else if (head === "halberd") {
      part(hand, GEO.cone, steel(0xc7cfdb), thick * 2.8, tipLen, thick * 2.8, 0, 0, len * 0.78, PI / 2, 0, 0);
      part(hand, GEO.box, steel(0x8b939f), 0.05, 0.4, 0.3, 0, 0.02, len * 0.72);
      part(hand, GEO.box, steel(STEEL_LIGHT), 0.03, 0.48, 0.09, 0, 0.24, len * 0.72);
      part(hand, GEO.cone, steel(0x8b939f), 0.05, 0.2, 0.05, 0, -0.06, len * 0.62, 0, 0, 0);
    } else {
      part(hand, GEO.cone, steel(0xc7cfdb), thick * 2.8, tipLen, thick * 2.8, 0, 0, len * 0.78, PI / 2, 0, 0);
    }
  };
  const staffWithOrb = (robe: number, glow: number) => {
    part(hand, GEO.cyl, M(0x4a3520), 0.04, 1.75, 0.04, 0, 0, 0.3, PI / 2, 0, 0);
    part(hand, GEO.cone, gold(robe), 0.075, 0.22, 0.075, 0, 0, 1.04, PI / 2, 0, 0);
    part(hand, GEO.sph, B(glow), 0.15, 0.15, 0.15, 0, 0.0, 1.2);
    part(hand, GEO.sph, B(0xffffff), 0.08, 0.08, 0.08, 0, 0.0, 1.2);
    part(hand, GEO.ring, steel(robe), 0.2, 0.2, 0.2, 0, 0.0, 1.2, 0.6, 0.4, 0);
    part(hand, GEO.ring, steel(robe), 0.2, 0.2, 0.2, 0, 0.0, 1.2, 0.0, 0.9, 0.0);
  };

  switch (kind) {
    case "spear": {
      part(lArm, GEO.cyl, M(0x7a5532, 0.7), 0.4, 0.07, 0.4, 0.12, -0.5, 0.2, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(tc), 0.4, 0.4, 0.5, 0.12, -0.5, 0.235);
      part(lArm, GEO.sph, steel(), 0.1, 0.1, 0.07, 0.12, -0.5, 0.26);
      part(lArm, GEO.box, M(tc), 0.06, 0.52, 0.03, 0.12, -0.5, 0.246);
      polearm(2.7, 0.035, 0.46);
      part(hand, GEO.box, M(tc), 0.02, 0.16, 0.34, 0, 0.07, 2.0);
      handMode = "fixed"; handRest = 0.1;
      break;
    }
    case "guardian": {
      part(lArm, GEO.box, steel(), 0.66, 1.0, 0.08, 0.1, -0.42, 0.26);
      part(lArm, GEO.box, M(tc), 0.46, 0.76, 0.09, 0.1, -0.42, 0.265);
      part(lArm, GEO.box, M(GOLD, 0.4, 0.5), 0.34, 0.07, 0.1, 0.1, -0.3, 0.27);
      part(lArm, GEO.dome, steel(), 0.33, 0.14, 0.33, 0.1, 0.08, 0.26, 0, 0, 0);
      part(hand, GEO.box, steel(0xdde3ec), 0.05, 0.13, 0.85, 0, 0, 0.58);
      part(hand, GEO.cone, steel(0xdde3ec), 0.065, 0.14, 0.04, 0, 0, 1.06, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.4, 0.5), 0.34, 0.05, 0.07, 0, 0, 0.14);
      handRest = -0.9;
      break;
    }
    case "archer": case "elf": case "bonearcher": {
      const big = kind === "elf" ? 1.2 : 1;
      part(hand, GEO.tor, M(kind === "bonearcher" ? 0xcabc96 : kind === "elf" ? 0xc8a060 : 0x7a5228), 0.52 * big, 0.52 * big, 0.05, 0, 0, -0.5 * big, 0, PI / 2, PI / 2);
      part(hand, GEO.box, B(0xe6dcb0), 0.02, 1.04 * big, 0.02, 0, 0, -0.5 * big);
      part(hand, GEO.cyl, M(skel ? 0xd8d0b4 : 0xb69250), 0.022, 1.0, 0.022, 0, 0, 0.0, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(), 0.05, 0.14, 0.05, 0, 0, 0.55, PI / 2, 0, 0);
      if (kind === "elf") for (const s of [-1, 1]) part(hand, GEO.sph, M(0x4fc27a), 0.05, 0.12, 0.04, 0, s * 0.62, 0.0);
      handMode = "fixed"; handRest = 0;
      break;
    }
    case "crossbow": {
      part(hand, GEO.box, M(0x6b4a2a), 0.09, 0.1, 0.85, 0, 0, 0.18);
      part(hand, GEO.box, steel(0x5a606c), 0.95, 0.06, 0.07, 0, 0.0, 0.58);
      part(hand, GEO.box, B(0xe6dcb0), 0.9, 0.015, 0.015, 0, 0.0, 0.4);
      part(hand, GEO.cyl, steel(), 0.02, 0.5, 0.02, 0, 0.07, 0.38, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(), 0.04, 0.1, 0.04, 0, 0.07, 0.66, PI / 2, 0, 0);
      handMode = "fixed"; handRest = 0;
      break;
    }
    case "swordsman": {
      part(hand, GEO.box, steel(0xdde3ec), 0.045, 0.1, 1.0, 0, 0, 0.42);
      part(hand, GEO.cone, steel(0xdde3ec), 0.055, 0.16, 0.03, 0, 0, 0.98, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.4, 0.5), 0.24, 0.05, 0.08, 0, 0, -0.04);
      part(lArm, GEO.cyl, M(0x7a5532, 0.8), 0.22, 0.06, 0.22, 0.1, -0.5, 0.14, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(tc), 0.22, 0.22, 0.3, 0.1, -0.5, 0.17);
      handRest = -0.6;
      break;
    }
    case "halberdier": {
      polearm(3.3, 0.04, 0.5, "halberd");
      part(lArm, GEO.cyl, M(0x7a5532, 0.8), 0.34, 0.06, 0.34, 0.12, -0.5, 0.16, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(tc), 0.34, 0.34, 0.42, 0.12, -0.5, 0.19);
      handMode = "fixed"; handRest = 0.1;
      break;
    }
    case "paladin": {
      part(hand, GEO.cyl, M(GOLD, 0.4, 0.6), 0.07, 0.9, 0.07, 0, 0, 0.0, PI / 2, 0, 0);
      part(hand, GEO.box, steel(0xdde3ec), 0.05, 0.12, 0.9, 0, 0.02, 0.6);
      part(hand, GEO.cone, steel(0xdde3ec), 0.07, 0.2, 0.05, 0, 0.02, 1.1, PI / 2, 0, 0);
      part(hand, GEO.box, M(tc), 0.2, 0.24, 0.06, 0, 0.02, 0.16);
      part(lArm, GEO.box, steel(0xd8dbe2), 0.42, 0.66, 0.08, 0.1, -0.42, 0.22);
      part(lArm, GEO.box, M(tc), 0.3, 0.5, 0.09, 0.1, -0.42, 0.225);
      part(lArm, GEO.cone, M(GOLD, 0.35, 0.7), 0.1, 0.26, 0.05, 0.1, -0.06, 0.24, PI / 2, 0, 0);
      handRest = -0.7;
      break;
    }
    case "orc": {
      part(lArm, GEO.cyl, M(0x6a4a2a, 0.8), 0.38, 0.07, 0.38, 0.1, -0.5, 0.2, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(0x8b939f), 0.38, 0.38, 0.5, 0.1, -0.5, 0.235);
      for (let i = 0; i < 4; i++) part(lArm, GEO.cone, steel(0x8b939f), 0.05, 0.14, 0.05, 0.1 + Math.cos(i * 1.57) * 0.24, -0.5 + Math.sin(i * 1.57) * 0.24, 0.26, PI / 2, 0, 0);
      polearm(1.1, 0.05, 0.2, "axe");
      part(hand, GEO.sph, M(0xd7a64a, 0.4, 0.7), 0.06, 0.06, 0.06, 0, 0, 0.0);
      handRest = -1.1;
      break;
    }
    case "berserker": {
      polearm(0.95, 0.045, 0.2, "axe");
      part(lArm, GEO.cyl, M(0x5d4226), 0.045, 0.85, 0.045, 0, -0.74, 0.28, PI / 2 - 0.5, 0, 0);
      part(lArm, GEO.box, steel(0x9aa3b2), 0.05, 0.36, 0.3, 0, -0.5, 0.64, -0.5, 0, 0);
      handRest = -1.0;
      break;
    }
    case "javelin": {
      part(hand, GEO.cyl, M(0x9a7a4a), 0.032, 1.7, 0.032, 0.1, 0, 0.3, PI / 2, 0, 0);
      part(hand, GEO.cone, steel(0xc7cfdb), 0.075, 0.36, 0.075, 0.1, 0, 1.2, PI / 2, 0, 0);
      part(lArm, GEO.cyl, M(0x9a7a4a), 0.03, 1.5, 0.03, -0.16, -0.2, 0.2, PI / 2, 0, 0);
      part(lArm, GEO.cone, steel(0xc7cfdb), 0.07, 0.3, 0.07, -0.16, -0.2, 0.98, PI / 2, 0, 0);
      handMode = "fixed"; handRest = -0.2;
      break;
    }
    case "bomber": {
      part(hand, GEO.sph, M(0x25252a, 0.5, 0.2), 0.2, 0.2, 0.2, 0, 0.12, 0.18);
      part(hand, GEO.cyl, M(0xa58a5a), 0.02, 0.14, 0.02, 0, 0.35, 0.18);
      part(hand, GEO.sph, B(0xffb050), 0.06, 0.06, 0.06, 0, 0.44, 0.18);
      part(hand, GEO.sph, B(0xfff0a0), 0.03, 0.03, 0.03, 0, 0.46, 0.18);
      handRest = 0;
      break;
    }
    case "shaman": {
      part(hand, GEO.cyl, M(0x4a3520), 0.04, 1.6, 0.04, 0, 0, 0.28, PI / 2, 0, 0);
      part(hand, GEO.sph, M(0xe8e0c8), 0.14, 0.14, 0.14, 0, 0.0, 1.12);
      part(hand, GEO.box, B(0x1a140c), 0.1, 0.06, 0.06, 0, 0.14, 1.12);
      part(hand, GEO.cone, B(0x8fe06a), 0.05, 0.12, 0.05, 0, -0.12, 1.12, PI / 2, 0, 0);
      handMode = "fixed"; handRest = -1.4;
      break;
    }
    case "troll": {
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.14, 2.3, 0.14, 0, 0, 0.9, PI / 2, 0, 0);
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.24, 0.9, 0.24, 0, 0, 1.9, PI / 2, 0, 0);
      for (let i = 0; i < 5; i++) part(hand, GEO.cone, steel(0x7a808c), 0.06, 0.2, 0.06, Math.cos(i * 1.05) * 0.26, Math.sin(i * 1.05) * 0.26, 1.9, 0, 0, 0);
      handRest = -1.1;
      break;
    }
    case "giant": {
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.17, 2.6, 0.17, 0, 0, 1.0, PI / 2, 0, 0);
      part(hand, GEO.cyl, M(0x6a4a2a, 0.9), 0.28, 1.0, 0.28, 0, 0, 2.1, PI / 2, 0, 0);
      for (let i = 0; i < 6; i++) part(hand, GEO.cone, steel(0x7a808c), 0.07, 0.2, 0.07, Math.cos(i * 1.05) * 0.3, Math.sin(i * 1.05) * 0.3, 2.1, 0, 0, 0);
      handRest = -1.1;
      break;
    }
    case "monk": {
      for (const arm of [lArm, rArm]) for (const f of [0, 1, 2, 3]) {
        part(arm, GEO.box, M(L.skin, 0.6), 0.035, 0.13, 0.035, (f - 1.5) * 0.045, -0.8, 0.02, 0.1, 0, 0);
      }
      handRest = -0.3;
      break;
    }
    case "assassin": {
      part(hand, GEO.box, steel(0xd9dfe8), 0.04, 0.09, 0.5, 0, 0, 0.36);
      part(hand, GEO.cone, steel(0xd9dfe8), 0.05, 0.1, 0.03, 0, 0, 0.66, PI / 2, 0, 0);
      part(hand, GEO.box, M(0x14151a), 0.18, 0.04, 0.05, 0, 0, 0.1);
      part(lArm, GEO.box, steel(0xd9dfe8), 0.04, 0.09, 0.45, 0, -0.62, 0.34, -0.9, 0, 0);
      handRest = -0.9;
      break;
    }
    case "mage": staffWithOrb(GOLD, team === 0 ? 0xd9a8ff : 0xffc0a0); handMode = "fixed"; handRest = -1.45; break;
    case "frost": staffWithOrb(0x8fc0f0, 0x9fe0ff); handMode = "fixed"; handRest = -1.45; break;
    case "cleric": {
      part(hand, GEO.cyl, M(0xe0d8c0), 0.04, 1.6, 0.04, 0, 0, 0.3, PI / 2, 0, 0);
      part(hand, GEO.ring, steel(GOLD), 0.2, 0.2, 0.2, 0, 0.0, 1.15, 0, PI / 2, 0);
      part(hand, GEO.sph, B(0xfff2b0), 0.1, 0.1, 0.1, 0, 0.0, 1.15);
      part(hand, GEO.box, M(GOLD, 0.4, 0.5), 0.05, 0.3, 0.05, 0, 0.0, 1.15, 0, 0, 0);
      handMode = "fixed"; handRest = -1.45;
      break;
    }
    case "king": {
      part(hand, GEO.cyl, M(0x6b4a2a, 0.7), 0.045, 1.5, 0.045, 0, 0, 0.7, PI / 2, 0, 0);
      part(hand, GEO.box, steel(0xe4e9f2), 0.05, 0.13, 1.5, 0, 0, 0.95);
      part(hand, GEO.cone, steel(0xe4e9f2), 0.07, 0.28, 0.035, 0, 0, 1.78, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.35, 0.7), 0.3, 0.05, 0.08, 0, 0, 0.28);
      part(hand, GEO.sph, M(GOLD, 0.3, 0.8), 0.08, 0.08, 0.08, 0, 0, 0.28);
      // scepter in the left hand
      part(lArm, GEO.cyl, M(GOLD, 0.35, 0.7), 0.04, 1.7, 0.04, 0.08, -0.5, 0.2, PI / 2 - 0.4, 0, 0);
      part(lArm, GEO.sph, B(0xffe27a), 0.12, 0.12, 0.12, 0.08, -0.5, 0.85);
      handMode = "fixed"; handRest = -0.2;
      break;
    }
    case "pirate": {
      part(hand, GEO.box, M(0x3a2c22, 0.7), 0.07, 0.12, 0.4, 0, 0, 0.4);
      part(hand, GEO.cyl, M(0x8a8f98, 0.35, 0.8), 0.035, 0.5, 0.035, 0, 0, 0.72, PI / 2, 0, 0);
      part(hand, GEO.box, M(0x6b4a2a, 0.7), 0.06, 0.16, 0.1, 0, -0.08, 0.28);
      part(hand, GEO.sph, M(GOLD, 0.35, 0.75), 0.045, 0.045, 0.045, 0, 0.12, 0.34);
      handMode = "fixed"; handRest = -0.15;
      break;
    }
    case "zeus": {
      part(hand, GEO.cyl, M(0xd8cfa8, 0.8), 0.05, 2.1, 0.05, 0, 0, 0.95, PI / 2, 0, 0);
      for (let i = 0; i < 3; i++) part(hand, GEO.cyl, M(GOLD, 0.3, 0.8), 0.085, 0.07, 0.085, 0, 0, 0.2 + i * 0.35, PI / 2, 0, 0);
      part(hand, GEO.sph, B(0xe4f2ff), 0.17, 0.17, 0.17, 0, 0, 1.82);
      part(hand, GEO.sph, B(0x9fd8ff), 0.1, 0.1, 0.1, 0, 0, 1.82);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const spike = part(hand, GEO.cone, M(GOLD, 0.28, 0.85), 0.045, 0.3, 0.045,
          Math.cos(a) * 0.13, Math.sin(a) * 0.13, 1.82);
        spike.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      }
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const bx = Math.cos(a), by = Math.sin(a);
        for (let seg = 0; seg < 3; seg++) {
          const r0 = 0.34 + seg * 0.28;
          const jitter = (seg % 2 ? 1 : -1) * 0.14;
          const arc = part(hand, GEO.box, B(0xe6f2ff), 0.038, 0.038, 0.34,
            bx * r0 + by * jitter, by * r0 - bx * jitter, 1.82);
          arc.rotation.z = a;
        }
      }
      part(hand, GEO.ring, M(GOLD, 0.3, 0.8), 0.36, 0.36, 0.36, 0, 0, 1.82, 0, PI / 2, 0);
      part(hand, GEO.ring, M(GOLD, 0.3, 0.8), 0.52, 0.52, 0.52, 0, 0, 1.82, 0, PI / 2, 0);
      handMode = "fixed"; handRest = -1.3;
      break;
    }
    case "skeleton": {
      part(hand, GEO.box, steel(0x8c8f8a), 0.05, 0.12, 0.95, 0, 0, 0.55);
      part(hand, GEO.box, M(0x5a4630), 0.3, 0.05, 0.07, 0, 0, 0.1);
      part(lArm, GEO.cyl, M(0x7a5532, 0.8), 0.3, 0.06, 0.3, 0.1, -0.5, 0.18, PI / 2, 0, 0);
      part(lArm, GEO.ring, steel(0x8c8f8a), 0.3, 0.3, 0.45, 0.1, -0.5, 0.21);
      handRest = -1.0;
      break;
    }
    case "vampire": {
      part(hand, GEO.box, steel(0xe8ecf2), 0.04, 0.1, 1.1, 0, 0, 0.45);
      part(hand, GEO.cone, steel(0xe8ecf2), 0.05, 0.18, 0.03, 0, 0, 1.06, PI / 2, 0, 0);
      part(hand, GEO.box, M(GOLD, 0.35, 0.7), 0.26, 0.05, 0.09, 0, 0, -0.02);
      part(hand, GEO.box, B(0x8a1420), 0.16, 0.03, 0.04, 0.2, 0.02, 0.2);
      handRest = -0.6;
      break;
    }
    case "zombie":
      for (const arm of [lArm, rArm]) for (let f = -1; f <= 1; f++) part(arm, GEO.box, M(L.skin, 0.6), 0.045, 0.15, 0.045, f * 0.055, -0.82, 0.08);
      break;
  }
  detailWeapons(kind, hand, lArm, rArm, tcl);

  const headH = (hipY + 1.45 + 0.28 * L.head + headExtra) * L.scale;
  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak, headH, heavy: kind === "giant" || kind === "troll",
    scale: L.scale, tilt: L.tilt, kind, handMode, handRest, parts: [], fx: {},
  };
}

function detailTorso(kind: HumanKind, t: THREE.Group, cw: number, tc: number) {
  const P = part, B0 = GEO.box, S0 = GEO.sph, C0 = GEO.cyl, K0 = GEO.cone, R0 = GEO.ring;
  if (kind === "spear" || kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin" || kind === "king") {
    const m = kind === "king" ? gold() : kind === "paladin" ? steel(0xe2e6ee) : steel(STEEL_LIGHT);
    P(t, C0, m, 0.21, 0.14, 0.21, 0, 0.85, 0.01);
    P(t, B0, gold(BRASS), 0.06, 0.42, cw * 0.69, 0, 0.56, 0);
    for (const s of [-1, 1]) {
      P(t, B0, m, 0.22, 0.24, 0.055, s * 0.21, -0.1, cw * 0.32, 0, 0, -s * 0.09);
      P(t, R0, gold(BRASS), 0.22, 0.22, 0.22, s * (cw / 2 + 0.11), 0.71, 0, PI / 2, 0, 0);
    }
  }
  if (kind === "swordsman" || kind === "archer" || kind === "crossbow") P(t, C0, leather(LEATHER_DARK), 0.032, 0.34, 0.024, cw * 0.45, -0.05, 0.02, 0.55, 0, -0.18);
  if (kind === "paladin") { P(t, S0, B(0x8ff4ff), 0.068, 0.068, 0.045, 0, 0.6, cw * 0.37); P(t, R0, gold(), 0.26, 0.26, 0.26, 0, 1.02, -0.22); }
  if (kind === "king") {
    P(t, B0, cloth(0xf7f4eb), cw + 0.18, 0.2, cw * 0.76, 0, 0.8, -0.02);
    P(t, S0, B(0xff4a5a), 0.072, 0.072, 0.05, 0, 0.62, cw * 0.35);
    for (let i = -2; i <= 2; i++) P(t, B0, B(0x1c1816), 0.028, 0.045, 0.02, i * 0.18, 0.78, cw * 0.38);
  }
  if (kind === "pirate") {
    P(t, B0, cloth(0xdfd6c2), cw * 0.48, 0.72, cw * 0.65, 0, 0.46, 0.01);
    P(t, B0, cloth(0x9a202c), cw * 0.96, 0.16, cw * 0.67, 0, 0.12, 0);
    P(t, B0, leather(0x3a2618), 0.1, 0.88, cw * 0.68, 0, 0.46, 0, 0, 0, -0.48);
    for (const s of [-1, 1]) P(t, B0, gold(), 0.06, 0.68, cw * 0.67, s * 0.16, 0.46, 0.01);
  }
  if (kind === "zeus") {
    P(t, B0, gold(), cw + 0.06, 0.14, cw * 0.68, 0, 0.52, 0, 0, 0, -0.52);
    P(t, S0, B(0x9fe0ff), 0.085, 0.085, 0.05, 0, 0.1, cw * 0.35);
    P(t, S0, gold(), 0.28, 0.2, 0.28, cw / 2 + 0.12, 0.78, 0);
  }
  if (kind === "orc" || kind === "berserker") for (const s of [-1, 1]) P(t, S0, M(0x6e8a48, 0.65), 0.19, 0.15, 0.1, s * 0.18, 0.63, cw * 0.3);
  if (kind === "troll") for (let i = 0; i < 3; i++) P(t, K0, M(0x3a542a), 0.05, 0.14, 0.05, 0, 0.36 + i * 0.15, -cw * 0.34, -PI / 2, 0, 0);
  if (kind === "giant") P(t, R0, steel(IRON), 0.14, 0.14, 0.14, 0, 0.06, cw * 0.36);
  if (kind === "assassin") for (let i = 0; i < 3; i++) P(t, K0, steel(STEEL_LIGHT), 0.022, 0.14, 0.015, -0.08 + i * 0.07, 0.56 - i * 0.06, cw * 0.34, 0, 0, -0.5);
  if (kind === "vampire") {
    P(t, B0, cloth(0x1a1220), 0.56, 0.34, 0.06, 0, 0.96, -0.14, -0.25, 0, 0);
    P(t, S0, B(0xff2a3c), 0.064, 0.084, 0.042, 0, 0.46, cw * 0.36);
  }
  if (kind === "monk") for (let i = 0; i < 8; i++) P(t, S0, M(i % 2 === 0 ? 0x5c3818 : GOLD, 0.5, 0.3), 0.05, 0.05, 0.05, Math.cos(i * PI / 4) * 0.23, 0.78, Math.sin(i * PI / 4) * 0.21);
  void tc;
}

function detailHead(kind: HumanKind, h: THREE.Group, tc: number, tcl: number, skin: number) {
  const P = part, B0 = GEO.box, S0 = GEO.sph, C0 = GEO.cyl, K0 = GEO.cone, R0 = GEO.ring;
  if (kind === "spear" || kind === "guardian" || kind === "swordsman" || kind === "halberdier" || kind === "paladin") {
    P(h, B0, gold(BRASS), 0.055, 0.075, 0.22, 0, 0.28, -0.02);
    for (let i = 0; i < 3; i++) P(h, K0, cloth(i % 2 === 0 ? tc : tcl), 0.045, 0.18, 0.065, 0, 0.36 - i * 0.035, -0.18 - i * 0.07, -0.85 - i * 0.15, 0, 0);
  }
  if (kind === "paladin") for (const s of [-1, 1]) P(h, K0, gold(GOLD_LIGHT), 0.055, 0.28, 0.055, s * 0.31, 0.24, -0.08, -0.35, 0, -s * 0.55);
  if (kind === "orc" || kind === "berserker" || kind === "giant") P(h, B0, M(dark(skin, 0.62), 0.7), 0.016, 0.14, 0.02, -0.095, 0.01, 0.242, 0, 0, 0.18);
  if (kind === "bomber") for (const s of [-1, 1]) P(h, S0, B(0x7fe8ff), 0.068, 0.068, 0.03, s * 0.105, 0.04, 0.245);
  if (kind === "shaman") for (const s of [-1, 1]) P(h, K0, boneMat(0xd4cbb0), 0.075, 0.36, 0.075, s * 0.32, 0.18, 0.0, 0.2, 0, -s * 0.85);
  if (kind === "pirate") {
    P(h, C0, leather(0x241c28), 0.44, 0.06, 0.44, 0, 0.18, 0, -0.08, 0, 0);
    P(h, B0, gold(), 0.46, 0.025, 0.46, 0, 0.2, 0, -0.08, 0, 0);
    P(h, K0, B(0xf8f4e8), 0.05, 0.26, 0.08, -0.22, 0.3, -0.05, -0.35, 0, 0.45);
    P(h, R0, gold(), 0.042, 0.042, 0.042, 0.275, -0.06, 0.02);
  }
  if (kind === "king") {
    P(h, R0, cloth(0xf7f4eb), 0.31, 0.31, 0.22, 0, 0.08, 0, PI / 2, 0, 0);
    P(h, B0, gold(), 0.045, 0.1, 0.045, 0, 0.4, 0);
    P(h, B0, gold(), 0.09, 0.04, 0.045, 0, 0.41, 0);
  }
}

function detailWeapons(kind: HumanKind, hand: THREE.Group, lArm: THREE.Group, rArm: THREE.Group, tcl: number) {
  const P = part, B0 = GEO.box, S0 = GEO.sph, K0 = GEO.cone, R0 = GEO.ring;
  if (kind === "spear" || kind === "swordsman" || kind === "halberdier" || kind === "orc" || kind === "skeleton") {
    const r = kind === "swordsman" ? 0.22 : kind === "skeleton" ? 0.3 : 0.36;
    P(lArm, S0, steel(STEEL_LIGHT), r * 0.28, r * 0.28, 0.08, 0.11, -0.5, 0.22);
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (PI / 2);
      P(lArm, S0, gold(BRASS), 0.026, 0.026, 0.024, 0.11 + Math.cos(a) * r * 0.78, -0.5 + Math.sin(a) * r * 0.78, 0.21);
    }
  }
  if (kind === "guardian" || kind === "swordsman" || kind === "paladin" || kind === "king" || kind === "vampire") {
    P(hand, S0, gold(), 0.062, 0.062, 0.062, 0, 0, -0.14);
    P(hand, B0, steel(STEEL_DARK), 0.052, 0.032, 0.68, 0, 0, 0.52);
  }
  if (kind === "archer" || kind === "elf" || kind === "bonearcher") {
    P(hand, B0, B(tcl), 0.055, 0.014, 0.14, 0, 0, -0.44);
    P(hand, B0, B(tcl), 0.014, 0.055, 0.14, 0, 0, -0.44);
  }
  if (kind === "crossbow") { P(hand, R0, steel(IRON), 0.11, 0.11, 0.11, 0, 0.0, 0.72, PI / 2, 0, 0); P(hand, B0, B(tcl), 0.05, 0.014, 0.1, 0, 0.07, 0.18); }
  if (kind === "pirate") {
    P(hand, K0, gold(BRASS), 0.065, 0.14, 0.065, 0, 0, 1.0, -PI / 2, 0, 0);
    P(lArm, B0, gold(BRASS), 0.12, 0.14, 0.08, 0, -0.72, 0.16);
    P(lArm, B0, steel(STEEL_LIGHT), 0.035, 0.08, 0.58, 0, -0.62, 0.44, -0.35, 0, 0);
  }
  if (kind === "monk") for (const arm of [lArm, rArm]) P(arm, R0, gold(), 0.13, 0.13, 0.13, 0, -0.62, 0.01, PI / 2, 0, 0);
  if (kind === "frost") for (let i = 0; i < 4; i++) P(hand, K0, B(0xd8f4ff), 0.035, 0.22, 0.035, Math.cos(i * PI / 2) * 0.18, Math.sin(i * PI / 2) * 0.18, 1.3, PI / 2, 0, 0);
}

/* ============ machines: purpose-built, non-humanoid rigs ============ */

function buildRobot(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const shell = 0x9aa6b4, shellDark = 0x5e6a79, trim = 0x2f3a48;
  const glow = team === 0 ? 0x7fe8ff : 0xffb07f;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.26, 0.98, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.26, 0.98, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.box, M(shellDark, 0.5, 0.55), 0.3, 0.62, 0.34, 0, -0.3, 0);
    part(g, GEO.box, M(trim, 0.6, 0.4), 0.34, 0.16, 0.44, 0, -0.66, 0.04);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.24, 0.26, 0.26, 0, 0.08, 0);
    part(g, GEO.cyl, steel(STEEL_LIGHT), 0.14, 0.28, 0.14, 0, -0.36, 0.03, 0, 0, PI / 2);
    part(g, GEO.cyl, gold(COPPER), 0.045, 0.38, 0.045, 0, -0.44, -0.17);
    part(g, GEO.sph, B(glow), 0.07, 0.07, 0.07, 0, -0.36, 0.19);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 1.0, 0);
  body.add(torso);
  part(torso, GEO.box, M(shell, 0.42, 0.6), 0.92, 0.86, 0.6, 0, 0.42, 0);
  part(torso, GEO.box, M(trim, 0.5, 0.45), 0.96, 0.22, 0.64, 0, 0.62, 0);
  part(torso, GEO.box, M(tcd, 0.45, 0.4), 0.3, 0.5, 0.66, 0, 0.36, 0);
  part(torso, GEO.box, M(shellDark, 0.45, 0.55), 0.7, 0.2, 0.5, 0, 0.06, 0);
  part(torso, GEO.ring, steel(STEEL_LIGHT), 0.16, 0.16, 0.16, 0, 0.52, 0.33);
  part(torso, GEO.sph, B(glow), 0.12, 0.12, 0.06, 0, 0.52, 0.33);
  for (const y of [0.32, 0.38, 0.68]) part(torso, GEO.box, B(glow), 0.26, 0.022, 0.02, 0, y, 0.335);
  for (const s of [-1, 1]) {
    part(torso, GEO.cyl, steel(shellDark), 0.11, 0.22, 0.11, s * 0.18, 0.34, -0.42, 0.35, 0, 0);
    part(torso, GEO.sph, B(0xff8442), 0.075, 0.075, 0.05, s * 0.18, 0.26, -0.46);
  }
  part(torso, GEO.cyl, M(0x8f9aa8, 0.35, 0.7), 0.09, 0.5, 0.09, 0.22, 0.86, -0.1);
  part(torso, GEO.sph, B(team === 0 ? 0x9ff0ff : 0xffc89f), 0.1, 0.1, 0.1, 0.22, 1.14, -0.1);

  const head = new THREE.Group();
  head.position.set(0, 1.06, 0);
  torso.add(head);
  part(head, GEO.box, M(shell, 0.4, 0.6), 0.62, 0.44, 0.52);
  part(head, GEO.box, M(trim, 0.35, 0.5), 0.5, 0.12, 0.06, 0, 0.02, 0.28);
  part(head, GEO.sph, B(team === 0 ? 0x8ff4ff : 0xffb488), 0.09, 0.08, 0.06, 0.15, 0.04, 0.28);
  part(head, GEO.sph, B(team === 0 ? 0x8ff4ff : 0xffb488), 0.09, 0.08, 0.06, -0.15, 0.04, 0.28);
  part(head, GEO.cyl, M(0x8f9aa8, 0.35, 0.7), 0.03, 0.36, 0.03, 0.22, 0.36, 0);
  part(head, GEO.sph, B(0xff6a6a), 0.07, 0.07, 0.07, 0.22, 0.55, 0);

  const lArm = new THREE.Group(); lArm.position.set(0.6, 0.72, 0); torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(-0.6, 0.72, 0); torso.add(rArm);
  for (const g of [lArm, rArm]) {
    part(g, GEO.box, M(shellDark, 0.45, 0.55), 0.28, 0.5, 0.3, 0, -0.22, 0);
    part(g, GEO.sph, steel(STEEL_LIGHT), 0.13, 0.13, 0.14, 0, -0.4, 0);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.24, 0.42, 0.26, 0, -0.58, 0.02);
    part(g, GEO.box, M(trim, 0.5, 0.5), 0.28, 0.14, 0.3, 0, -0.78, 0.02);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.04);
  rArm.add(hand);
  part(hand, GEO.box, M(0x6b7480, 0.35, 0.75), 0.09, 0.16, 0.9, 0, 0, 0.5);
  part(hand, GEO.cone, steel(STEEL_LIGHT), 0.08, 0.24, 0.06, 0, 0, 1.04, PI / 2, 0, 0);
  part(hand, GEO.box, B(glow), 0.095, 0.04, 0.88, 0, -0.065, 0.5);
  part(hand, GEO.box, M(0x2f3a48, 0.5, 0.4), 0.12, 0.1, 0.3, 0, 0, 0.16);
  part(hand, GEO.box, B(0xff7a6a), 0.05, 0.05, 0.05, 0.07, 0, 0.2);

  const cloak = new THREE.Group();
  cloak.position.set(0, 0.8, -0.3);
  torso.add(cloak);
  part(cloak, GEO.box, M(tcd), 0.5, 0.5, 0.04, 0, -0.24, 0);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak,
    headH: 2.9, heavy: false, scale: 1, tilt: 0.02, kind: "robot",
    handMode: "follow", handRest: 0, parts: [], fx: {},
  };
}

function buildTank(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const hull = 0x6d7a58, hullDark = 0x4a5340, steelC = 0x59636f;
  const glow = team === 0 ? 0x8ff4ff : 0xffb488;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.62, 0.5, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.62, 0.5, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.box, M(0x2b2f36, 0.85, 0.2), 0.34, 0.62, 1.9, 0, -0.12, 0);
    part(g, GEO.box, M(hullDark, 0.65, 0.35), 0.38, 0.22, 2.04, 0, 0.08, 0);
    for (let i = 0; i < 6; i++) {
      const wz = -0.75 + i * 0.3;
      part(g, GEO.cyl, M(0x3d434c, 0.6, 0.5), 0.22, 0.36, 0.22, 0, -0.22, wz, 0, 0, PI / 2);
      part(g, GEO.cyl, steel(STEEL_LIGHT), 0.09, 0.38, 0.09, 0, -0.22, wz, 0, 0, PI / 2);
    }
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.72, 0);
  body.add(torso);
  // low, long hull with a small turret: reads as a tank, not a barrel
  part(torso, GEO.box, M(hull, 0.7, 0.3), 1.42, 0.5, 2.5, 0, 0.16, 0);
  part(torso, GEO.box, M(hullDark, 0.7, 0.3), 1.46, 0.16, 2.1, 0, 0.38, -0.05);
  part(torso, GEO.box, M(hullDark, 0.7, 0.3), 1.2, 0.22, 0.6, 0, 0.16, 1.42); // glacis
  for (const s of [-1, 1]) {
    part(torso, GEO.sph, B(glow), 0.065, 0.065, 0.04, s * 0.46, 0.34, 1.54);
    part(torso, GEO.cyl, steel(0x3a404a), 0.08, 0.42, 0.08, s * 0.42, 0.34, -1.26, 0, 0, PI / 2);
    part(torso, GEO.sph, B(0xff7a38), 0.055, 0.055, 0.04, s * 0.58, 0.34, -1.28);
  }
  part(torso, GEO.box, M(tcd, 0.6, 0.3), 0.5, 0.08, 1.4, 0, 0.42, -0.15);
  part(torso, GEO.box, M(steelC, 0.45, 0.6), 0.78, 0.34, 1.0, 0, 0.6, -0.15); // turret
  part(torso, GEO.box, steel(STEEL_DARK), 0.42, 0.28, 0.32, 0, 0.64, 0.46);
  part(torso, GEO.cyl, M(hullDark, 0.5, 0.4), 0.3, 0.16, 0.3, 0, 0.8, -0.15);
  part(torso, GEO.cyl, M(steelC, 0.4, 0.7), 0.075, 2.0, 0.075, 0, 0.66, 1.2, PI / 2, 0, 0); // barrel
  part(torso, GEO.cyl, steel(STEEL_LIGHT), 0.115, 0.34, 0.115, 0, 0.66, 1.42, PI / 2, 0, 0);
  part(torso, GEO.cyl, M(steelC, 0.4, 0.7), 0.1, 0.22, 0.1, 0, 0.66, 2.05, PI / 2, 0, 0);
  part(torso, GEO.sph, B(glow), 0.06, 0.06, 0.06, 0.26, 0.78, 0.36);
  part(torso, GEO.box, M(0x2b2f36, 0.6, 0.3), 0.22, 0.24, 0.08, 0.4, 0.72, -0.15);

  const head = new THREE.Group();
  head.position.set(0, 0.7, 0);
  torso.add(head);
  part(head, GEO.box, M(steelC, 0.4, 0.65), 0.5, 0.28, 0.44, 0, 0.5, 0.06);
  part(head, GEO.box, B(0x1a2028), 0.36, 0.12, 0.04, 0, 0.52, 0.3);
  part(head, GEO.sph, B(glow), 0.06, 0.06, 0.05, 0.12, 0.52, 0.32);
  part(head, GEO.sph, B(glow), 0.06, 0.06, 0.05, -0.12, 0.52, 0.32);

  const lArm = new THREE.Group(); lArm.position.set(0.78, 0.5, 0.1); torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(-0.78, 0.5, 0.1); torso.add(rArm);
  for (const g of [lArm, rArm]) {
    part(g, GEO.box, M(hullDark, 0.5, 0.5), 0.22, 0.34, 0.3, 0, -0.14, 0);
    part(g, GEO.box, M(steelC, 0.45, 0.6), 0.18, 0.3, 0.22, 0, -0.42, 0.02);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.04);
  rArm.add(hand);
  part(hand, GEO.box, M(steelC, 0.35, 0.8), 0.16, 0.16, 0.5, 0, 0, 0.3);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 2.6, heavy: true, scale: 1, tilt: 0.02, kind: "tank",
    handMode: "fixed", handRest: -0.2, parts: [], fx: {},
  };
}

function buildRailgun(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const shell = 0x6f7d8c, trim = 0x28303a, accent = team === 0 ? 0x7fe8ff : 0xffb07f;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  const lLeg = new THREE.Group(); lLeg.position.set(0.24, 0.92, 0); body.add(lLeg);
  const rLeg = new THREE.Group(); rLeg.position.set(-0.24, 0.92, 0); body.add(rLeg);
  for (const g of [lLeg, rLeg]) {
    part(g, GEO.box, M(trim, 0.5, 0.5), 0.22, 0.66, 0.26, 0, -0.32, 0);
    part(g, GEO.sph, steel(STEEL_LIGHT), 0.12, 0.12, 0.13, 0, -0.34, 0.02);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.26, 0.2, 0.36, 0, -0.68, 0.06);
    part(g, GEO.box, B(accent), 0.16, 0.03, 0.04, 0, -0.34, 0.14);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 0.94, 0);
  body.add(torso);
  part(torso, GEO.box, M(shell, 0.42, 0.6), 0.7, 0.72, 0.5, 0, 0.38, 0);
  part(torso, GEO.box, M(trim, 0.5, 0.5), 0.74, 0.2, 0.54, 0, 0.6, 0);
  part(torso, GEO.box, M(tcd, 0.4, 0.4), 0.34, 0.34, 0.54, 0, 0.36, 0);
  part(torso, GEO.box, B(accent), 0.24, 0.05, 0.03, 0, 0.46, 0.28);
  part(torso, GEO.box, M(0x39424f, 0.5, 0.5), 0.5, 0.34, 0.24, 0.16, 0.42, -0.34); // battery pack
  part(torso, GEO.cyl, M(0x39424f, 0.4, 0.6), 0.09, 0.5, 0.09, -0.2, 0.5, -0.36);
  part(torso, GEO.cyl, B(accent), 0.08, 0.14, 0.08, -0.2, 0.56, -0.38);

  const head = new THREE.Group();
  head.position.set(0, 0.8, 0);
  torso.add(head);
  part(head, GEO.box, M(shell, 0.38, 0.62), 0.44, 0.34, 0.44);
  part(head, GEO.box, B(0x141a22), 0.34, 0.1, 0.04, 0, 0.02, 0.24);
  part(head, GEO.sph, B(accent), 0.07, 0.06, 0.05, 0.11, 0.03, 0.25);
  part(head, GEO.sph, B(accent), 0.07, 0.06, 0.05, -0.11, 0.03, 0.25);
  part(head, GEO.box, M(0x8f9aa8, 0.35, 0.7), 0.05, 0.34, 0.05, 0.18, 0.28, -0.1);
  part(head, GEO.sph, B(accent), 0.05, 0.05, 0.05, 0.18, 0.48, -0.1);

  const lArm = new THREE.Group(); lArm.position.set(0.46, 0.66, 0); torso.add(lArm);
  const rArm = new THREE.Group(); rArm.position.set(-0.46, 0.66, 0); torso.add(rArm);
  for (const g of [lArm, rArm]) {
    part(g, GEO.box, M(trim, 0.45, 0.55), 0.2, 0.42, 0.22, 0, -0.2, 0);
    part(g, GEO.box, M(shell, 0.4, 0.6), 0.17, 0.36, 0.19, 0, -0.5, 0.02);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.04);
  rArm.add(hand);
  part(hand, GEO.box, M(trim, 0.4, 0.7), 0.14, 0.14, 1.9, 0, 0, 0.9); // rail
  part(hand, GEO.box, M(0x8f9aa8, 0.3, 0.85), 0.06, 0.06, 1.7, 0.06, 0.04, 0.9);
  part(hand, GEO.box, M(0x8f9aa8, 0.3, 0.85), 0.06, 0.06, 1.7, -0.06, 0.04, 0.9);
  part(hand, GEO.box, B(accent), 0.045, 0.04, 1.68, 0, 0.02, 0.92);
  for (let i = 0; i < 5; i++) {
    part(hand, GEO.box, gold(COPPER), 0.2, 0.16, 0.055, 0, 0, 0.58 + i * 0.28);
    part(hand, GEO.box, B(accent), 0.21, 0.04, 0.035, 0, 0, 0.58 + i * 0.28);
  }
  part(hand, GEO.box, B(accent), 0.05, 0.05, 0.05, 0.07, 0.04, 1.8);

  return {
    root, body, torso, head, hand, lLeg, rLeg, lArm, rArm, cloak: null,
    headH: 2.7, heavy: false, scale: 1, tilt: 0.02, kind: "railgun",
    handMode: "fixed", handRest: -1.15, parts: [], fx: {},
  };
}

/* ============ cavalry ============ */

function buildKnight(team: TeamId): UnitRig {
  const tc = TEAM_COLORS[team], tcd = dark(tc);
  const horseC = team === 0 ? 0x8a6038 : 0x5a4a3c;
  const skin = 0xe6b88e;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  root.add(body);

  part(body, GEO.box, M(horseC, 0.72), 0.95, 0.82, 1.85, 0, 1.34, 0);
  part(body, GEO.box, M(dark(horseC, 0.88), 0.72), 0.78, 0.55, 0.9, 0, 1.12, -0.55);
  part(body, GEO.box, M(horseC, 0.72), 0.44, 0.8, 0.46, 0, 1.84, 0.84, 0.62, 0, 0);
  part(body, GEO.box, M(horseC, 0.72), 0.34, 0.38, 0.78, 0, 2.18, 1.22);
  part(body, GEO.box, M(0xd8b8a0, 0.8), 0.27, 0.25, 0.3, 0, 2.1, 1.62);
  for (const s of [-1, 1]) {
    part(body, GEO.cone, M(dark(horseC, 0.8), 0.8), 0.07, 0.2, 0.07, s * 0.16, 2.42, 1.02, -0.15, 0, 0);
    part(body, GEO.sph, B(0xf7f3e6), 0.06, 0.07, 0.04, s * 0.18, 2.26, 1.08);
    part(body, GEO.sph, B(0x1a120d), 0.035, 0.045, 0.03, s * 0.196, 2.26, 1.1);
    part(body, GEO.sph, B(0xffffff), 0.012, 0.012, 0.01, s * 0.2, 2.28, 1.115);
    part(body, GEO.sph, B(0x2a1a14), 0.03, 0.03, 0.02, s * 0.07, 2.08, 1.77);
    part(body, GEO.box, leather(LEATHER_DARK), 0.025, 0.035, 1.15, s * 0.17, 1.98, 0.96, 0.18, 0, 0);
  }
  part(body, GEO.box, M(0x2e2318), 0.1, 0.5, 1.15, 0, 2.04, 0.55);
  part(body, GEO.box, M(0x2e2318), 0.1, 0.66, 0.14, 0, 1.16, -1.02, 0.4, 0, 0);
  part(body, GEO.box, steel(0x7d8694), 1.0, 0.5, 0.9, 0, 1.36, 0.42);
  part(body, GEO.box, gold(), 1.04, 0.06, 0.92, 0, 1.14, 0.42);
  part(body, GEO.box, M(tcd, 0.8), 1.06, 0.42, 0.9, 0, 1.24, -0.3);
  part(body, GEO.box, M(tc), 1.08, 0.08, 0.92, 0, 1.06, -0.3);
  part(body, GEO.sph, steel(0x7d8694), 0.2, 0.3, 0.22, 0, 2.28, 1.3);
  part(body, GEO.cone, gold(), 0.045, 0.16, 0.045, 0, 2.34, 1.5, PI / 2, 0, 0);
  part(body, GEO.box, M(0x553f26), 0.6, 0.16, 0.5, 0, 1.82, 0);
  const mkHLeg = (x: number, z: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.95, z);
    body.add(p);
    part(p, GEO.cyl, M(dark(horseC, 0.82), 0.8), 0.13, 0.85, 0.13, 0, -0.42, 0);
    part(p, GEO.sph, M(dark(horseC, 0.76), 0.78), 0.13, 0.11, 0.13, 0, -0.44, 0.01);
    part(p, GEO.box, M(0x1c1710), 0.2, 0.12, 0.22, 0, -0.85, 0.03);
    part(p, GEO.box, M(0xe8e0d0), 0.15, 0.1, 0.15, 0, -0.7, 0);
    return p;
  };
  const flLeg = mkHLeg(0.3, 0.66), frLeg = mkHLeg(-0.3, 0.66), blLeg = mkHLeg(0.3, -0.6), brLeg = mkHLeg(-0.3, -0.6);

  for (const s of [-1, 1]) {
    part(body, GEO.box, M(0x2f3540), 0.16, 0.52, 0.24, s * 0.38, 1.62, 0.12, 0.5, 0, 0);
    part(body, GEO.box, steel(0x8b93a1), 0.2, 0.34, 0.22, s * 0.42, 1.34, 0.3);
    part(body, GEO.ring, steel(STEEL_LIGHT), 0.075, 0.075, 0.08, s * 0.45, 1.18, 0.32, 0, PI / 2, 0);
  }
  const torso = new THREE.Group();
  torso.position.set(0, 1.9, -0.05);
  body.add(torso);
  part(torso, GEO.box, M(tc), 0.64, 0.66, 0.38, 0, 0.42, 0);
  part(torso, GEO.box, M(0xd9d2c0, 0.5, 0.3), 0.68, 0.14, 0.42, 0, 0.18, 0);
  part(torso, GEO.box, steel(0x8b93a1), 0.68, 0.5, 0.44, 0, 0.62, 0);
  part(torso, GEO.box, M(GOLD, 0.4, 0.5), 0.5, 0.05, 0.46, 0, 0.78, 0);
  for (const s of [-1, 1]) part(torso, GEO.sph, steel(STEEL_LIGHT), 0.24, 0.18, 0.24, s * 0.42, 0.76, 0);
  const cloak = new THREE.Group();
  cloak.position.set(0, 0.84, -0.24);
  torso.add(cloak);
  part(cloak, GEO.box, M(tcd), 0.56, 1.0, 0.05, 0, -0.5, 0);
  part(cloak, GEO.box, gold(), 0.58, 0.06, 0.055, 0, -0.96, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.12, 0);
  head.scale.setScalar(1.22);
  torso.add(head);
  part(head, GEO.sph, M(skin, 0.6), 0.26, 0.28, 0.26);
  for (const s of [-1, 1]) part(head, GEO.sph, M(skin, 0.6), 0.05, 0.07, 0.04, s * 0.255, -0.01, 0);
  part(head, GEO.dome, steel(0x9aa3b2), 0.3, 0.27, 0.3, 0, 0.07, -0.005);
  part(head, GEO.ring, steel(GOLD), 0.3, 0.3, 0.3, 0, 0.07, 0, PI / 2, 0, 0);
  part(head, GEO.box, steel(0x9aa3b2), 0.05, 0.22, 0.04, 0, -0.01, 0.275);
  for (const s of [-1, 1]) part(head, GEO.box, steel(0x9aa3b2), 0.04, 0.18, 0.18, s * 0.265, -0.04, 0);
  part(head, GEO.box, M(tc), 0.08, 0.3, 0.45, 0, 0.32, -0.08, -0.5, 0, 0);
  addFace(head, skin, { brow: 0.16, mouth: "grin" });

  const mkArm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * 0.43, 0.8, 0.06);
    torso.add(a);
    part(a, GEO.box, steel(0x8b93a1), 0.19, 0.46, 0.21, 0, -0.2, 0);
    part(a, GEO.box, steel(0x8b93a1), 0.17, 0.36, 0.19, 0, -0.5, 0);
    part(a, GEO.sph, steel(0x8b93a1), 0.14, 0.14, 0.16, 0, 0.02, 0);
    part(a, GEO.sph, M(skin), 0.1, 0.1, 0.1, 0, -0.72, 0);
    return a;
  };
  const lArm = mkArm(1), rArm = mkArm(-1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.72, 0.04);
  rArm.add(hand);
  part(hand, GEO.cyl, M(0x8a6a3a), 0.045, 3.6, 0.045, 0, 0, 1.2, PI / 2, 0, 0);
  part(hand, GEO.cone, steel(STEEL_LIGHT), 0.15, 0.3, 0.15, 0, 0, 0.28, PI / 2, 0, 0);
  part(hand, GEO.cone, steel(0xc9d1dc), 0.09, 0.44, 0.09, 0, 0, 3.05, PI / 2, 0, 0);
  part(hand, GEO.quadCone, M(tc), 0.16, 0.42, 0.02, 0, 0.1, 2.5, 0, PI / 2, 0);
  part(lArm, GEO.quadCone, M(tc, 0.55, 0.4), 0.3, 0.46, 0.08, 0, -0.5, 0.14, PI, PI / 4, 0);
  part(lArm, GEO.ring, steel(GOLD), 0.2, 0.2, 0.3, 0, -0.5, 0.2);

  return {
    root, body, torso, head, hand, lLeg: flLeg, rLeg: frLeg, lArm, rArm, cloak,
    flLeg, frLeg, blLeg, brLeg, headH: 3.7, heavy: true, scale: 1, tilt: 0.06, kind: "knight",
    handMode: "fixed", handRest: -0.1, parts: [], fx: {},
  };
}

/* ============ baking ============ */

const MAT_STD = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 });
const MAT_METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.78 });
const MAT_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });
const CLASS_MAT: THREE.Material[] = [MAT_STD, MAT_METAL, MAT_BASIC];

function classOf(m: THREE.Material): 0 | 1 | 2 {
  if (m instanceof THREE.MeshBasicMaterial) return 2;
  return (m as THREE.MeshStandardMaterial).metalness >= 0.3 ? 1 : 0;
}

interface Baked { template: UnitRig; specs: RigPart[] }
const bakedCache = new Map<string, Baked>();

function bake(template: UnitRig): Baked {
  const specs: RigPart[] = [];
  const groups: THREE.Group[] = [];
  template.root.traverse(o => { if (o instanceof THREE.Group) groups.push(o); });
  for (const g of groups) {
    const buckets: THREE.BufferGeometry[][] = [[], [], []];
    for (const c of g.children) {
      if (!(c instanceof THREE.Mesh)) continue;
      c.updateMatrix();
      const geo = (c.geometry as THREE.BufferGeometry).clone().applyMatrix4(c.matrix);
      const mat = c.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      const cls = classOf(mat);
      const pos = geo.attributes.position, norm = geo.attributes.normal;
      const n = pos.count;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const spanY = Math.max(0.05, maxY - minY);
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        let shade = 1;
        if (cls !== 2) {
          const nx = norm ? norm.getX(i) : 0, ny = norm ? norm.getY(i) : 0, nz = norm ? norm.getZ(i) : 0;
          const h = (pos.getY(i) - minY) / spanY - 0.5;
          const key = ny * 0.11 + nz * 0.055 + Math.abs(nx) * 0.025;
          shade = cls === 1 ? 1 + key * 1.15 + h * 0.09 : 1 + key * 0.82 + h * 0.065;
          shade = Math.max(0.7, Math.min(1.2, shade));
        }
        colors[i * 3] = Math.min(1, mat.color.r * shade);
        colors[i * 3 + 1] = Math.min(1, mat.color.g * shade);
        colors[i * 3 + 2] = Math.min(1, mat.color.b * shade);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      buckets[cls].push(geo);
    }
    buckets.forEach((list, i) => {
      if (!list.length) return;
      const merged = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        specs.push({ group: g, geometry: merged, material: CLASS_MAT[i] });
      }
    });
  }
  return { template, specs };
}

function cloneTree(src: THREE.Object3D, map: Map<THREE.Object3D, THREE.Group>): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(src.position);
  g.quaternion.copy(src.quaternion);
  g.scale.copy(src.scale);
  g.rotation.order = src.rotation.order;
  map.set(src, g);
  for (const child of src.children) if (child instanceof THREE.Group) g.add(cloneTree(child, map));
  return g;
}

function instantiate(b: Baked): UnitRig {
  const t = b.template;
  const map = new Map<THREE.Object3D, THREE.Group>();
  const root = cloneTree(t.root, map);
  const pick = (g?: THREE.Group | null) => (g ? map.get(g) : undefined);
  return {
    root, body: pick(t.body)!, torso: pick(t.torso)!, head: pick(t.head)!, hand: pick(t.hand)!,
    lLeg: pick(t.lLeg)!, rLeg: pick(t.rLeg)!, lArm: pick(t.lArm)!, rArm: pick(t.rArm)!, cloak: pick(t.cloak) ?? null,
    flLeg: pick(t.flLeg), frLeg: pick(t.frLeg), blLeg: pick(t.blLeg), brLeg: pick(t.brLeg),
    headH: t.headH, heavy: t.heavy, scale: t.scale, tilt: t.tilt, kind: t.kind, handMode: t.handMode, handRest: t.handRest,
    parts: b.specs.map(s => ({ group: map.get(s.group)!, geometry: s.geometry, material: s.material })),
    fx: {},
  };
}

export function buildUnitRig(kind: UnitKind, team: TeamId): UnitRig {
  const key = `${kind}:${team}`;
  let baked = bakedCache.get(key);
  if (!baked) {
    const template =
      kind === "knight" ? buildKnight(team)
      : kind === "robot" ? buildRobot(team)
      : kind === "tank" ? buildTank(team)
      : kind === "railgun" ? buildRailgun(team)
      : buildHumanoid(kind, team);
    baked = bake(template);
    bakedCache.set(key, baked);
  }
  const rig = instantiate(baked);
  rig.torso.rotation.x = rig.tilt;
  return rig;
}
