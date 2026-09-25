import { F } from "./tuning";

export type WeaponKind = "shooter" | "roller" | "charger";
export type WeaponId = "splattershot" | "splat_roller" | "splat_charger";

export interface FireProfile {
  interval: number; // seconds between shots
  firstShotDelay: number;
  inkPerShot: number; // % of tank
  refillDelay: number;
}
export interface ProjectileProfile {
  speed: number; // m/s
  straightTime: number; // seconds of no-drop flight
  gravity: number;
  hitRadius: number;
  maxLifetime: number;
  dripEvery: number; // paint droplet frequency (s) during flight; 0 = none
}
export interface DamageProfile {
  base: number;
  min: number;
  falloffStart: number; // seconds after fire
  falloffEnd: number;
}
export interface PaintProfile {
  impactRadius: number; // metres
  dripRadius: number;
  shape: number; // shape id used by ink shader
  secondaryDroplets: number;
}
export interface SpreadProfile {
  ground: number; // degrees
  air: number;
  degradePerShot: number;
  recoverPerSec: number;
}
export interface MovementProfile {
  moveMulWhileFiring: number;
  moveMulWhileCharging?: number;
}
export interface RollerProfile {
  rollSpeed: number;
  dashTime: number;
  rollPaintWidth: number;
  rollInkPerSec: number;
  contactDamageDash: number;
  contactDamageWalk: number;
  hFlickStartup: number;
  hFlickRecovery: number;
  hFlickInk: number;
  hFlickGlobs: number;
  hFlickSpread: number; // degrees half-angle
  hFlickRange: number;
  hFlickDamageMax: number;
  hFlickDamageMin: number;
  vFlickStartup: number;
  vFlickRecovery: number;
  vFlickInk: number;
  vFlickGlobs: number;
  vFlickRange: number;
  vFlickDamageMax: number;
  vFlickDamageMin: number;
  globSpeed: number;
}
export interface ChargerProfile {
  fullChargeTime: number;
  minDamage: number;
  fullDamage: number;
  minRange: number;
  fullRange: number;
  minInk: number;
  fullInk: number;
  recovery: number;
  storeChargeTime: number; // seconds charge can be stored in squid form
  lineRadius: number;
  pierceOnFull: boolean;
}

export interface WeaponDefinition {
  id: WeaponId;
  kind: WeaponKind;
  name: string;
  nameJa: string;
  fire: FireProfile;
  projectile: ProjectileProfile;
  damage: DamageProfile;
  paint: PaintProfile;
  spread: SpreadProfile;
  movement: MovementProfile;
  roller?: RollerProfile;
  charger?: ChargerProfile;
  range: number;
}

// ---------- Splattershot (Ver 11.3.0 base data: 6f/shot, 36 dmg, 0.92% ink, run-while-shoot 0.72 DU/f)
export const SPLATTERSHOT: WeaponDefinition = {
  id: "splattershot",
  kind: "shooter",
  name: "Splattershot",
  nameJa: "スプラシューター",
  fire: { interval: F(6), firstShotDelay: F(3), inkPerShot: 0.92, refillDelay: F(20) },
  projectile: {
    speed: 24, // 2.2 DU/f initial → scaled; travels straight 4f then decelerates & drops
    straightTime: F(4),
    gravity: 26,
    hitRadius: 0.22,
    maxLifetime: F(28),
    dripEvery: F(3),
  },
  damage: { base: 36, min: 18, falloffStart: F(8), falloffEnd: F(15) },
  paint: { impactRadius: 0.62, dripRadius: 0.36, shape: 0, secondaryDroplets: 2 },
  spread: { ground: 6, air: 12, degradePerShot: 0.4, recoverPerSec: 12 },
  movement: { moveMulWhileFiring: 0.75 },
  range: 11.5,
};

// ---------- Splat Roller (Ver 11.3.0: hflick 150→50 dmg, vflick 150→? , roll 1.08 DU/f, contact 125/70)
export const SPLAT_ROLLER: WeaponDefinition = {
  id: "splat_roller",
  kind: "roller",
  name: "Splat Roller",
  nameJa: "スプラローラー",
  fire: { interval: F(30), firstShotDelay: 0, inkPerShot: 8.5, refillDelay: F(45) },
  projectile: { speed: 15, straightTime: F(5), gravity: 30, hitRadius: 0.3, maxLifetime: F(30), dripEvery: 0 },
  damage: { base: 150, min: 50, falloffStart: F(5), falloffEnd: F(14) },
  paint: { impactRadius: 0.75, dripRadius: 0.4, shape: 1, secondaryDroplets: 3 },
  spread: { ground: 0, air: 0, degradePerShot: 0, recoverPerSec: 0 },
  movement: { moveMulWhileFiring: 0.0 },
  roller: {
    rollSpeed: 5.4, // 1.08 DU/f → 1.125× run
    dashTime: F(10),
    rollPaintWidth: 1.75,
    rollInkPerSec: 0.09 * 60,
    contactDamageDash: 125,
    contactDamageWalk: 70,
    hFlickStartup: F(8),
    hFlickRecovery: F(22),
    hFlickInk: 8.5,
    hFlickGlobs: 9,
    hFlickSpread: 30,
    hFlickRange: 7.8,
    hFlickDamageMax: 150,
    hFlickDamageMin: 50,
    vFlickStartup: F(17),
    vFlickRecovery: F(30),
    vFlickInk: 9.0,
    vFlickGlobs: 7,
    vFlickRange: 11.0,
    vFlickDamageMax: 150,
    vFlickDamageMin: 40,
    globSpeed: 15,
  },
  range: 7.8,
};

// ---------- Splat Charger (Ver 11.3.0: full charge 60f, 40→160 dmg, full range ≈ 2.9 lines, 18% ink)
export const SPLAT_CHARGER: WeaponDefinition = {
  id: "splat_charger",
  kind: "charger",
  name: "Splat Charger",
  nameJa: "スプラチャージャー",
  fire: { interval: F(20), firstShotDelay: 0, inkPerShot: 18, refillDelay: F(25) },
  projectile: { speed: 120, straightTime: 1, gravity: 0, hitRadius: 0.18, maxLifetime: 0.3, dripEvery: 0 },
  damage: { base: 160, min: 40, falloffStart: 99, falloffEnd: 99 },
  paint: { impactRadius: 0.7, dripRadius: 0.33, shape: 2, secondaryDroplets: 4 },
  spread: { ground: 0, air: 0, degradePerShot: 0, recoverPerSec: 0 },
  movement: { moveMulWhileFiring: 0.0, moveMulWhileCharging: 0.21 },
  charger: {
    fullChargeTime: F(60),
    minDamage: 40,
    fullDamage: 160,
    minRange: 6.0,
    fullRange: 14.5,
    minInk: 2.25,
    fullInk: 18,
    recovery: F(20),
    storeChargeTime: 1.5,
    lineRadius: 0.32,
    pierceOnFull: true,
  },
  range: 14.5,
};

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  splattershot: SPLATTERSHOT,
  splat_roller: SPLAT_ROLLER,
  splat_charger: SPLAT_CHARGER,
};
export const WEAPON_LIST: WeaponDefinition[] = [SPLATTERSHOT, SPLAT_ROLLER, SPLAT_CHARGER];
