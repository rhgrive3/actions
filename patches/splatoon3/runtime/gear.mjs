import { CLOTHING_ABILITIES, SPLATFEST_TEE, clothingAbilityAllowed, deathGearPenalty } from './clothing-gear.mjs';
import { selectedSub } from './kit-composition.mjs';
import { installSubReady } from './sub-ready.mjs';
import { installStormPower } from './storm-power.mjs';
import { configureSwimStealth, updateSwimStealth, swimSpeedMultiplier } from './swim-stealth.mjs';
import { refreshFlowEffects } from './flow-effects.mjs';
import { HEAD_ABILITIES, conditionalPoints, conditionalKey, installConditionalGear } from './conditional-gear.mjs';
import { installSubResistance } from './sub-resistance.mjs';
// Gear uses three equipment pieces, each with one 10 AP main and three 3 AP subs.
export const ABILITIES = Object.freeze({
  respawnPunisher: '復活ペナルティアップ', abilityDoubler: 'フェスT：追加ギアパワー倍化',
  ninjaSquid: 'イカニンジャ',
  lastDitchEffort: 'ラストスパート', comeback: 'カムバック', openingGambit: 'スタートダッシュ', subResistance: 'サブ影響軽減',
  none: 'なし', runSpeed: 'ヒト移動速度アップ', swimSpeed: 'イカダッシュ速度アップ',
  inkSaverMain: 'インク効率アップ（メイン）', inkSaverSub: 'インク効率アップ（サブ）',
  inkRecovery: 'インク回復力アップ', inkResistance: '相手インク影響軽減',
  actionIntensify: 'アクション強化', specialCharge: 'スペシャル増加量アップ',
  specialPower: 'スペシャル性能アップ',
  specialSaver: 'スペシャル減少量ダウン', quickRespawn: '復活時間短縮',
  quickSuperJump: 'スーパージャンプ時間短縮', subPower: 'サブ性能アップ',
});
export function abilityAllowed(id, piece, slot, item) {
  return Object.hasOwn(ABILITIES, id) && clothingAbilityAllowed(id, piece, slot, item) && (!HEAD_ABILITIES.includes(id) || piece === 0 && slot === 0) && (id !== 'ninjaSquid' || piece === 1 && slot === 0);
}
export const emptyLoadout = () => Array.from({ length: 3 }, () => ({ main: 'none', subs: ['none', 'none', 'none'] }));
export function normalizeLoadout(value) {
  if (!Array.isArray(value) || value.length !== 3) return emptyLoadout();
  return value.map((part, piece) => ({
    ...(piece === 1 && part?.item === SPLATFEST_TEE ? { item: SPLATFEST_TEE } : {}),
    main: abilityAllowed(part?.main, piece, 0, part?.item) ? part.main : 'none',
    subs: Array.from({ length: 3 }, (_, i) => abilityAllowed(part?.subs?.[i], piece, i + 1, part?.item) ? part.subs[i] : 'none'),
  }));
}
export function abilityPoints(loadout) {
  const ap = {};
  for (const part of normalizeLoadout(loadout)) {
    if (part.main !== 'none' && part.main !== 'abilityDoubler') ap[part.main] = (ap[part.main] || 0) + 10;
    for (const sub of part.subs) if (sub !== 'none') ap[sub] = (ap[sub] || 0) + (part.item === SPLATFEST_TEE && part.main === 'abilityDoubler' ? 6 : 3);
  }
  return ap;
}
/** True while enemy-ink movement follows the attack/ready curve
 * (OpInk_MoveVel_Shot) instead of the ordinary walk curve (OpInk_MoveVel).
 *
 * Pinned 11.3.0 keeps both curves, and Nintendo's own Splatoon 2 Ver. 1.4.0
 * notes list "moving while preparing to throw a bomb or sub weapon" among the
 * states Ink Resistance Up must apply; the Splatoon 3 ability documentation
 * states it works the same way as in Splatoon 2. Readiness is read from the
 * weapon's own ready state, not from the raw button, so the release and cancel
 * frames cannot leak the ordinary curve. Squid form never enters a sub ready
 * state, so the grounded humanoid branch is the only one affected.
 */
export function enemyInkAttackReady(actor) {
  return !!actor?.intent?.fire || actor?.weaponRunner?.aimingSub === true;
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
  configureSwimStealth(api, tuning);
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
    m.ninjaSquid = loadout[1].main === 'ninjaSquid';
    const ap = points, extra = tuning.gearExtra;
    m.specialPowerAP = ap.specialPower || 0;
    const aroundBase = extra.quickRespawnAroundFrames[0], chaseBase = tuning.respawnChaseTime * 60;
    const around = Math.floor(gearCurve(ap.quickRespawn || 0, ...extra.quickRespawnAroundFrames) + 1e-10);
    const chase = Math.floor(chaseBase * (m.quickRespawn ?? 1) + 1e-10);
    m.quickRespawnReduction = (aroundBase + chaseBase - around - chase) / 60;
    m.inkRecoverySwim = tuning.gear.inkRecovery[0] / m.inkRecovery;
    m.inkRecoveryKid = extra.inkRecoveryKid[0] / gearCurve(ap.inkRecovery || 0, ...extra.inkRecoveryKid);
    m.enemyMoveSpeed = m.inkResistance * 60;
    m.enemyActionSpeedScale = gearCurve(ap.inkResistance || 0, ...extra.enemyActionSpeedScale);
    m.enemyInkGrace = Math.ceil(gearCurve(ap.inkResistance || 0, ...extra.enemyInkGraceFrames) - 1e-10) / tuning.resources.enemyInkReferenceHz;
    m.enemyShotSpeed = gearCurve(ap.inkResistance || 0, ...extra.enemyShotSpeed) * 60;
    m.enemyDamageCap = gearCurve(ap.inkResistance || 0, ...extra.enemyDamageCap) * 100;
    m.enemyDamageRate = gearCurve(ap.inkResistance || 0, ...extra.enemyDamageRate) * 6000;
    m.enemyJumpVelocity = gearCurve(ap.inkResistance || 0, ...extra.enemyJumpVelocity) * 60;
    m.rollRetention = gearCurve(ap.actionIntensify || 0, ...extra.rollRetention);
    a.s3.jumpChargeTime = tuning.superJump.chargeTime * (m.quickSuperJump ?? 1);
    a.s3.jumpFlightTime = tuning.superJump.flightTime * gearCurve(ap.quickSuperJump || 0, ...extra.jumpFlightTime);
    // The S3 initial-form term is form-dependent, not equipment-dependent, so
    // Quick Super Jump must not reach it.
    a.s3.jumpStartupSwimF = tuning.superJump.startupSwimF;
    a.s3.jumpStartupHumanoidF = tuning.superJump.startupHumanoidF;
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
    const sub = api.SUB[a.weapon.sub || 'bomb'];
    m.inkSaverSub = sub?.inkSaverCurve ? gearCurve(ap.inkSaverSub || 0, ...sub.inkSaverCurve) : 1;
    m.stormDuration = Math.floor(gearCurve(ap.specialPower || 0, ...tuning.gearExtra.stormDurationFrames) + 1e-10) / 60;
    m.stormThrowScale = gearCurve(ap.specialPower || 0, ...tuning.gearExtra.stormThrowScale);
    a.weapon.specialCost /= m.specialCharge ?? 1;
    // A temporary charge-rate bonus cannot create/delete already-filled gauge.
    if (transient && beforeCost > 0 && Number.isFinite(beforeSpecial)) a.special = beforeSpecial / beforeCost * a.weapon.specialCost;
    a.s3.conditionalKey = key(a);
    refreshFlow(a);
  }
  Actor.prototype.reset = function (...args) {
    const result = reset.apply(this, args); equip(this);
    if (this.remote) delete this.s3.clothingRemote;
    this.s3.recoverStopRemaining = 0; this.s3.rollerRefillMode = false; this.s3.enemyInkTime = 0; this.s3.enemyInkAwayTime = 0;
    this.s3.swimStealth = null; this.s3.netSwimVisibility = null;
    this.s3.quickRespawnHistory = { seenEnemyDeath: false, splats: 0 };
    this.s3.splatsThisLife = 0;
    this.s3.chargerInterruptRecover = 0;   // #737: a new life never inherits a charge-interruption lock
    return result;
  };
  const respawn = Actor.prototype.respawn, finishFrame = Actor.prototype._finishFrame;
  Actor.prototype.respawn = function (...args) {
    const history = this.s3?.quickRespawnHistory, splats = this.s3?.splatsThisLife;
    const result = respawn.apply(this, args);
    if (history) { this.s3.quickRespawnHistory = history; this.s3.splatsThisLife = splats || 0; }
    return result;
  };
  Actor.prototype._finishFrame = function (...args) {
    updateSwimStealth(this); return finishFrame.apply(this, args);
  };
  Actor.prototype.setWeapon = function (...args) { const result = setWeapon.apply(this, args); equip(this); return result; };
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    refresh(this.a);
    const m = this.a.s3?.modifiers || {}, w = this.a.weapon;
    const throwingStorm = this.a.specialActive?.id === 'storm' && this.a.specialActive.phase === 'hold' && this.a.specialActive.subArmed && this.a.intent.sub;
    if (this.a.grounded && (this.aimingSub || throwingStorm)) return tuning.bomb.holdMoveSpeed;
    const lockedMode = this.rolling || this.charging && w.kind === 'charger' && this.a.onEnemy;
    const attacking = this.firingT > 0 || this.flick >= 0 || this.charging || this.streaming;
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
    const swimSpeed = api.PLAYER.swimSpeed, enemyInkSpeed = api.PLAYER.enemyInkSpeed;
    const m = this.s3?.modifiers || {};
    api.PLAYER.swimSpeed *= swimSpeedMultiplier(this);
    const runner = this.weaponRunner, kind = this.weapon.kind;
    const firing = runner.firingT > 0 || runner.s3BlasterWindup > 0;
    const fixedShot = ['shooter', 'dualies', 'blaster'].includes(kind) && firing;
    const scaledAction = kind === 'charger' && runner.charging ||
      kind === 'splatling' && (runner.charging || runner.streaming || firing) ||
      kind === 'slosher' && (runner.slosh >= 0 || firing);
    const walk = m.enemyMoveSpeed ?? enemyInkSpeed;
    if (runner.aimingSub && !squid) api.PLAYER.enemyInkSpeed = m.enemyShotSpeed ?? walk;
    else if (scaledAction && !squid) api.PLAYER.enemyInkSpeed = Math.min(walk, moveSpeed.call(runner) * (m.enemyActionSpeedScale ?? 1));
    else if (fixedShot && !squid) api.PLAYER.enemyInkSpeed = m.enemyShotSpeed ?? walk;
    else api.PLAYER.enemyInkSpeed = kind === 'roller' && this.intent.fire && !squid ? m.enemyShotSpeed ?? walk : walk;
    try { return horizontal.call(this, dt, squid, enemy); }
    finally {
      api.PLAYER.swimSpeed = swimSpeed;
      api.PLAYER.enemyInkSpeed = enemyInkSpeed;
    }
  };
  const splat = Actor.prototype.splat;
  Actor.prototype.splat = function (...args) {
    const before = this.special, alive = this.alive;
    const [attacker, cause = 'weapon'] = args;
    const penalty = deathGearPenalty(this, attacker, cause, tuning, conditionalPoints(this, abilityPoints(this.s3?.loadout), G.match, tuning.conditionalGear), gearCurve);
    const enemyDeath = attacker && attacker !== this && attacker.team !== this.team &&
      !['water', 'fall', 'out', 'bounds', 'void'].includes(cause);
    const result = splat.apply(this, args);
    if (alive && !this.alive) {
      this.special = before * Math.max(0, (penalty.incoming ? penalty.saver : this.s3?.modifiers?.specialSaver ?? 0.5) - penalty.loss);
      const history = this.s3.quickRespawnHistory;
      if (enemyDeath) {
        if (history.seenEnemyDeath && history.splats === 0) this.respawnTimer = Math.max(0, this.respawnTimer - (penalty.incoming ? penalty.quickReduction : this.s3.modifiers.quickRespawnReduction));
        history.seenEnemyDeath = true; history.splats = 0;
        this.s3.splatsThisLife = 0;
      }
      this.respawnTimer += penalty.frames / 60;
      this.s3.lastDeathGear = penalty;
    }
    return result;
  };
  api.on('splatted', ({ attacker, victim }) => {
    if (attacker?.s3 && victim && attacker !== victim && attacker.team !== victim.team) {
      attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1;
      if (attacker.s3.quickRespawnHistory) attacker.s3.quickRespawnHistory.splats++;
    }
  });
  const update = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    refresh(this.a);
    const a = this.a, m = a.s3?.modifiers || {}, beforeInk = a.ink;
    const sub = selectedSub(a, api.SUB);
    const hold = this.s3SubHold || 0;
    const charge = sub.chargeable ? Math.min(1, Math.max(0, hold / sub.maxChargeTime)) : 0;
    const subDelay = sub.inkRecoverStopMaxCharge == null ? sub.inkRecoverStop
      : sub.inkRecoverStop + (sub.inkRecoverStopMaxCharge - sub.inkRecoverStop) * charge;
    const effectiveSubCost = (sub.inkCost ?? sub.inkCostFallback) * (m.inkSaverSub ?? 1);
    const bombsBefore = G.projectiles?.bombs?.length ?? 0;
    try { return update.call(this, dt, input); }
    finally {
      const bombSpent = (G.projectiles?.bombs?.length ?? bombsBefore) > bombsBefore;
      const progressiveChargerSpend = !!this.s3ChargerProgressiveSpend;
      this.s3ChargerProgressiveSpend = false;
      const spent = Math.max(0, beforeInk - a.ink);
      if (spent > 1e-10) {
        a.s3 ||= {};
        const mainSpent = (sub === api.SUB.bomb ? (!bombSpent || spent > effectiveSubCost + 1e-8) : !input.subReleased) && !progressiveChargerSpend;
        const rollingUse = mainSpent && !input.subReleased && a.weapon.kind === 'roller' && this.rolling;
        a.s3.rollerRefillMode = rollingUse;
        let delay = 0;
        if (mainSpent) {
          const mainDelay = rollingUse ? a.weapon.rollInkRecoverStop
            : this.s3FlickVertical ? a.weapon.verticalInkRecoverStop ?? a.weapon.inkRecoverStop
            : a.weapon.inkRecoverStop;
          delay = Math.max(delay, mainDelay ?? tuning.resources.inkRefillDelay);
        }
        if (input.subReleased && (sub !== api.SUB.bomb || bombSpent || this.s3SubReleased)) delay = Math.max(delay, subDelay ?? tuning.resources.inkRefillDelay);
        a.s3.recoverStopRemaining = Math.max(a.s3.recoverStopRemaining || 0, delay);
      }
    }
  };
  installSubReady(api, tuning);
  installStormPower(api);
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
        const row = document.createElement('label'); const labelText = document.createElement('span'); labelText.dataset.slot = String(slot); row.append(labelText);
        const select = document.createElement('select'); select.setAttribute('aria-label', `${label} ${slot === 0 ? 'メイン' : '追加' + slot}`);
        for (const [id, name] of Object.entries(ABILITIES)) {
          if (!abilityAllowed(id, piece, slot, id === 'abilityDoubler' ? SPLATFEST_TEE : loadout[piece].item) || id !== 'none' && !CLOTHING_ABILITIES.includes(id) && !HEAD_ABILITIES.includes(id) && id !== 'ninjaSquid' && !tuning.gear[id]) continue;
          const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option);
        }
        select.value = slot === 0 ? loadout[piece].main : loadout[piece].subs[slot - 1];
        select.addEventListener('keydown', event => event.stopPropagation());
        select.addEventListener('change', () => {
          if (slot === 0) { loadout[piece].main = select.value; if (select.value === 'abilityDoubler') loadout[piece].item = SPLATFEST_TEE; }
          else loadout[piece].subs[slot - 1] = select.value;
          updateLabels();
          try { localStorage.setItem(STORAGE, JSON.stringify(loadout)); } catch { /* sandbox/private mode */ }
          if (G.match?.local && G.match?.attract) equip(G.match.local);
        });
        row.append(select); field.append(row);
      }
      function updateLabels() {
        const doubled = loadout[piece].item === SPLATFEST_TEE && loadout[piece].main === 'abilityDoubler';
        for (const el of field.querySelectorAll('[data-slot]')) { const slot = Number(el.dataset.slot); el.textContent = slot === 0 ? doubled ? 'フェスT（倍化）' : 'メイン（10）' : `追加 ${slot}（${doubled ? 6 : 3}）`; }
      }
      updateLabels();
      details.append(field);
    });
    return details;
  }
}
