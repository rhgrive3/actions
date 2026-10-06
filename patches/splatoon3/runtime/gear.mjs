import { refreshFlowEffects } from './flow-effects.mjs';
import { HEAD_ABILITIES, conditionalPoints, conditionalKey, installConditionalGear } from './conditional-gear.mjs';
import { installSubResistance } from './sub-resistance.mjs';
// Gear uses three equipment pieces, each with one 10 AP main and three 3 AP subs.
export const ABILITIES = Object.freeze({
  lastDitchEffort: 'ラストスパート', comeback: 'カムバック', openingGambit: 'スタートダッシュ', subResistance: 'サブ影響軽減',
  none: 'なし', runSpeed: 'ヒト移動速度アップ', swimSpeed: 'イカダッシュ速度アップ',
  inkSaverMain: 'インク効率アップ（メイン）', inkSaverSub: 'インク効率アップ（サブ）',
  inkRecovery: 'インク回復力アップ', inkResistance: '相手インク影響軽減',
  actionIntensify: 'アクション強化', specialCharge: 'スペシャル増加量アップ',
  specialSaver: 'スペシャル減少量ダウン', quickRespawn: '復活時間短縮',
  quickSuperJump: 'スーパージャンプ時間短縮', subPower: 'サブ性能アップ',
});
export function abilityAllowed(id, piece, slot) {
  return Object.hasOwn(ABILITIES, id) && (!HEAD_ABILITIES.includes(id) || piece === 0 && slot === 0);
}
export const emptyLoadout = () => Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
export function normalizeLoadout(value) {
  if (!Array.isArray(value) || value.length !== 3) return emptyLoadout();
  return value.map((part, piece) => ({
    main: abilityAllowed(part?.main, piece, 0) ? part.main : 'none',
    subs: Array.from({ length: 3 }, (_, i) => abilityAllowed(part?.subs?.[i], piece, i + 1) ? part.subs[i] : 'none'),
  }));
}
export function abilityPoints(loadout) {
  const ap = {};
  for (const part of normalizeLoadout(loadout)) {
    if (part.main !== 'none') ap[part.main] = (ap[part.main] || 0) + 10;
    for (const sub of part.subs) if (sub !== 'none') ap[sub] = (ap[sub] || 0) + 3;
  }
  return ap;
}
export function gearCurve(points, min, mid, max) {
  const AP = Math.max(0, Math.min(57, points));
  const p = Math.min(100, 3.3 * AP - 0.027 * AP * AP) / 100;
  if (max === min) return min;
  const s = (mid - min) / (max - min);
  if (p === 0) return min;
  if (p === 1) return max;
  const t = s === 0.5 ? p : Math.pow(p, Math.log(s) / Math.log(0.5));
  return min + (max - min) * t;
}
export function modifiersFor(loadout, curves, points = abilityPoints(loadout)) {
  const result = {};
  for (const [ability, curve] of Object.entries(curves)) {
    if (curve && curve.length === 3 && curve.every(Number.isFinite)) result[ability] = gearCurve(points[ability] || 0, ...curve);
  }
  return result;
}
const STORAGE = 'inkwave.splatoon3.gear.v1';
export function readLoadout() {
  try { return normalizeLoadout(JSON.parse(globalThis.localStorage?.getItem(STORAGE) || 'null')); }
  catch { return emptyLoadout(); }
}
export function installGear(api, tuning) {
  const { Actor, WeaponRunner, G } = api;
  const reset = Actor.prototype.reset, setWeapon = Actor.prototype.setWeapon;
  const refreshFlow = actor => refreshFlowEffects(actor, api, tuning, abilityPoints, gearCurve);
  api.on('actor:flow', ({ actor }) => refreshFlow(actor));
  const key = a => conditionalKey(a, G.match, tuning.conditionalGear);
  const refreshConditional = a => { if (a.s3?.modifiers && a.s3.conditionalKey !== key(a)) equip(a, true); };
  const refresh = a => { refreshConditional(a); refreshFlow(a); };
  function equip(a, transient = false) {
    a.s3 ||= {};
    const loadout = a.isLocal && !transient ? readLoadout() : normalizeLoadout(a.s3.loadout);
    const beforeCost = a.weapon?.specialCost, beforeSpecial = a.special;
    a.s3.loadout = loadout;
    const points = conditionalPoints(a, abilityPoints(loadout), G.match, tuning.conditionalGear);
    a.s3.modifiers = modifiersFor(loadout, tuning.gear, points);
    const m = a.s3.modifiers;
    const ap = points, extra = tuning.gearExtra;
    m.inkRecoverySwim = tuning.gear.inkRecovery[0] / m.inkRecovery;
    m.inkRecoveryKid = extra.inkRecoveryKid[0] / gearCurve(ap.inkRecovery || 0, ...extra.inkRecoveryKid);
    m.enemyMoveSpeed = m.inkResistance * 60;
    m.enemyShotSpeed = gearCurve(ap.inkResistance || 0, ...extra.enemyShotSpeed) * 60;
    m.enemyDamageCap = gearCurve(ap.inkResistance || 0, ...extra.enemyDamageCap) * 100;
    m.enemyDamageRate = gearCurve(ap.inkResistance || 0, ...extra.enemyDamageRate) * 6000;
    m.enemyJumpVelocity = gearCurve(ap.inkResistance || 0, ...extra.enemyJumpVelocity) * 60;
    m.rollRetention = gearCurve(ap.actionIntensify || 0, ...extra.rollRetention);
    a.s3.jumpChargeTime = tuning.superJump.chargeTime * (m.quickSuperJump ?? 1);
    a.s3.jumpFlightTime = tuning.superJump.flightTime * gearCurve(ap.quickSuperJump || 0, ...extra.jumpFlightTime);
    a.s3.modifiers.surgeChargeScale = m.actionIntensify ?? 1;
    // Actor-local copy. An opponent's equipment never changes shared stats.
    const base = api.WEAPONS[a.weaponId];
    if (!transient) a.weapon = { ...base };
    else for (const field of ['spreadAir', 'specialCost', 'inkPerShot', 'inkFull', 'inkMin', 'flickInk', 'verticalInk', 'rollInk', 'rollInkPerMeter']) {
      if (field in base) a.weapon[field] = base[field];
    }
    // MainWeaponSetting and ActionSpecUp overrides belong to the equipped
    // weapon. Heavy Splatling and Blaster do not use the common middle values.
    m.runSpeedFiring = gearCurve(ap.runSpeed || 0, ...(a.weapon.runSpeedFiringCurve || extra.runSpeedFiring));
    m.actionAirSpread = gearCurve(ap.actionIntensify || 0, ...(a.weapon.actionAirSpreadCurve || extra.actionAirSpread));
    if (Number.isFinite(a.weapon.spreadAir) && Number.isFinite(a.weapon.spreadGround)) a.weapon.spreadAir = a.weapon.spreadGround + (a.weapon.spreadAir - a.weapon.spreadGround) * (1 - m.actionAirSpread);
    for (const field of ['inkPerShot', 'inkFull', 'inkMin', 'flickInk', 'verticalInk', 'rollInk', 'rollInkPerMeter']) if (field in a.weapon) a.weapon[field] *= m.inkSaverMain ?? 1;
    a.weapon.specialCost /= m.specialCharge ?? 1;
    // A temporary charge-rate bonus cannot create/delete already-filled gauge.
    if (transient && beforeCost > 0 && Number.isFinite(beforeSpecial)) a.special = beforeSpecial / beforeCost * a.weapon.specialCost;
    a.s3.conditionalKey = key(a);
    refreshFlow(a);
  }
  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args); equip(this);
    this.s3.recoverStopRemaining = 0; this.s3.enemyInkTime = 0;
    return result;
  };
  Actor.prototype.setWeapon = function (...args) { const result = setWeapon.apply(this, args); equip(this); return result; };
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    refresh(this.a);
    const m = this.a.s3?.modifiers || {}, w = this.a.weapon;
    const lockedMode = this.rolling || this.charging && w.kind === 'charger';
    const attacking = this.firingT > 0 || this.charging || this.streaming;
    // Ordinary airborne steering must not acquire extra reach from the ground
    // run-speed ability. Keep attack/ready/action-specific speed owners separate;
    // this only changes the target multiplier, never the velocity at takeoff.
    const ordinaryAir = !this.a.grounded && this.a.form === 'kid' &&
      !this.a.specialActive && !this.a.superJumpState && !this.a.s3?.roll && !this.a.s3?.surge &&
      !this.busy() && !this.firingPose() && !this.aimingSub && !(this.flickRecover > 0);
    const gear = lockedMode || ordinaryAir ? 1 : attacking ? m.runSpeedFiring ?? 1 : m.runSpeed ?? 1;
    return moveSpeed.call(this) * gear;
  };
  const horizontal = Actor.prototype._horizontal;
  Actor.prototype._horizontal = function (dt, squid, enemy) {
    refresh(this);
    // The upstream method reads a shared configuration. Provide scoped values
    // synchronously, restoring even when collision/weapon code throws.
    const original = { swimSpeed: api.PLAYER.swimSpeed, enemyInkSpeed: api.PLAYER.enemyInkSpeed };
    const m = this.s3?.modifiers || {};
    api.PLAYER.swimSpeed *= m.swimSpeed ?? 1;
    api.PLAYER.enemyInkSpeed = (this.intent.fire ? m.enemyShotSpeed : m.enemyMoveSpeed) ?? original.enemyInkSpeed;
    try { return horizontal.call(this, dt, squid, enemy); }
    finally { Object.assign(api.PLAYER, original); }
  };
  const splat = Actor.prototype.splat;
  Actor.prototype.splat = function (...args) {
    const before = this.special, alive = this.alive;
    const result = splat.apply(this, args);
    if (alive && !this.alive) {
      this.special = before * (this.s3?.modifiers?.specialSaver ?? 0.5);
      if ((this.s3?.splatsThisLife || 0) === 0 && this.s3?.previousLifeNoSplat) this.respawnTimer = Math.max(0, this.respawnTimer - tuning.respawnChaseTime * (1 - (this.s3?.modifiers?.quickRespawn ?? 1)));
      this.s3.previousLifeNoSplat = (this.s3.splatsThisLife || 0) === 0;
      this.s3.splatsThisLife = 0;
    }
    return result;
  };
  api.on('splatted', ({ attacker }) => { if (attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });
  const update = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    refresh(this.a);
    const a = this.a, m = a.s3?.modifiers || {}, beforeInk = a.ink;
    const saved = { inkCost: api.SUB.bomb.inkCost, throwSpeed: api.SUB.bomb.throwSpeed };
    api.SUB.bomb.inkCost *= m.inkSaverSub ?? 1;
    api.SUB.bomb.throwSpeed *= m.subPower ?? 1;
    const effectiveBombCost = api.SUB.bomb.inkCost;
    const bombsBefore = G.projectiles?.bombs?.length ?? 0;
    try { return update.call(this, dt, input); }
    finally {
      const bombSpent = (G.projectiles?.bombs?.length ?? bombsBefore) > bombsBefore;
      const spent = Math.max(0, beforeInk - a.ink);
      Object.assign(api.SUB.bomb, saved);
      if (spent > 1e-10) {
        a.s3 ||= {};
        const mainSpent = !bombSpent || spent > effectiveBombCost + 1e-8;
        let delay = 0;
        if (mainSpent) {
          const mainDelay = this.s3FlickVertical ? a.weapon.verticalInkRecoverStop ?? a.weapon.inkRecoverStop : a.weapon.inkRecoverStop;
          delay = Math.max(delay, mainDelay ?? tuning.resources.inkRefillDelay);
        }
        if (bombSpent) delay = Math.max(delay, api.SUB.bomb.inkRecoverStop ?? tuning.resources.inkRefillDelay);
        a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining || 0, delay);
      }
    }
  };
  installConditionalGear(api, tuning, refresh);
  installSubResistance(api);
  if (api.Menus) {
    const render = api.Menus.prototype._scr_loadout;
    api.Menus.prototype._scr_loadout = function (...args) {
      const screen = render.apply(this, args);
      screen.el.appendChild(gearPanel());
      return screen;
    };
  }
  function gearPanel() {
    const details = document.createElement('details'); details.className = 's3-gear';
    const summary = document.createElement('summary'); summary.textContent = 'ギアパワー'; details.append(summary);
    const loadout = readLoadout();
    ['アタマ', 'フク', 'クツ'].forEach((label, piece) => {
      const field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = label; field.append(legend);
      for (let slot = 0; slot < 4; slot++) {
        const row = document.createElement('label'); row.textContent = slot === 0 ? 'メイン（10）' : `追加 ${slot}（3）`;
        const select = document.createElement('select'); select.setAttribute('aria-label', `${label} ${slot === 0 ? 'メイン' : '追加' + slot}`);
        for (const [id, name] of Object.entries(ABILITIES)) {
          if (!abilityAllowed(id, piece, slot) || id !== 'none' && !HEAD_ABILITIES.includes(id) && !tuning.gear[id]) continue;
          const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option);
        }
        select.value = slot === 0 ? loadout[piece].main : loadout[piece].subs[slot - 1];
        select.addEventListener('keydown', event => event.stopPropagation());
        select.addEventListener('change', () => {
          if (slot === 0) loadout[piece].main = select.value; else loadout[piece].subs[slot - 1] = select.value;
          try { localStorage.setItem(STORAGE, JSON.stringify(loadout)); } catch { /* sandbox/private mode */ }
          if (G.match?.local && G.match?.attract) equip(G.match.local);
        });
        row.append(select); field.append(row);
      }
      details.append(field);
    });
    return details;
  }
}
