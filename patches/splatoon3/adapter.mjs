import { adaptRollerMaxPaint } from './roller-max-paint-adapter.mjs';
import { adaptHostTeams } from './lobby-host-team-adapter.mjs';
import { adaptLocalBatch01 } from './local-batch-01-adapter.mjs';
import { adaptAssistPresentation } from './assist-presentation-adapter.mjs';
import { adaptMatchHud } from './match-hud-adapter.mjs';
import { adaptChargerSurface } from './charger-surface-adapter.mjs';
import { adaptGearSub } from './gear-sub-adapter.mjs';
import { adaptContactRecovery } from './contact-recovery-adapter.mjs';
import { adaptWeaponPaintInertia } from './weapon-paint-inertia-adapter.mjs';
import { adaptWeaponEdgecases } from './weapon-edgecases-adapter.mjs';
import { adaptWeaponsFidelity } from './weapons-adapter.mjs';
import { adaptMinimapDirty } from './minimap-dirty-adapter.mjs';
import { adaptRespawnLifecycle } from './respawn-lifecycle-adapter.mjs';
import { adaptStormEffects } from './storm-effects-adapter.mjs';
import { adaptAgent3WeaponPhysics } from './agent3-weapon-physics-adapter.mjs';
import { adaptPadSensitivity } from './pad-sensitivity-adapter.mjs';
import { adaptCombatRange } from './combat-range-adapter.mjs';
import { adaptChargerFieldCollision } from './charger-field-adapter.mjs';
import { adaptKitRescue } from './kit-rescue-adapter.mjs';
import { adaptRollerDepletion } from './roller-depletion-adapter.mjs';
// Apply only to a disposable BUILD tree. Upstream sources are never modified.
// Every connection has a unique exact anchor; missing/duplicated hooks are errors.
import { adaptMovementPhysics } from './movement-physics-adapter.mjs';
import { adaptSubSpecialFidelity } from './sub-special-adapter.mjs';
import { adaptChargerSightCache } from './charger-sight-cache-adapter.mjs';
import { adaptJuddResult } from './judd-result-adapter.mjs';
import { adaptScoreHud } from './score-hud-adapter.mjs';
import { adaptPaintSplatPool } from './paint-splat-pool-adapter.mjs';
import { adaptPaintOwnership } from './paint-ownership-adapter.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptIssue415 } from './runtime/issue-415-adapter.mjs';
import { adaptIssueBatch1171 } from './issue-batch-1171-adapter.mjs';
import { adaptTidalSlamGauge } from './tidal-slam-gauge-adapter.mjs';
export const PATCH_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

export function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`INKWAVE patch conflict (${label}): expected exactly one connection. Review upstream changes; site was not built.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function checkCompatibility(src, patchRoot = PATCH_ROOT) {
  const lock = JSON.parse(fs.readFileSync(path.join(patchRoot, 'upstream-lock.json'), 'utf8'));
  const conflicts = [];
  for (const [file, hash] of Object.entries(lock.files)) {
    const abs = path.join(src, file);
    if (!fs.existsSync(abs) || sha256(fs.readFileSync(abs)) !== hash) conflicts.push(file);
  }
  if (conflicts.length) throw new Error(`INKWAVE patch compatibility review required: ${conflicts.join(', ')}. See patches/splatoon3/README.md. No unpatched fallback is published.`);
  return lock;
}

export function adaptSource(rel, code) {
  code = adaptIssueBatch1171(rel, code, replaceOnce);
  // The source-guided shooter-family InkFlightRuntime is the authority for
  // head integration and detached paint drops. It does not traverse the
  // patched generic Projectiles._step actor loop. Bridge its actor contact
  // with the SAME sourced teammate-through window installed on each main
  // projectile, rather than silently letting bullets cross an ally.
  if (rel === 'src/game/inkFlightRuntime.js') {
    // Native shooter-family heads and detached drops bypass the generic
    // projectile impact path, but retain its local late-paint credit owner.
    code = replaceOnce(code,
      'const options = { seed: p.seed, kind, face: hit.face,',
      'const options = { seed: p.seed, kind, face: hit.face, claimOwner: p.owner,',
      'native ink-flight temporal paint owner');
    code = replaceOnce(code,
      'this.base.set(actor.pos.x, actor.pos.y + (actor.smoothY || 0), actor.pos.z);',
      'this.base.set(actor.pos.x, actor.pos.y, actor.pos.z);',
      'ink flight contact ignores render-only smoothing');
    // #385/#604/#597: Source-guided head motion and sourced S3 wall-drop
    // share one collision authority. A wall impact must retain the falling
    // droplet state instead of treating every wall as a terminal head hit.
    code = replaceOnce(code,
      '  stepHead(p, dt) {\n    p.inkCarry += dt;',
      '  stepHead(p, dt) {\n    if (p.fidelityWallDrop) return advanceFidelityWallDrop(this.system, p, dt);\n    p.inkCarry += dt;',
      'ink flight retained S3 wall-drop update');
    code = replaceOnce(code,
      '      if (first <= 1) {\n        p.pos.lerpVectors(p.prev, p.pos, first);',
      '      if (first <= 1) {\n        p.pos.lerpVectors(p.prev, p.pos, first);\n        if (!target && !boss && world.hit && beginFidelityWallDrop(this.system, p, world)) return false;',
      'ink flight first wall contact admits sourced WallDrop phase');
    code = "import { coherentMotionStart } from '../../patches/splatoon3/runtime/actor-motion.mjs';\n" +
      "import { hurtboxRadius, hurtboxHeight } from '../../patches/splatoon3/runtime/player-hurtbox.mjs';\n" +
      "import { beginFidelityWallDrop, advanceFidelityWallDrop } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n" + code;
    code = replaceOnce(code,
      '        if (!actor.alive || actor.team === p.team) continue;',
      '        const friendly = actor.team === p.team;\n' +
      '        if (!actor.alive || actor === p.owner || (friendly && (actor.submerged || !Number.isFinite(p.fidelityFriendThrough)))) continue;',
      'ink flight S3 team contact eligibility');
    code = replaceOnce(code,
      '        const t = capsuleEntry(p.prev, p.pos, this.base, PLAYER.radius,\n' +
      '          actor.form === \'squid\' ? PLAYER.squidHeight : PLAYER.height, p.inkPlayerRadius);',
      '        const motion = coherentMotionStart(actor);\n' +
      '        const bodyRadius = hurtboxRadius(actor, PLAYER), bodyHeight = hurtboxHeight(actor, PLAYER);\n' +
      '        let t;\n' +
      '        if (motion) {\n' +
      '          this.base.set(motion.x0, motion.y0, motion.z0);\n' +
      '          this.point.set(p.pos.x - (actor.pos.x - motion.x0), p.pos.y - (actor.pos.y - motion.y0),\n' +
      '            p.pos.z - (actor.pos.z - motion.z0));\n' +
      '          t = capsuleEntry(p.prev, this.point, this.base, bodyRadius, bodyHeight, p.inkPlayerRadius);\n' +
      '        } else t = capsuleEntry(p.prev, p.pos, this.base, bodyRadius, bodyHeight, p.inkPlayerRadius);',
      'ink flight same-tick actor motion and current per-form hurtbox');
    code = replaceOnce(code,
      '        // World wins ties: no wall-through damage, independent of actors order.',
      '        if (friendly && Number.isFinite(t) && (previousAge + INK_DT * t) * INK_HZ + EPS < p.fidelityFriendThrough) continue;\n' +
      '        // World wins ties: no wall-through damage, independent of actors order.',
      'ink flight S3 friend-through at first-contact age');
    code = replaceOnce(code,
      '            this.system.applyHit(p.owner, target, damage, p.wid || p.inkKey);',
      '            if (target.team !== p.team) this.system.applyHit(p.owner, target, damage, p.wid || p.inkKey);',
      'ink flight never damages a teammate');
    code = replaceOnce(code,
      "            G.fx?.burst(p.pos, this.normal, p.owner.color, { count: 6, speed: 3, size: 0.07 });",
      "            if (target.team !== p.team) G.fx?.burst(p.pos, this.normal, p.owner.color, { count: 6, speed: 3, size: 0.07 });",
      'ink flight friendly contact has no hostile-hit FX');
    code = replaceOnce(code,
      "            emit('weapon:impact', { pos: p.pos.clone(), normal: this.normal.clone(), team: p.team, kind: 'shot', radius: 0.3, victim: target });",
      "            if (target.team !== p.team) emit('weapon:impact', { pos: p.pos.clone(), normal: this.normal.clone(), team: p.team, kind: 'shot', radius: 0.3, victim: target });",
      'ink flight friendly contact has no hostile-hit packet');
    return code;
  }
  code = adaptPadSensitivity(rel, code, replaceOnce);
  code = adaptChargerFieldCollision(rel, code, replaceOnce);
  code = adaptHostTeams(rel, code, replaceOnce);
  code = adaptLocalBatch01(rel, code, replaceOnce);
  code = adaptRollerMaxPaint(rel,code,replaceOnce);
  // Only raw locked sources enter this build-only adapter. Re-applying a
  // completed or partial BUILD tree must reach the exact anchors and fail closed.
  // Storm owns the structural cloud-loop rewrite. Gear/Sub may then refine
  // the terminal frame boundary without hiding Storm's original connection.
  if (rel === 'src/game/weapons.js') code = adaptStormEffects(rel, code);
  code = adaptChargerSurface(rel, code, replaceOnce);
  code = adaptGearSub(rel, code, replaceOnce);
  code = adaptContactRecovery(rel, code, replaceOnce);
  code = adaptMatchHud(rel, code);
  code = adaptScoreHud(rel, code);
  code = adaptMinimapDirty(rel, code, replaceOnce);
  code = adaptRespawnLifecycle(rel, code, replaceOnce);
  if (rel !== 'src/game/weapons.js') code = adaptStormEffects(rel, code);
  code = adaptAssistPresentation(rel, code, replaceOnce);
  if (rel === 'src/config.js') {
    code = replaceOnce(code,
      '  gyroSens: 0,              // −5..+5, Splatoon 3 scale (0 = 132° of device turn per in-game 360°)',
      '  gyroSens: 0,              // −5..+5; provisional bridge ~1.8x at zero (S3 response unverified)',
      'gyro sensitivity provenance');
    return replaceOnce(code,
      '  minimap: true,', '  minimap: false,', 'optional corner map default');
  }
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code,
      'const fnv = (str) => { let x = 2166136261;',
      'export const fnv = (str) => { let x = 2166136261;',
      'export fnv');
    code = replaceOnce(code,
      'const tagTitle = (name) => {',
      'export const tagTitle = (name) => {',
      'export tagTitle');
    code = replaceOnce(code,
      'const tagNum = (name) =>',
      'export const tagNum = (name) =>',
      'export tagNum');
    code = replaceOnce(code,
      "    { key: '_howto', label: 'Controls reference', type: 'link', help: 'Every keyboard, mouse and controller binding in one place.' },",
      "    { key: '_howto', label: 'Controls reference', type: 'link', help: 'Every keyboard, mouse and controller binding in one place.' },\n" +
      "    { key: '_connectMotion', label: 'Connect Joy-Con / Pro Controller', type: 'link', linkLabel: 'CONNECT', help: 'Pair a Nintendo Switch Joy-Con (R) or Pro Controller via WebHID for motion gyro aiming.' },",
      'menus _connectMotion link');
    code = replaceOnce(code,
      "          const go = r.key === '_layout'\n" +
      "            ? () => { this._sfx('ui_click'); safeCall(() => this.api.editTouchLayout && this.api.editTouchLayout()); }\n" +
      "            : () => { this._sfx('ui_click'); this._go('howto'); };",
      "          const go = r.key === '_layout'\n" +
      "            ? () => { this._sfx('ui_click'); safeCall(() => this.api.editTouchLayout && this.api.editTouchLayout()); }\n" +
      "            : r.key === '_connectMotion'\n" +
      "            ? () => { const request = safeCall(() => (this.api.connectControllerMotion ? this.api.connectControllerMotion() : (typeof G !== 'undefined' && G.input?.requestWebHID ? G.input.requestWebHID() : null))); this._sfx('ui_click'); if (request?.then) request.then(result => { const state = result?.status, calibration = result?.initResult?.calibration; const message = state === 'bridge-available' ? calibration?.source === 'user' ? 'Controller motion connected using user gyro calibration.' : calibration?.source === 'factory' ? 'Controller motion connected using factory gyro calibration.' : 'Controller motion connected; nominal gyro calibration used (SPI unavailable).' : state === 'unsupported-platform' ? 'WebHID is unavailable in this browser.' : state === 'request-unsupported' ? 'This browser cannot open the WebHID chooser.' : state === 'no-device-selected' ? 'No controller was selected.' : state === 'initialization-failed' ? 'Controller initialization failed. Check WebHID permissions and reconnect.' : state === 'request-error' ? 'Controller connection was denied or failed.' : null; if (message) this.toast(tr(message), { kind: state === 'bridge-available' ? 'good' : state === 'no-device-selected' ? 'info' : 'error' }); }).catch(() => this.toast(tr('Controller connection was denied or failed.'), { kind: 'error' })); }\n" +
      "            : () => { this._sfx('ui_click'); this._go('howto'); };",
      'menus _connectMotion accept handler');
    code = replaceOnce(code,
    "{ key: 'minimap', label: 'Minimap', type: 'toggle', help: 'Show the turf minimap in the corner during matches.' },",
    "{ key: 'minimap', label: 'Corner map (non-S3 aid)', type: 'toggle', help: 'Optional aid outside the S3 baseline. The full Turf Map remains available.' },",
    'optional corner map explanation');
    code = replaceOnce(code,
      "h('div', { class: 'iw-res__foot' }, xpPanel, h('div', { class: 'iw-res__btns' },",
      "h('div', { class: 'iw-res__foot' }, online ? null : xpPanel, h('div', { class: 'iw-res__btns' },",
      'Private Battle result XP panel');
    return replaceOnce(code,
      "h('div', { class: 'iw-res__teams' }, table(0), table(1)),",
      "h('div', { class: 'iw-res__teams' }, table(winTeam), table(1 - winTeam)),",
      'winner-first Turf results order');
  }
  if (rel === 'src/core/gyro.js') {
    // #725: approximate public bridge endpoints, not extracted Nintendo code.
    return replaceOnce(code,
      'const GYRO_DEG = [[-5, 278], [-2.5, 178], [0, 132], [2.5, 119], [5, 110]];',
      'const GYRO_DEG = [[-5, 360], [0, 200], [5, 120]]; // ~1x / ~1.8x / ~3x public bridge',
      'gyro sensitivity reference endpoints');
  }
  if (rel === 'src/i18n.js') return replaceOnce(code,
    "  'Minimap': 'ミニマップ',",
    "  'Connect Joy-Con / Pro Controller': 'Joy-Con / Proコントローラー接続', 'Pair a Nintendo Switch Joy-Con (R) or Pro Controller via WebHID for motion gyro aiming.': 'WebHID経由でJoy-Con (R) または Proコントローラーを接続し、ジャイロ照準を使用します。',\n  'Controller motion connected using user gyro calibration.': 'ユーザー校正を使ってコントローラーのモーション入力を接続しました。', 'Controller motion connected using factory gyro calibration.': '工場校正を使ってコントローラーのモーション入力を接続しました。', 'Controller motion connected; nominal gyro calibration used (SPI unavailable).': 'SPI校正を取得できないため、公称値でコントローラーのモーション入力を接続しました。', 'WebHID is unavailable in this browser.': 'このブラウザーではWebHIDを利用できません。', 'This browser cannot open the WebHID chooser.': 'このブラウザーではWebHIDデバイス選択を開けません。', 'No controller was selected.': 'コントローラーが選択されませんでした。', 'Controller initialization failed. Check WebHID permissions and reconnect.': 'コントローラーを初期化できませんでした。WebHIDの許可を確認して再接続してください。', 'Controller connection was denied or failed.': 'コントローラーへの接続が拒否されたか失敗しました。',\n  'Corner map (non-S3 aid)': '画面端マップ（本家外の補助）', 'Optional aid outside the S3 baseline. The full Turf Map remains available.': '本家の標準とは異なる任意の補助です。全体マップは引き続き使用できます。',\n  'Minimap': 'ミニマップ',",
    'optional corner map Japanese explanation');
  if (rel === 'src/game/match.js') {
    // The lobby/roster protocol assigns team 0 to Alpha and team 1 to Bravo.
    // Preserve that match-side assignment; never redraw a winner at judgment.
    code = replaceOnce(code,
      'const win = cov[0] === cov[1] ? (Math.random() < 0.5 ? 0 : 1) : cov[0] > cov[1] ? 0 : 1;',
      'const win = cov[0] >= cov[1] ? 0 : 1; // Exact tie belongs to the assigned Alpha side.',
      'deterministic Alpha turf tie');
    code = replaceOnce(code, '  setState(s) {',
      '  setState(s) {\n    captureTurfFinish(this, s, G.paint, G.netm, G.game?.minimap);', 'Turf deadline snapshot before state listeners');
    code = replaceOnce(code, '    const cov = G.paint.coverage();',
      '    const cov = this.s3FinishCoverage ? [...this.s3FinishCoverage] : G.paint.coverage();', 'Turf judge deadline coverage');
    code = replaceOnce(code, "          if (!this.follower) this.setState('finish');",
      "          if (!this.follower) requestTurfFinish(this); else if (!this.s3DeadlineStep) blockExpiredGuestInput(this);", 'guest local deadline input cancellation');
    // #923: the turf finish/judge state machine and neutral bot intents still
    // advance. Only Actor combat/physics and the pairwise soft-push are skipped.
    // simulateMatchInterval continues ticking projectiles and their distinct
    // post-time special terminal rules; never clear the flight queue at TIME UP.
    code = replaceOnce(code,
      '    const nm = G.netm;\n    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }',
      '    if (!this.attract && !this.bossMode && (this.mode == null || this.mode === \'turf\') && (this.state === \'finish\' || this.state === \'judge\')) return;\n    const nm = G.netm;\n    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }',
      'post-TIME-UP turf actors stop physics while live projectiles continue');
    code = replaceOnce(code, '    if (!this.controller) return;',
      '    if (blockExpiredGuestInput(this) || !this.controller) return;', 'guest deadline controller admission');
    code = replaceOnce(code,
      '        a.pos.x -= (dx / d) * push * ka; a.pos.z -= (dz / d) * push * ka;\n        b.pos.x += (dx / d) * push * kb; b.pos.z += (dz / d) * push * kb;',
      '        softPushActor(G.physics, PLAYER, a, -(dx / d) * push * ka, -(dz / d) * push * ka);\n        softPushActor(G.physics, PLAYER, b, (dx / d) * push * kb, (dz / d) * push * kb);',
      'world-aware actor soft push');
    code = replaceOnce(code,
      '    const pickTeam = (first) => {\n      const pool = [...WEAPON_ORDER];\n      const out = [];\n      if (first) { out.push(first); pool.splice(pool.indexOf(first), 1); }',
      "    const independent = this.mode !== 'boss' && !this.attract;\n    const pickTeam = (first) => {\n      const pool = [...WEAPON_ORDER];\n      const out = [];\n      if (first) { out.push(first); if (!independent) pool.splice(pool.indexOf(first), 1); }",
      'standard Turf weapon draws keep the local weapon');
    code = replaceOnce(code,
      '        out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);',
      '        const pick = (Math.random() * pool.length) | 0;\n        out.push(independent ? pool[pick] : pool.splice(pick, 1)[0]);',
      'standard Turf weapon draws allow duplicates');
    code = "import { softPushActor } from '../../patches/splatoon3/runtime/movement-physics.mjs';\nimport { captureTurfFinish, blockExpiredGuestInput, requestTurfFinish } from '../../patches/splatoon3/runtime/turf-finish.mjs';\n" + code;

    return code;
  }
  if (rel === 'src/game/actor.js' && !code.includes('_s3SlosherBirthEpoch = (this._s3SlosherBirthEpoch || 0) + 1')) {
    code = replaceOnce(code, '  reset() {',
      '  reset() {\n    markActorMotionDiscontinuity(this);\n    this._s3SlosherBirthEpoch = (this._s3SlosherBirthEpoch || 0) + 1;',
      'cancel pending Slosher births when an actor resets');
    code = "import { markActorMotionDiscontinuity } from '../../patches/splatoon3/runtime/actor-motion.mjs';\n" + code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code,
      '    const wasFull = this.ink >= P.inkMax;\n    if (this.submerged || this.climbing) this.ink = Math.min(P.inkMax, this.ink + P.inkRefillSwim * dt);\n    else if (!isSquid && this.lastFire > P.inkRefillDelay && !this.weaponRunner.busy()) this.ink = Math.min(P.inkMax, this.ink + P.inkRefillKid * dt);\n    else if (isSquid) this.ink = Math.min(P.inkMax, this.ink + P.inkRefillKid * 0.5 * dt);',
      '    const wasFull = this.ink >= P.inkMax;\n    const inkRecoveryBlocked = (this.weaponRunner?.s3InkRecoverRemaining || 0) > 1e-10;\n    if (!inkRecoveryBlocked && (this.submerged || this.climbing)) this.ink = Math.min(P.inkMax, this.ink + P.inkRefillSwim * dt);\n    else if (!inkRecoveryBlocked && !isSquid && this.lastFire > P.inkRefillDelay && !this.weaponRunner.busy()) this.ink = Math.min(P.inkMax, this.ink + P.inkRefillKid * dt);\n    else if (!inkRecoveryBlocked && isSquid) this.ink = Math.min(P.inkMax, this.ink + P.inkRefillKid * 0.5 * dt);',
      'Blaster source-backed ink recovery admission');
  }
  if (rel === 'patches/splatoon3/runtime/resources.mjs') return adaptIssue415(rel, code);
  code = adaptMovementPhysics(rel, code, replaceOnce);
  code = adaptSubSpecialFidelity(rel, code, replaceOnce);
  code = adaptPaintSplatPool(rel, code, replaceOnce);
  if (rel !== 'src/game/weapons.js') code = adaptKitRescue(rel, code, replaceOnce);
  if (rel === 'src/world/paint.js') {
    code = replaceOnce(code,
      '  float tn = vGrow.x;',
      '  float tn = vGrow.x;\n  bool bodyOnly = vGrow.z > 1.5;',
      'paint body-only shader mode');
    code = replaceOnce(code,
      '    float grow = mix(0.4, 1.0, tb);',
      '    float grow = mix(0.4, 1.0, tb);',
      'paint native body growth');
    code = replaceOnce(code,
      '  if (vGrow.z < 0.5) {',
      '  if (vGrow.z < 0.5 || bodyOnly) {',
      'paint body visibility');
    code = replaceOnce(code,
      '    // ---- rays: short tapered streaks shot out ahead of the body (the splat\'s "star"), mostly stubby with the odd\n' +
      '    // long one, each ending in a bead where the ink collected as it flew',
      '    if (!bodyOnly) {\n' +
      '    // ---- rays: short tapered streaks shot out ahead of the body (the splat\'s "star"), mostly stubby with the odd\n' +
      '    // long one, each ending in a bead where the ink collected as it flew',
      'paint body-only ancillary effects');
    code = replaceOnce(code,
      '      sd = min(sd, length(p - u * r * (1.3 + 1.2 * h2)) - rad);\n' +
      '    }\n' +
      '  }\n' +
      '  // ---- drips on walls:',
      '      sd = min(sd, length(p - u * r * (1.3 + 1.2 * h2)) - rad);\n' +
      '    }\n' +
      '    }\n' +
      '  }\n' +
      '  // ---- drips on walls:',
      'paint body-only effect boundary');
    code = replaceOnce(code,
      '  if (isWall > 0.5 && fall > 0.3 && ks.w > 0.0) {',
      '  if (!bodyOnly && isWall > 0.5 && fall > 0.3 && ks.w > 0.0) {',
      'paint body-only drip suppression');
    code = replaceOnce(code, '  _emitGrowth(g, tn, dT, dripOnly) {', '  _emitGrowth(g, tn, dT, dripOnly) {', 'paint growth submission');
    code = replaceOnce(code, '  _pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) {', '  _pushQuad(f, u0, u1, v0, v1, lu, lv, dn, R, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) {', 'paint quad submission');
    code = replaceOnce(code, 'this.growing.push(g);', 'this.growing.push(g);', 'paint deferred growth record');
  }
  if (rel === 'src/game/character.js') {
    code = replaceOnce(code, 'const PN = _k;', 'const PN = _k;\nexport const CHARACTER_CHANNELS = Object.freeze({ HIPS_P,HIPS,SPINE,CHEST,NECK,HEAD,CLAVL,CLAVR,UARML,UARMR,FARML,FARMR,HANDL,HANDR,FOOTL,FOOTLR,FOOTR,FOOTRR,ANC,ANCR,ANL,ANLR,POLER,POLEL,IKR,IKL,LTGT,LTGTR,LTW,LTROT,KNEEL,KNEER,STAB,WPL,WPR,TIPTOE,AFOLT,AFOLR,MODEL,MODELR,SQY,SQXZ,HLP });', 'character pose channels');
    code = replaceOnce(code, 'const BALL_Z = 0.11, HEEL_Z = 0.065;', 'const BALL_Z = 0.11, HEEL_Z = 0.065;\nexport const CHARACTER_FOOT_METRICS = Object.freeze({ ANKLE_H, BALL_Z, HEEL_Z });', 'character foot metrics');
    code = replaceOnce(code, 'const TN = _tk;', 'const TN = _tk;\nexport const CHARACTER_TIMERS = Object.freeze({ T_FLICK,T_LEAP,T_SLAM,T_DODGE,T_SPAWN,T_LAND,T_SHOOT,T_SHOOTL,T_THROW,T_SLOSH,T_REL });', 'character timers');
    code = replaceOnce(code, 'const M_GAIT = 0, M_CATCH = 1, M_SETTLE = 2;', 'const M_GAIT = 0, M_CATCH = 1, M_SETTLE = 2;\nexport const CHARACTER_FOOT_MODES = Object.freeze({ M_GAIT,M_CATCH,M_SETTLE });', 'character foot modes');
    const start = code.indexOf('    // ---------------- locomotion\n'), end = code.indexOf('    // ---------------- lean springs:', start);
    if(start<0 || end<0) throw new Error('INKWAVE patch conflict: walking pose');
    code=replaceOnce(code,code.slice(start,end),'    // ---------------- locomotion (independent calibrated motion layer)\n    if (walkActive(this)) applyWalkLocomotion(this, P);\n    else {\n'+code.slice(start,end)+'    }\n\n','walking pose');
    code=replaceOnce(code,'const lp = spr(sp, S_LEANP, clamp(af * 0.0075, -0.36, 0.3) * g, 2.2, 0.4, dt);',"const lp = walkLean(this, 'pitch', af, g, dt) ?? spr(sp, S_LEANP, clamp(af * 0.0075, -0.36, 0.3) * g, 2.2, 0.4, dt);",'walking pitch spring');
    code=replaceOnce(code,'const lr = spr(sp, S_LEANR, clamp(-al * 0.0068, -0.34, 0.34) * g, 2.0, 0.48, dt);',"const lr = walkLean(this, 'roll', al, g, dt) ?? spr(sp, S_LEANR, clamp(-al * 0.0068, -0.34, 0.34) * g, 2.0, 0.48, dt);",'walking roll spring');
    code=replaceOnce(code, '&& f.sw && f.su > 0.02 && f.su < 0.9) continue;', '&& walkSwingUnloaded(this, f)) continue;', 'walking support load');
    code=replaceOnce(code, 'const d = _v5.length(), mxr = this.legReach * 0.97;', 'const d = _v5.length(), mxr = walkFootReach(this, this.feet[i]);', 'walking planted ankle reach');
    code=replaceOnce(code, 'B.hips.position.y -= Math.max(drop * 0.85, this.hipDrop);', 'B.hips.position.y -= walkPelvisDrop(this, Math.max(drop * 0.85, this.hipDrop));', 'walking support pelvis reach');
    code=replaceOnce(code, 'this.tread = this.hs < 0.12 && sv > 0.4 && lml > 0.05 && this.grounded;', 'this.tread = walkTreadAllowed(this, this.hs < 0.12 && sv > 0.4 && lml > 0.05 && this.grounded);', 'walking actual root treadmill');
    code=replaceOnce(code, 'const lock = kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1));', 'const lock = dualiesMotionLock(this, R, kid && !dance && this.dual && ((R ? (R.lockT || 0) > 0 || (!!R.dodge && dk > 0.55) : this.tr[T_DODGE] < this.dodgeDur + 0.5) || (dk > 0.55 && dk < 1)));', 'dualies native pre-aim admission');
    code=replaceOnce(code, 'this.tr[T_DODGE] > this.dodgeDur * 0.86', 'dualiesMotionAllowsFootPlant(this, this.tr[T_DODGE] > this.dodgeDur * 0.86)', 'dualies native foot admission');
    code = replaceOnce(code, 'this.tr[T_LEAP] > 1.9 && this.tr[T_SLAM] > 1.4', 'specialMotionAllowsFootPlant(this, this.tr[T_LEAP] > 1.9 && this.tr[T_SLAM] > 1.4)', 'special foot-plant ownership');
    code = replaceOnce(code, 'st.sinceFlick = this.tr[T_FLICK];', 'st.sinceFlick = this.s3RollerFlick?.elapsed ?? this.tr[T_FLICK];', 'roller weapon elapsed clock');
    code = replaceOnce(code, "    if (tr[T_FLICK] < 0.7 && this.weaponKind === 'roller') this._poseFlick(P, tr[T_FLICK]);", "    if (this.weaponKind === 'roller' && (this.s3RollerFlick ? this.s3RollerFlick.elapsed < this.s3RollerFlick.interval : tr[T_FLICK] < 0.7)) this._poseFlick(P, tr[T_FLICK]);", 'roller recovery pose duration');
    // Capture actual native pose methods before installers decorate them.
    // Both named source connections are mandatory; no private pose copy.
    for (const [anchor, label] of [['  _poseThrow(P, tt) {', 'native bomb throw pose'], ['  _applyPose(dt, s) {', 'native bomb pose application']])
      code = replaceOnce(code, anchor, anchor, label);
    code += '\nexport const CHARACTER_BOMB_POSE = Object.freeze({ throw: Character.prototype._poseThrow, apply: Character.prototype._applyPose });\n';
    // Roller middle hinge (#916): the native static yoke gains one articulated group
    // that owns the roller-side parts and the drum. Dedicated connection, kept apart
    // from the independent #915 weapon-transform ownership.
    code = replaceOnce(code, '    const muzzle = new THREE.Object3D(); muzzle.position.copy(d.muzzle); off.add(muzzle);',
      '    const muzzle = new THREE.Object3D(); muzzle.position.copy(d.muzzle); off.add(muzzle);\n    const fold = attachRollerFold(d, off, parts, drum);', 'roller articulated hinge group');
    code = replaceOnce(code, 'return { def: d, pivot, off, body, ink, bodyFar, inkFar, glow, drum, muzzle, parts, partList, lamps, coil, near: true, pump: 0, trig: 0, left: null, hidden: 0 };',
      'return { def: d, pivot, off, body, ink, bodyFar, inkFar, glow, drum, muzzle, parts, partList, lamps, coil, fold, near: true, pump: 0, trig: 0, left: null, hidden: 0 };', 'roller fold instance handle');
    return "import { attachRollerFold } from '../../patches/splatoon3/runtime/roller-fold.mjs';\nimport { dualiesMotionLock, dualiesMotionAllowsFootPlant } from '../../patches/splatoon3/runtime/action-admission.mjs';\nimport { specialMotionAllowsFootPlant } from '../../patches/splatoon3/runtime/special-motion.mjs';\nimport { applyWalkLocomotion, walkLean, walkSwingUnloaded, walkFootReach, walkPelvisDrop, walkTreadAllowed, walkActive } from '../../patches/splatoon3/runtime/walk.mjs';\n"+code;
  }
  if (rel === 'styles/hud.css') {
    // Shooter-only placement; preserve the native spread signal and all other reticles.
    code = replaceOnce(code,
      '/* Four outward-facing spread brackets, separate from the eight charge segments. */',
      `/* #871: diagonal strokes at four rectangular corners. Nintendo's 1280x720
   reference images 01/005.jpg and 01/021.jpg measure a ~48px vertical span,
   ~3px stroke and ~14px diagonal length. Horizontal separation alone follows
   the existing projected spread. See shooter-reticle-reference.json. */
.iw-ret--shooter .iw-ret__tick {
  --iw-corner-x: calc(24px + var(--sp, 0) * 1px);
  left: -1.5px; top: -7px; width: 3px; height: 14px;
  background: currentColor; border: 0; border-radius: 2px;
  transform: translate(var(--iw-cx), var(--iw-cy)) rotate(var(--iw-angle));
}
.iw-ret--shooter .iw-ret__tick:nth-child(3) { --iw-cx: calc(0px - var(--iw-corner-x)); --iw-cy: -24px; --iw-angle: 45deg; }
.iw-ret--shooter .iw-ret__tick:nth-child(4) { --iw-cx: var(--iw-corner-x); --iw-cy: -24px; --iw-angle: -45deg; }
.iw-ret--shooter .iw-ret__tick:nth-child(5) { --iw-cx: calc(0px - var(--iw-corner-x)); --iw-cy: 24px; --iw-angle: -45deg; }
.iw-ret--shooter .iw-ret__tick:nth-child(6) { --iw-cx: var(--iw-corner-x); --iw-cy: 24px; --iw-angle: 45deg; }
/* Four outward-facing spread brackets, separate from the eight charge segments. */`,
      'Shooter measured four-corner spread strokes');
  }
  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(code,
      '        <circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/></svg>`;',
      '        <circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/></svg><span class="iw-ret__bias" hidden aria-hidden="true"></span>`;',
      'Blaster outer-bias cue element');
    code = replaceOnce(code,
      '// ------------------------------------------------------------------ HUD-only art',
      "// Splatoon 3 drives the charge reticle off the runner's fixed-tick charge clock, never the\n" +
      "// render cadence. The standard Splat Charger keeps the whole reticle off for its profile's\n" +
      "// 5F display delay, then fills (chargeFrames - delay) / (fullChargeFrames - delay), so 6F\n" +
      "// already reads 1/55. `delayed` separates a real charge still inside that dead period from\n" +
      "// an idle runner, so only the former hides the reticle: idle Charger/Splatling visibility is\n" +
      "// a separate owner and is deliberately not gated here. Presentation only: the authoritative\n" +
      "// runner charge, shot damage, range, ink cost and projectile timing are never read back.\n" +
      'function chargerReticleView(runner, w) {\n' +
      '  if (!runner || !runner.charging) return { visible: false, charging: false, delayed: false, gauge: 0 };\n' +
      '  const fullFrames = Math.max(1, Math.round((w.chargeTime || 1) * 60));\n' +
      '  const frames = Math.max(0, +runner.chargeT || 0) * fullFrames;\n' +
      '  const delay = Math.max(0, +w.reticleDelayF || 0);\n' +
      '  if (frames <= delay + 1e-9) return { visible: false, charging: true, delayed: true, gauge: 0 };\n' +
      '  return { visible: true, charging: true, delayed: false, gauge: clamp((frames - delay) / Math.max(1, fullFrames - delay)) };\n' +
      '}\n' +
      '\n' +
      '// ------------------------------------------------------------------ HUD-only art',
      'charger charge-reticle display delay helper');
    code = replaceOnce(code,
      "    if (L.kind === 'charger') {\n      const c = clamp(+f.charge || 0);\n      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {\n        L.charge = c;\n        this._chargeEl.style.strokeDashoffset = (this._chargeC * (1 - c)).toFixed(2);\n        this.ret.style.setProperty('--ch', c.toFixed(3));\n      }\n      const full = c >= 0.999;\n      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }\n      const charging = c > 0.001;\n      if (charging !== L.charging) { L.charging = charging; this.ret.classList.toggle('is-charging', charging); }\n    } else if",
      "    if (L.kind === 'charger') {\n      const view = chargerReticleView(this._local()?.weaponRunner, WEAPONS[w] || {});\n      const c = view.gauge;\n      if (L.charge == null || Math.abs(c - L.charge) > 0.004) {\n        L.charge = c;\n        this._chargeEl.style.strokeDashoffset = this._chargeC * (1 - c);\n        this.ret.style.setProperty('--ch', c.toFixed(3));\n      }\n      const full = view.visible && c >= 0.999;\n      if (full !== L.full) { L.full = full; this.ret.classList.toggle('is-full', full); if (full) this._restart(this.ret, 'is-flash'); }\n      const charging = view.visible;\n      if (charging !== L.charging) { L.charging = charging; this.ret.classList.toggle('is-charging', charging); }\n      const delayed = view.delayed;\n      if (delayed !== L.chargeDelay) { L.chargeDelay = delayed; this.ret.classList.toggle('is-charge-delay', delayed); }\n      let reachOn = view.visible && !!ch.chargerCurrent && !!ch.chargerFull;\n      if (reachOn) {\n        const cam = G.rig?.gameCam || G.camera;\n        const current = cam ? this._project(cam, ch.chargerCurrent.x, ch.chargerCurrent.y, ch.chargerCurrent.z) : null;\n        const fullReach = cam ? this._project(cam, ch.chargerFull.x, ch.chargerFull.y, ch.chargerFull.z) : null;\n        reachOn = !!current && !!fullReach && current.z >= -1 && current.z <= 1 && fullReach.z >= -1 && fullReach.z <= 1;\n        if (reachOn) {\n          this.ret.style.setProperty('--crx', (current.x * innerWidth * 0.5).toFixed(1) + 'px');\n          this.ret.style.setProperty('--cry', (-current.y * innerHeight * 0.5).toFixed(1) + 'px');\n          this.ret.style.setProperty('--cfx', (fullReach.x * innerWidth * 0.5).toFixed(1) + 'px');\n          this.ret.style.setProperty('--cfy', (-fullReach.y * innerHeight * 0.5).toFixed(1) + 'px');\n        }\n      }\n      this.ret.classList.toggle('has-reach', reachOn);\n    } else if",
      'charger charge-reticle display delay');
    code = replaceOnce(code,
      '    this._L.spread = null; this._L.charge = null; this._L.full = null;',
      '    this._L.spread = null; this._L.charge = null; this._L.full = null; this._L.chargeDelay = null;\n' +
      '    this._L.blasterCue = null; this._L.blasterCuePhase = null;\n' +
      '    this._blasterBiasEl = kind === \'blaster\' ? r.querySelector(\'.iw-ret__bias\') : null;',
      'reset charge-delay and Blaster bias presentation state');
    code = replaceOnce(code,
      "    if (L.kind === 'slosher') {",
      "    // S3 charge-reticle lifecycle (#594): a charging weapon shows no charge cluster while idle.\n" +
      "    if (L.kind === 'charger' || L.kind === 'splatling') {\n" +
      "      const retIdle = !(+f.charge > 0.001) && !(L.kind === 'splatling' && !!L.streaming);\n" +
      "      this.ret.classList.toggle('is-idle', retIdle);\n" +
      "    }\n" +
      "    if (L.kind === 'slosher') {",
      'idle charge reticle lifecycle');
    // #631: teammate death location is disclosed only by the explicit Ouch signal.
    code = replaceOnce(code, '    if (me && victim.team === me.team) this._allyDown(victim, attacker);\n', '', 'automatic ally-down marker (#631)');
    code = replaceOnce(code,
      "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {",
      "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES, winner: authoritativeWinner = null } = {}) {",
      'authoritative Turf winner HUD input');
    code = replaceOnce(code,
      '      const winner = Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
      '      const winner = authoritativeWinner === 0 || authoritativeWinner === 1 ? authoritativeWinner : Math.abs(pa - pb) < 0.05 ? -1 : pa > pb ? 0 : 1;',
      'authoritative Turf winner HUD reveal');
    code = replaceOnce(code, 'const lock = !!(lr && lr.lockT > 0), roll = !!(lr && lr.dodge);',
      'const lock = !!(lr && lr.s3Turret), roll = !!(lr && lr.dodge);', 'Dualies HUD authoritative turret lifetime');
    code = replaceOnce(code,
      `    } else if (kind === 'slosher') {
      // the lob: an arch over the aim point and a landing "bucket" bracket under it
      r.innerHTML = \`<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">
        <path class="iw-ret__ring iw-ret__arch" d="M-24 6 Q0 -26 24 6"/><path class="iw-ret__ring thin" d="M-10 13 L-6 18 L6 18 L10 13"/>
        <path class="iw-ret__ring thin" d="M-24 6 L-27 1 M24 6 L27 1"/></svg>\`;
    } else if (kind === 'splatling') {`,
      `    } else if (kind === 'splatling') {`, 'slosher trajectory reticle (#652)');
    code = replaceOnce(code,
      `    if (L.kind === 'slosher') {
      const k = this._kick;
      if (L.bk == null || Math.abs(k - L.bk) > 0.02) { L.bk = k; this.ret.style.setProperty('--kk', k.toFixed(2)); }
    }
    // spawn shield + bomb aim`,
      `    // spawn shield + bomb aim`, 'slosher arch kick writer (#652)');
    code = replaceOnce(code,
      '    const ch = f.crosshair || {};',
      '    const ch = f.crosshair || {};\n    applyShotGuide(this, ch.guide, innerWidth, innerHeight);\n' +
      '    const muzzleBlock = L.kind === \'shooter\' && Number.isFinite(ch.muzzleBlock?.x) && Number.isFinite(ch.muzzleBlock?.y) ? ch.muzzleBlock : null;\n' +
      '    const muzzleBlockKey = muzzleBlock ? `${muzzleBlock.x.toFixed(1)}|${muzzleBlock.y.toFixed(1)}` : \'\';\n' +
      '    if (muzzleBlockKey !== L.muzzleBlock) {\n' +
      '      L.muzzleBlock = muzzleBlockKey;\n' +
      '      if (muzzleBlock) {\n' +
      '        this.xh.style.setProperty(\'--muzzle-hit-x\', `${muzzleBlock.x.toFixed(1)}px`);\n' +
      '        this.xh.style.setProperty(\'--muzzle-hit-y\', `${muzzleBlock.y.toFixed(1)}px`);\n' +
      '      }\n' +
      '    }\n' +
      '    this.xh.classList.toggle(\'is-muzzle-blocked\', !!muzzleBlock);\n' +
      '    const localActor = this._local();\n' +
      '    const jumpState = L.kind === \'blaster\' ? localActor?.weaponRunner?.s3BlasterJumpState?.(localActor.weapon) : null;\n' +
      '    const cueActive = !!(jumpState?.supported && jumpState.active);\n' +
      '    if (this._blasterBiasEl) {\n' +
      '      const percent = cueActive ? Math.round(jumpState.bias * 100) : 0;\n' +
      '      const cuePhase = cueActive ? jumpState.phase : \'idle\';\n' +
      '      const cue = !cueActive ? \'\' : cuePhase === \'held\' ? `OUTER ${percent}%`\n' +
      '        : cuePhase === \'recovering\' ? \'RECOVERING\' : `OUTER ${percent}%`;\n' +
      '      if (cue !== L.blasterCue || cuePhase !== L.blasterCuePhase) {\n' +
      '        L.blasterCue = cue; L.blasterCuePhase = cuePhase;\n' +
      '        this._blasterBiasEl.hidden = !cueActive;\n' +
      '        this._blasterBiasEl.textContent = cue;\n' +
      '        if (this._blasterBiasEl.dataset) this._blasterBiasEl.dataset.phase = cuePhase; else this._blasterBiasEl.setAttribute?.(\'data-phase\', cuePhase);\n' +
      '      }\n' +
      '    }',
      'S3 ShotGuide, muzzle contact and Blaster jump-bias presentation');
    code = replaceOnce(code,
      '    } else if (kind === \'roller\') {\n' +
      '      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg wide" viewBox="-80 -40 160 80" aria-hidden="true">\n' +
      '        <path class="iw-ret__ring" d="M-46 -15 L-56 -15 Q-60 -15 -60 -11 L-60 11 Q-60 15 -56 15 L-46 15"/>\n' +
      '        <path class="iw-ret__ring" d="M46 -15 L56 -15 Q60 -15 60 -11 L60 11 Q60 15 56 15 L46 15"/>\n' +
      '        <path class="iw-ret__ring thin" d="M-30 22 Q0 30 30 22"/></svg>`;',
      '    } else if (kind === \'roller\') {\n' +
      '      r.innerHTML = `<i class="iw-ret__dot"></i><svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true">\n' +
      '        <circle r="7.5" class="iw-ret__ring thin"/>\n' +
      '        <path class="iw-ret__ring thin" d="M-25.04 -15.15 L-27.11 -11.04"/>\n' +
      '        <path class="iw-ret__ring thin" d="M27.27 -10.92 L25.23 -15.04"/>\n' +
      '        <path class="iw-ret__ring thin" d="M-27.05 11.04 L-24.98 15.15"/>\n' +
      '        <path class="iw-ret__ring thin" d="M25.04 15.15 L27.11 11.04"/></svg>`;',
      'compact Roller reticle');
    code = replaceOnce(code,
      '    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)',
      `    // S3 weapon ShotGuide projection: only aiming feedback moves; tank/sub/status remain centred.
    let guideX = 0, guideY = 0;
    const guideMe = this._local(), guideCam = G.rig?.gameCam || G.camera;
    if (L.kind === 'slosher' || L.kind === 'blaster') {
      const point = guideMe && guideCam && G.projectiles?.s3WeaponGuide?.(guideMe, guideMe.weapon, guideCam, innerWidth, innerHeight);
      const projected = point ? this._project(guideCam, point.x, point.y, point.z) : null;
      if (projected && projected.z < 1) {
        guideX = projected.x * innerWidth * 0.5;
        guideY = -projected.y * innerHeight * 0.5;
      }
    }
    const guideKey = \`\${guideX.toFixed(1)}|\${guideY.toFixed(1)}\`;
    if (guideKey !== L.guide) {
      L.guide = guideKey;
      this.xh.style.setProperty('--gx', \`\${guideX.toFixed(1)}px\`);
      this.xh.style.setProperty('--gy', \`\${guideY.toFixed(1)}px\`);
    }
    if (L.kind === 'dualies') {
      const pair = guideMe && guideCam && G.projectiles?.s3DualiesGuides?.(guideMe, guideMe.weapon, guideCam);
      const turret = !!guideMe?.weaponRunner?.s3Turret;
      if (pair && this._twin) {
        const previous = L.dualGuideValues || (L.dualGuideValues = []);
        for (let i = 0; i < 2; i++) {
          const point = this._project(guideCam, pair[i].x, pair[i].y, pair[i].z);
          const x = point && point.z < 1 ? point.x * innerWidth * .5 : 0;
          const y = point && point.z < 1 ? -point.y * innerHeight * .5 : 0;
          const keyX = Math.round(x * 10), keyY = Math.round(y * 10);
          if (!L.dualGuide || previous[i * 2] !== keyX || previous[i * 2 + 1] !== keyY || L.dualGuideTurret !== turret) {
            previous[i * 2] = keyX; previous[i * 2 + 1] = keyY;
            const baseX = i === 0 ? 10.5 : -10.5;
            const lockX = turret ? (i === 0 ? 4 : -4) : 0;
            this._twin[i]?.setAttribute('transform',
              \`translate(\${(x - baseX + lockX).toFixed(2)} \${y.toFixed(2)})\`);
          }
        }
        L.dualGuide = true; L.dualGuideTurret = turret;
      }
    } else if (L.dualGuide != null) {
      L.dualGuide = null;
      for (const twin of this._twin || []) twin?.removeAttribute('transform');
    }
    // per-shot kick (recoil events) on top of the live cone the engine reports in screen px (already includes bloom)`,
      'S3 weapon ShotGuide HUD projection');
    code = replaceOnce(code,
      '    const pad = G.level && G.level.spawnPads && G.level.spawnPads[me.team];',
      '    const pad = G.level && (G.level.homeSuperJumpPoints?.[me.team] || G.level.spawnPads?.[me.team]);',
      'home Super Jump HUD target');
    code = replaceOnce(code,
      "    const el = h('div', { class: 'iw-lineup' },\n" +
      "      side(this._myTeam()),\n" +
      "      h('div', { class: 'iw-lu__vs' }, h('span', { class: 'iw-lu__vsplat', html: splatSVG({ seed: 77, fill: '#fff', r: 56, arms: 10, drops: 6 }) }), h('span', { class: 'iw-display' }, 'VS')),\n" +
      "      side(1 - this._myTeam()));",
      "    // Issue #673: Splashtag intro identity.\n" +
      "    // Presentation metadata rides the native style payload (a.style.splashtag) that\n" +
      "    // src/net/session.js already packs as {name, weapon, style}; there is no a.profile\n" +
      "    // or a.tag producer, so nothing else is consulted. Exactly three safe shapes reach\n" +
      "    // the DOM: a numeric banner seed, a trusted in-repo asset key, and plain text.\n" +
      "    // Raw markup is never accepted, so no remote field can smuggle active content\n" +
      "    // into innerHTML through a value that only looks safe.\n" +
      "    const stagOf = (a) => (a && a.style && typeof a.style === 'object' && a.style.splashtag && typeof a.style.splashtag === 'object' && !Array.isArray(a.style.splashtag)) ? a.style.splashtag : null;\n" +
      "    const stagText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');\n" +
      "    const stagSeed = (v) => {\n" +
      "      if (typeof v === 'number') return Number.isFinite(v) ? v : null;\n" +
      "      if (typeof v === 'string' && /^[0-9]+$/.test(v.trim())) return Number(v.trim());\n" +
      "      return null;\n" +
      "    };\n" +
      "    const renderBadge = (b) => {\n" +
      "      const rec = (b && typeof b === 'object') ? b : null;\n" +
      "      const key = stagText(rec ? (rec.key ?? rec.id) : b, 32);\n" +
      "      if (key) {\n" +
      "        if (typeof GLYPHS !== 'undefined' && GLYPHS[key]) return h('span', { class: 'iw-stag__badge iw-stag__badge--glyph', title: key, html: GLYPHS[key] });\n" +
      "        if (typeof AWARDS !== 'undefined' && AWARDS[key]) {\n" +
      "          const aw = AWARDS[key];\n" +
      "          return h('span', { class: 'iw-stag__badge iw-stag__badge--award is-' + (aw.metal || 'gold'), title: stagText(aw.label, 48), html: awardIcon(aw.icon) });\n" +
      "        }\n" +
      "        if (typeof AWARD_ICONS !== 'undefined' && AWARD_ICONS[key]) return h('span', { class: 'iw-stag__badge iw-stag__badge--award', title: key, html: awardIcon(key) });\n" +
      "      }\n" +
      "      const label = stagText(rec ? (rec.label ?? rec.text) : b, 8);\n" +
      "      if (label && /^[A-Za-z0-9_ -]+$/.test(label)) return h('span', { class: 'iw-stag__badge iw-stag__badge--text', title: label }, label.slice(0, 4));\n" +
      "      return null;\n" +
      "    };\n" +
      "    const makeStag = (a, i) => {\n" +
      "      const nm = stagText(a.name, 32) || 'Player';\n" +
      "      const stag = stagOf(a);\n" +
      "      const titleVal = stagText(stag && stag.title, 48) || tagTitle(nm);\n" +
      "      const rawNum = stagText(stag && (stag.num ?? stag.number), 16).replace(/^#/, '');\n" +
      "      const numVal = rawNum ? '#' + rawNum : tagNum(nm);\n" +
      "      const seed = stagSeed(stag && (stag.banner ?? stag.bannerSeed));\n" +
      "      const artHtml = tagArt(seed === null ? fnv(String(nm).toLowerCase()) : seed);\n" +
      "      const rawBadges = stag && stag.badges;\n" +
      "      const badgeEls = Array.isArray(rawBadges) ? rawBadges.slice(0, 3).map(renderBadge).filter(Boolean) : [];\n" +
      "      const card = h('div', { class: 'iw-stag iw-stag--intro' + (a.isLocal ? ' is-self' : ''), style: { '--i': i } },\n" +
      "        h('span', { class: 'iw-stag__art', html: artHtml }),\n" +
      "        h('span', { class: 'iw-stag__w', html: weaponIcon(kindOf(a.weaponId)) }),\n" +
      "        h('span', { class: 'iw-stag__txt' },\n" +
      "          h('span', { class: 'iw-stag__title' }, titleVal),\n" +
      "          h('b', { class: 'iw-stag__name' }, nm)),\n" +
      "        h('span', { class: 'iw-stag__num' }, numVal),\n" +
      "        h('span', { class: 'iw-stag__badges' }, ...badgeEls));\n" +
      "      colorVars(card, 'tc', col(a.team));\n" +
      "      return card;\n" +
      "    };\n" +
      "    const teamSide = (t) => {\n" +
      "      const list = actors.filter((a) => a.team === t);\n" +
      "      return h('div', { class: 'iw-lineup__col iw-lineup__col--' + (t ? 'b' : 'a') },\n" +
      "        list.map((a, i) => makeStag(a, i)));\n" +
      "    };\n" +
      "    const el = h('div', { class: 'iw-lineup iw-lineup--stags' },\n" +
      "      teamSide(0),\n" +
      "      teamSide(1));",
      'intro Splashtags presentation');
    code = replaceOnce(code,
      '  _bindBus() {',
      `  _showSuperJumpTarget(actor) {
    if (!this.el || !actor) return;
    if (!this._sjTargetCue) {
      const cue = document.createElement('div');
      cue.className = 'iw-superjump-target-cue';
      cue.setAttribute('role', 'status');
      cue.setAttribute('aria-live', 'polite');
      Object.assign(cue.style, {
        position: 'absolute', left: '50%', top: '19%', zIndex: '20',
        transform: 'translateX(-50%)', minWidth: '9rem', maxWidth: 'min(80vw, 24rem)',
        padding: '0.65rem 2rem 0.65rem 0.9rem', boxSizing: 'border-box',
        clipPath: 'polygon(0 0, calc(100% - 1.2rem) 0, 100% 50%, calc(100% - 1.2rem) 100%, 0 100%)',
        background: 'linear-gradient(100deg, #26354a 0%, #42647b 100%)',
        color: '#fff', font: '700 1rem/1.2 system-ui, sans-serif', textAlign: 'center',
        textShadow: '0 1px 2px #000', pointerEvents: 'none', opacity: '0',
      });
      const name = document.createElement('span');
      cue.appendChild(name);
      this.el.appendChild(cue);
      this._sjTargetCue = cue;
      this._sjTargetCueName = name;
    }
    this._sjTargetCueName.textContent = String(actor.name || actor.character?.name || 'Teammate');
    this._sjTargetCueAnimation?.cancel?.();
    const cue = this._sjTargetCue;
    cue.style.opacity = '1';
    this._sjTargetCueAnimation = typeof cue.animate === 'function' ? cue.animate(
      [{ opacity: 1, transform: 'translateX(-50%) scale(0.94)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }, { opacity: 0, transform: 'translateX(-50%) scale(1)' }],
      { duration: 1200, easing: 'ease-out', fill: 'forwards' }) : null;
    if (!this._sjTargetCueAnimation) cue.style.opacity = '1';
  }
  _bindBus() {`,
      'Super Jump target notification HUD cue');
    code = replaceOnce(code,
      "    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor);",
      "    const ticket = tg.home ? null : me.selectSuperJumpTarget(tg.actor);\n    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor, ticket);",
      'MapRoster Super Jump target selection cue');
    code = replaceOnce(code,
      "    on('superjump', ({ actor, phase, to }) => { if (actor === this._local() && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 }); void to; }),",
      `    on('superjump', ({ actor, phase, to, target }) => {
      const local = this._local();
      if (actor === local && phase === 'charge' && this._live()) this._snd('ui_confirm', { volume: 0.6 });
      if (phase === 'target' && target === local && actor !== local && Number.isFinite(local?.team) && actor?.team === local.team && this._live()) this._showSuperJumpTarget(actor);
      void to;
    }),`,
      'exact recipient Super Jump target event');
    code = adaptJuddResult(rel, code, replaceOnce);
    // #1066 progression mutation is owned by src/main.js after the UI split.

    code = replaceOnce(code,
      "  showSplatted({ by = null, byColor = '#2f5bff', respawn = 5, actor = null } = {}) {",
      "  showSplatted({ by = null, who = null, byColor = '#2f5bff', respawn = 5, actor = null } = {}) {",
      'death card opponent identity input');
    code = replaceOnce(code,
      "          killer && killer.weaponId ? h('div', { class: 'iw-spl__wn' }, (WEAPONS[killer.weaponId] || {}).name || '') : null),",
      "          who ? h('div', { class: 'iw-spl__wn iw-spl__who' }, String(who)) : null),",
      'death card opponent identity line');
    return "import { t as tr } from '../i18n.js';\nimport { applyShotGuide } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\nimport { tagArt, AWARDS, AWARD_ICONS, awardIcon } from './menu-art.js';\nimport { fnv, tagTitle, tagNum } from './menus.js';\n" + code;
  }
  if (rel === 'src/ui/ui-icons.js') {
    return replaceOnce(code,
      'return `<div class="iw-logo iw-logo--${size}">',
      'return `<div class="iw-logo iw-logo--${size} notranslate" translate="no">',
      'logo translation lock');
  }
  if (rel === 'index.html') {
    code = replaceOnce(code, '<script type="module" src="./src/main.js"></script>',
      '<script type="module" src="./patches/splatoon3/bootstrap.mjs"></script>', 'entry');
    code = replaceOnce(code, '</head>',
      '<meta name="mobile-web-app-capable" content="yes">\n' +
      '<meta name="apple-mobile-web-app-title" content="INKWAVE">\n' +
      '<link rel="manifest" href="./patches/splatoon3/pwa/manifest.webmanifest">\n' +
      '<link rel="icon" type="image/svg+xml" href="./patches/splatoon3/pwa/icon.svg">\n' +
      '<link rel="apple-touch-icon" sizes="192x192" href="./patches/splatoon3/pwa/icon-192.png">\n' +
      '<link rel="stylesheet" href="./patches/splatoon3/ui.css">\n</head>', 'patch styles and pwa');
    return replaceOnce(code, '</body>',
      '<script>if ("serviceWorker" in navigator && location.protocol === "https:") { addEventListener("load", () => { const root = new URL("./", location.href); navigator.serviceWorker.register(new URL("sw.js", root).href, { scope: root.pathname }).catch(() => {}); }); }</script>\n</body>',
      'pwa service worker');
  }
  if (rel === 'src/game/physics.js') {
    const capsuleStart = code.indexOf('  collideCapsule(');
    const capsuleEnd = code.indexOf('\n  // Flat-footprint ground probe', capsuleStart);
    if (capsuleStart < 0 || capsuleEnd < capsuleStart) throw new Error('INKWAVE patch conflict: collideCapsule boundary');
    let capsule = code.slice(capsuleStart, capsuleEnd);
    if (!capsule.includes('c.ceilingBlock = -1;')) {
      const matches = capsule.match(/c\.wallBlock\s*=\s*-1;/g) || [];
      if (matches.length !== 1) throw new Error('INKWAVE patch conflict (ceiling contact block identity): expected exactly one wall-block reset in collideCapsule.');
      capsule = capsule.replace(/c\.wallBlock\s*=\s*-1;/, match => match + ' c.ceilingBlock = -1;');
    }
    if (!capsule.includes('c.ceilingBlock = b.id;')) {
      const ceilingLine = /else if \(_n\.y < -0\.6\)\s*(?:\{\s*)?c\.ceiling = true;(?:\s*\})?/;
      const matches = capsule.match(new RegExp(ceilingLine.source, 'g')) || [];
      if (matches.length !== 1) throw new Error('INKWAVE patch conflict (ceiling contact classification): expected exactly one ceiling contact branch in collideCapsule.');
      capsule = capsule.replace(ceilingLine, 'else if (_n.y < -0.6) { c.ceiling = true; c.ceilingBlock = b.id; }');
    }
    code = code.slice(0, capsuleStart) + capsule + code.slice(capsuleEnd);
    return code;
  }
  if (rel === 'src/world/level.js') {
    code = replaceOnce(code,
      '      roof: !!d.roof,              // off-limits top (roofs, crane legs …): never inkable, anyone landing on it slides off',
      '      roof: !!d.roof,              // off-limits top (roofs, crane legs …): never inkable, anyone landing on it slides off\n      squidReturner: !!d.squidReturner,  // explicit anti-climb ceiling; ordinary ceilings do not strip Roll/Surge armor',
      'Squid Returner surface classification');
    code = replaceOnce(code,
      '    this.spawnPads = layout.spawnPads.map((p) => new THREE.Vector3(...p));',
      '    this.spawnPads = layout.spawnPads.map((p) => new THREE.Vector3(...p));\n    this.homeSuperJumpPoints = (layout.homeSuperJumpPoints || layout.spawnPads).map((p) => new THREE.Vector3(...p));',
      'home Super Jump points');
    return code;
  }
  if (rel === 'src/world/maps.js') {
    code = replaceOnce(code, '  spawnPads: [[0, 2.2, -39.2], [0, 2.2, 39.2]],',
      '  spawnPads: [[0, 2.2, -39.2], [0, 2.2, 39.2]],\n  homeSuperJumpPoints: [[0, 0, -33.5], [0, 0, 33.5]],', 'Tidewater home Super Jump');
    code = replaceOnce(code, '  spawnPads: [[0, 3.2, -44], [0, 3.2, 44]],',
      '  spawnPads: [[0, 3.2, -44], [0, 3.2, 44]],\n  homeSuperJumpPoints: [[0, 0, -38.5], [0, 0, 38.5]],', 'Kelpline home Super Jump');
    code = replaceOnce(code, '  spawnPads: [[0, 2.4, -42], [0, 2.4, 42]],',
      '  spawnPads: [[0, 2.4, -42], [0, 2.4, 42]],\n  homeSuperJumpPoints: [[0, 0, -31.5], [0, 0, 31.5]],', 'Halyard home Super Jump');
    return code;
  }
  if (rel === 'src/world/stages/cargo/layout.js') {
    code = replaceOnce(code, 'const pad = W(0, 2.6, -43.6);',
      'const pad = W(0, 2.6, -43.6);\nconst home = W(0, 0, -36.5);', 'Cargo home Super Jump datum');
    code = replaceOnce(code, '  spawnPads: [pad, [-pad[0], pad[1], -pad[2]]],',
      '  spawnPads: [pad, [-pad[0], pad[1], -pad[2]]],\n  homeSuperJumpPoints: [home, [-home[0], home[1], -home[2]]],', 'Cargo home Super Jump');
    return code;
  }
  if (rel === 'src/game/nav.js') {
    code = replaceOnce(code,
      '          for (let t = 0; t < 2; t++) {\n            const pad = L.spawnPads[t];\n            if (Math.hypot(x - pad.x, z - pad.z) < L.spawnBarrier + 0.6 && y > pad.y - 1) node.zone = t;\n          }',
      '          // No global spawn-radius navigation exclusion in the S3 composition.',
      'navigation spawn-radius exclusion');
    code = replaceOnce(code, '    const heap = new Heap();',
      '    const heap = this._heap || (this._heap = new Heap()); heap.clear();', 'reusable A* heap');
    code = replaceOnce(code, '  constructor() { this.ids = []; this.pr = []; }',
      '  constructor() { this.ids = []; this.pr = []; this.n = 0; }\n  clear() { this.n = 0; }', 'heap logical length');
    code = replaceOnce(code, '  get size() { return this.ids.length; }',
      '  get size() { return this.n; }', 'heap logical size');
    code = replaceOnce(code, '    let i = ids.length; ids.push(id); pr.push(p);',
      '    let i = this.n++; ids[i] = id; pr[i] = p;', 'heap push reuse');
    code = replaceOnce(code,
      '    const top = ids[0];\n    const lid = ids.pop(), lp = pr.pop();\n    if (ids.length) {\n      let i = 0; const n = ids.length;',
      '    const top = ids[0];\n    const n = --this.n, lid = ids[n], lp = pr[n];\n    if (n) {\n      let i = 0;',
      'heap pop reuse');
    return code;
  }
  if (rel === 'src/core/input.js') {
    code = replaceOnce(code, '  pollPad() {', `  _liveTouchContact() {
    return this.lastDevice === 'touch' && !!this.mobile?.active && !this.mobile._destroyed &&
      ((this.mobile._ptr?.size || 0) > 0 || (this.mobile._stick?.id ?? -1) >= 0);
  }
  pollPad() {`, 'live touch contact predicate');
    code = replaceOnce(code, '  pollPad() {\n    const pads = navigator.getGamepads ? navigator.getGamepads() : [];',
      "  pollPad() {\n    const previousPad = this.pad, padOwned = !!previousPad && this.lastDevice === 'pad';\n    const pads = navigator.getGamepads ? navigator.getGamepads() : [];",
      'gamepad disconnect ownership snapshot');
    code = replaceOnce(code, '    this.pad = pad;\n    this.padPressed.clear();\n    if (!pad) return;',
      "    this.pad = pad;\n    this.padPressed.clear();\n    if (!pad) {\n      if (padOwned) { this._s3PadCanceled = true; this.padPrev.length = 0; }\n      return;\n    }",
      'gamepad disappearance is cancellation epoch');

    code = replaceOnce(code, '    const ax = pad.axes;', `    const touchContact = this._liveTouchContact();
    const ax = pad.axes;`, 'live touch gesture owns axis arbitration');
    return replaceOnce(code,
      "if (Math.abs(ax[0]) > 0.3 || Math.abs(ax[1]) > 0.3 || Math.abs(ax[2]) > 0.3 || Math.abs(ax[3]) > 0.3) this.lastDevice = 'pad';",
      "if (!touchContact && (Math.abs(ax[0]) > 0.3 || Math.abs(ax[1]) > 0.3 || Math.abs(ax[2]) > 0.3 || Math.abs(ax[3]) > 0.3)) this.lastDevice = 'pad';",
      'held axis cannot cancel live touch');
  }
  if (rel === 'src/game/player.js') {
    code = replaceOnce(code, '  update(dt) {', `  _s3ClearDisabledLook() {
    if (this.padLook) this.padLook.x = this.padLook.y = 0;
    this.edgeT = 0;
    if (this.assist) this.assist.has = false;
  }
  get enabled() { return this._s3Enabled; }
  set enabled(value) {
    if (!value && this._s3Enabled) this._s3ClearDisabledLook();
    this._s3Enabled = value;
  }
  update(dt) {`, 'controller disable neutralizes transient pad look');
    code = replaceOnce(code, '    this.inRange = false;',
      '    this.inRange = false;\n    this.chargerCurrentReach = new THREE.Vector3(); this.chargerFullReach = new THREE.Vector3(); this.chargerReachVisible = false;',
      'Charger dual reach HUD state');
    code = replaceOnce(code, '    const it = a.intent;\n    if (!this.enabled) {',
      `    const it = a.intent;
    if (inp._s3PadCanceled) {
      // #1024: losing the active pad is source cancellation, not RT/RB release.
      inp._s3PadCanceled = false;
      a.weaponRunner?.cancelPendingInput?.();
      if (a.weaponRunner) a.weaponRunner.aimingSub = false;
      if (a._prevIntent) { a._prevIntent.fire = false; a._prevIntent.sub = false; }
      it.fire = false; it.sub = false;
      this.padLook.x = this.padLook.y = 0; this.edgeT = 0;
    }
    if (!this.enabled) {`, 'pad disconnect cancels held release actions');
    code = replaceOnce(code,
      `      // edge boost: holding the stick at the rim speeds yaw up (quick 180s) after a short delay
      if (_stick.mag > 0.93) this.edgeT = Math.min(0.5, this.edgeT + dt); else this.edgeT = Math.max(0, this.edgeT - dt * 3);
      const boost = 1 + 0.55 * clamp((this.edgeT - 0.16) / 0.3, 0, 1);
      const c = _stick.mag > 0 ? lookCurve(_stick.mag) / _stick.mag : 0;`,
      `      this.edgeT = 0;
      const yawRate = Math.min(3.6 * ps, Math.PI * 2 - 1e-6);
      const c = _stick.mag > 0 ? lookCurve(_stick.mag) / _stick.mag : 0;`,
      'S3 right-stick steady yaw cap');
    code = replaceOnce(code,
      '      rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;',
      '      rig.yaw -= this.padLook.x * yawRate * friction * dt;',
      'S3 right-stick yaw rate');

    const start = code.indexOf('    if (this.onTarget && this.onTarget !== G.boss) {');
    const end = code.indexOf('    // is the crosshair point inside', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: camera aim connection');
    code = code.slice(0, start) + code.slice(end);
    code = replaceOnce(code, '    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n  }',
      "    if (w.kind === 'charger') {\n" +
      "      const fullRange = G.projectiles?.chargerReach ? G.projectiles.chargerReach(1) : w.rangeMax;\n" +
      "      const stop = Math.min(range, this.onTarget === G.boss ? a.aimPoint.distanceTo(start) : best);\n" +
      "      this.chargerCurrentReach.copy(start).addScaledVector(fwd, stop);\n" +
      "      this.chargerFullReach.copy(start).addScaledVector(fwd, fullRange);\n" +
      "      this.chargerReachVisible = !!a.weaponRunner?.charging;\n" +
      "    } else this.chargerReachVisible = false;\n" +
      "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n" +
      "    updateShotGuide(this);\n" +
      "  }",
      'Charger current/full HUD endpoints');
    code = replaceOnce(code, "it.jump = inp.down('Space')", "it.jump = inp.wasPressed('Space') || inp.padPressed.has(0) || inp.down('Space')", 'latched jump input');
    code = replaceOnce(code, "it.squid = inp.down('ShiftLeft')", "it.squid = inp.wasPressed('ShiftLeft') || inp.wasPressed('ShiftRight') || inp.down('ShiftLeft')", 'latched squid input');
    code = replaceOnce(code, 'it.fire = inp.mouse.left ||', 'it.fire = inp.mouse.leftPressed || inp.mouse.left ||', 'latched fire input');
    code = replaceOnce(code, "it.sub = inp.mouse.right || inp.down('KeyE')", "it.sub = inp.mouse.rightPressed || inp.wasPressed('KeyE') || inp.mouse.right || inp.down('KeyE')", 'latched sub input');
    code = replaceOnce(code, "it.special = inp.down('KeyF')", "it.special = inp.wasPressed('KeyF') || inp.wasPressed('KeyQ') || inp.down('KeyF')", 'latched special input');
    code = replaceOnce(code, "    const range = w.kind === 'charger' ? w.rangeMax : w.kind === 'roller' ? 6 : (w.range || 12);",
      "    const chargeNow = clamp(w.kind === 'splatling' ? (a.weaponRunner?.streaming ? (a.weaponRunner?.fidelitySplatlingCharge ?? a.weaponRunner?.charge ?? 0) : (a.weaponRunner?.charge ?? 0)) : (a.weaponRunner?.s3Stored?.charge ?? a.weaponRunner?.charge ?? 0), 0, 1);\n" +
      "    const range = w.kind === 'charger' ? (G.projectiles?.chargerReach ? G.projectiles.chargerReach(chargeNow) : w.rangeMin + (w.rangeMax - w.rangeMin) * chargeNow) : w.kind === 'splatling' ? (G.projectiles?.splatlingReach ? G.projectiles.splatlingReach(w, chargeNow) : (w.range || 12)) : w.kind === 'roller' ? 6 : w.reticleRange ? (a.grounded ? w.reticleRange.ground : w.reticleRange.air) : (w.range || 12);",
      'Charger and Splatling HUD reach follow charge');
    code = replaceOnce(code,
      '    const pick = (i) => { const o = allies[i]; if (o && o.alive && !o.superJumpState) a.superJump(o); };',
      `    const pick = (i) => {
      const o = allies[i];
      if (o && o.alive && !o.superJumpState) {
        const ticket = a.selectSuperJumpTarget?.(o);
        a.superJump(o, ticket);
      }
    };`,
      'player map Super Jump target selection cue');
    code = adaptCombatRange(rel, code, replaceOnce);
    return "import { updateShotGuide } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n" + code;
  }
  if (rel === 'src/game/weapons.js') {
    // #226/#735: count INKWAVE rain candidates, ground contact and owned
    // paint separately. The existing 12-unit ray is an internal consistency
    // bound, not a verified S3-specific HP cutoff or RainNum semantics.
    code = replaceOnce(code,
      '  _updateClouds(dt) {\n    const rainHits = new Map();\n    const sp = SPECIALS.storm;',
      '  _updateClouds(dt) {\n    const rainHits = new Map();\n    const sp = SPECIALS.storm;\n    const inkWaveRainReach = 12;',
      'finite rain trace');
    code = replaceOnce(code,
      '          const g = G.physics.raycast(_v, DOWN, 12, _hit);',
      '          const g = G.physics.raycast(_v, DOWN, inkWaveRainReach, _hit);\n          const audit = c.s3RainAudit || (c.s3RainAudit = { candidateDrops: 0, groundHits: 0, paintEvents: 0 });\n          audit.candidateDrops++;\n          if (g.hit) audit.groundHits++;\n          if (g.hit && (!c.ghost || !c.owner.remote)) audit.paintEvents++;',
      'count Storm rain candidate/contact/paint separately');
    code = replaceOnce(code,
      '          if (dx * dx + dz * dz > (sp.radius * s) ** 2 || e.pos.y > c.group.position.y) continue;',
      '          if (dx * dx + dz * dz > (sp.radius * s) ** 2 || e.pos.y > c.group.position.y ||\n              e.pos.y + 1.2 < c.group.position.y - 0.8 - inkWaveRainReach) continue;',
      'prevent damage beyond own finite rain reach');
    code = "import { fidelitySlosherDrawRadius, fidelitySlosherDrawTail } from '../../patches/splatoon3/runtime/weapons-fidelity.mjs';\n" + code;
    code = replaceOnce(code, 'let vis = (p.vis || p.size) * g * (1 + 0.3 * Math.sin(g * Math.PI));',
      'let vis = p.fidelitySloshDraw ? fidelitySlosherDrawRadius(p) : (p.vis || p.size) * g * (1 + 0.3 * Math.sin(g * Math.PI));', 'slosher source draw radius');
    code = replaceOnce(code, 'let tail = (p.tail0 ?? 1) + Math.min(p.tailK ?? 1.2, sp * 0.04) * g;',
      'let tail = p.fidelitySloshDraw ? fidelitySlosherDrawTail(p, sp) : (p.tail0 ?? 1) + Math.min(p.tailK ?? 1.2, sp * 0.04) * g;', 'slosher source tail window');
    code = replaceOnce(code, 'const r0 = p.vis || p.size, spk =',
      'const r0 = p.fidelitySloshDraw ? fidelitySlosherDrawRadius(p) : p.vis || p.size, spk =', 'slosher satellite source radius');
    code = adaptRollerDepletion(rel, code, replaceOnce);
    code = replaceOnce(code, 'r = Math.sqrt(Math.random()) * sp.radius;', 'r = Math.sqrt(Math.random()) * (sp.radius * s);', 'storm rain paint active radius');
    code = replaceOnce(code, 'if (g.hit && !c.ghost) c.owner.addTurf(', 'if (g.hit && (!c.ghost || !c.owner.remote)) c.owner.addTurf(', 'adopted Storm owns its remaining paint');
    code = replaceOnce(code, '        if (!c.ghost) G.boss?.rain(', '        if (!c.ghost || !c.owner.remote) G.boss?.rain(', 'adopted Storm owns its remaining Boss rain');
    // #537: preserve INKWAVE's distance rate and apply only the sourced minimum
    // floor from SpeedInkConsumeMin upward, independently of the paint batch.
    code = replaceOnce(code,
      '      if (canRoll) { this.lastRollPos = a.pos.clone(); this.rollDist = 0; }',
      '      if (canRoll) { this.lastRollPos = a.pos.clone(); this.lastRollInkPos = a.pos.clone(); this.rollInkChargedDistance = 0; this.rollDist = 0; }',
      'roller per-update ink distance origin');
    code = replaceOnce(code,
      '    if (moved < 0.28) return;\n    this.lastRollPos.copy(a.pos);\n    a.ink = Math.max(0, a.ink - w.rollInkPerMeter * moved);',
      '    const minS = w.rollInkMinSpeed;\n' +
      '    const hasRollInkFloor = Number.isFinite(w.rollInkMinPerFrame) && Number.isFinite(minS);\n' +
      '    const inkMoved = a.pos.distanceTo(this.lastRollInkPos || this.lastRollPos);\n' +
      '    if (this.lastRollInkPos) this.lastRollInkPos.copy(a.pos); else this.lastRollInkPos = a.pos.clone();\n' +
      '    if (hasRollInkFloor && hs >= minS) {\n' +
      // The sourced value is tank fraction per 60 Hz frame; a.ink is percent.
      // Keep the existing distance charge and raise it only to that minimum.
      '      const floorInk = w.rollInkMinPerFrame * 100 * 60 * dt;\n' +
      '      const distanceInk = w.rollInkPerMeter * inkMoved;\n' +
      '      a.ink = Math.max(0, a.ink - Math.max(distanceInk, floorInk));\n' +
      '      this.rollInkChargedDistance = (this.rollInkChargedDistance || 0) + inkMoved;\n' +
      '    }\n' +
      '    if (moved < 0.28) return;\n' +
      '    this.lastRollPos.copy(a.pos);\n' +
      '    if (!hasRollInkFloor) a.ink = Math.max(0, a.ink - w.rollInkPerMeter * moved);\n' +
      '    else {\n' +
      '      const unchargedDistance = Math.max(0, moved - (this.rollInkChargedDistance || 0));\n' +
      '      if (unchargedDistance > 0) a.ink = Math.max(0, a.ink - w.rollInkPerMeter * unchargedDistance);\n' +
      '      this.rollInkChargedDistance = 0;\n' +
      '    }',
      'roller rolling ink floor and paint batch');
    code = replaceOnce(code, 'if (a.ink < w.rollInk) { this._empty(); return false; }', 'if (a.ink + 1e-10 < w.rollInk) { this._empty(); return false; }', 'dualies equipped-cost float boundary');
    code = replaceOnce(code, 'a.ink -= w.rollInk; a.lastFire = 0;', 'a.ink = Math.max(0, a.ink - w.rollInk); a.lastFire = 0;', 'dualies exact payment nonnegative');
    code = replaceOnce(code, 'Math.max(this.cooldown, 0.22)', 'Math.max(this.cooldown, w.postStreamDelay)', 'splatling sourced post-stream delay');
    code = replaceOnce(code, 'if (this.slosh >= 0) return w.moveSpeedFiring * 0.7;              // slosher heave plants you a little',
      'if (this.slosh >= 0) return w.moveSpeedFiring; // shared sourced firing cap', 'slosher windup sourced move cap');
    code = replaceOnce(code,
      '    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));',
      "    if (this.flick >= 0 && w.kind === 'roller') return w.moveSpeedFiring; // S3 swing target is independent of windup progress\n    if (this.flick >= 0) return lerp(w.moveSpeedFiring, w.moveSpeedFiring * 0.45, clamp(this.flick / w.flickWindup, 0, 1));",
      'roller swing movement target');
    code = replaceOnce(code, 'lerp(w.damageMin, w.damageMax * 0.62, charge)',
      'chargerDamage(a, w, charge)', 'charger partial damage curve');
    code = replaceOnce(code, 'a.ink < w.inkFull * 0.2', 'a.ink < w.inkMin', 'charger minimum ink');
    code = replaceOnce(code, 'a.ink - w.inkFull * c', 'a.ink - Math.max(w.inkMin, w.inkFull * c)', 'charger ink floor');
    code = replaceOnce(code, 'const c = Math.max(0.12, this.charge);', 'const c = this.charge;', 'charger partial charge floor');
    code = replaceOnce(code, "          if (dmg > 0) this.applyHit(p.owner, e, dmg, p.wid || p.type);",
      '          if (dmg > 0) applyProjectileHit(this, p, e, dmg, _v);', 'projectile damage model');
    code = replaceOnce(code, '      this.charge = Math.min(1, this.chargeT / w.chargeTime);',
      '      this.charge = Math.min(1, this.chargeT / w.chargeTime, splatlingChargeCap(a.ink, w));', 'splatling ink charge cap');
    code = replaceOnce(code, "      this.applyHit(b.owner, e, lerp(s.damageMin, s.damageMax, k * k), 'bomb');",
      "      this.applyHit(b.owner, e, distanceDamage(s.damageBands, d, false), d > s.damageBands[0][0] ? 'splat-bomb-far' : 'bomb');", 'bomb damage bands');
    code = replaceOnce(code, "      this.applyHit(p.owner, e, lerp(w.splashDamageMax, w.splashDamageMin, d / w.splashRadius), 'blaster');",
      "      this.applyHit(p.owner, e, distanceDamage(w.damageBands, d), 'blaster');", 'blaster damage bands');
    code = replaceOnce(code, '      if (!G.physics.los(c, _v)) continue;',
      '      if (!blasterBlastExposed(G.physics, c, e, PLAYER)) continue;', 'Blaster volume-aware burst cover');
    code = replaceOnce(code, '      b.vel.y -= 24 * dt;', '      b.vel.y -= (b.kind === \'bomb\' ? SUB.bomb.gravity : 24) * dt;', 'bomb gravity');
    code = replaceOnce(code, 'const pos = _v.copy(a.pos); pos.y += 1.35;', 'const pos = _v.copy(a.pos); pos.y += 1.35; bombReleasePosition(a, pos);', 'bomb release origin');
    code = replaceOnce(code, 'const p = _v.copy(a.pos); p.y += 1.35;', 'const p = _v.copy(a.pos); p.y += 1.35; bombPreviewPosition(a, p);', 'bomb preview origin');
    code = replaceOnce(code, '        vel.y -= 24 * dt;', '        vel.y -= SUB.bomb.gravity * dt;', 'bomb preview gravity');
    code = replaceOnce(code, 'if (b.fuse <= 0) {', 'if (b.fuse <= 1e-10) {', 'bomb fuse frame boundary');
    code = replaceOnce(code, 'if (c.t < c.dur - 0.3) {', 'if (c.t <= c.dur + 1e-10) {', 'storm rain through final reference tick');
    // #246: the Ink Storm cloud belongs to the device's first real terrain/object
    // contact. The old `age > 1.1` branch deployed a cloud from elapsed air time
    // alone, so a device that had not hit anything rained mid-air. Keep only a
    // non-gameplay memory guard for a device that never contacts anything; it
    // releases the device without a cloud and is not an S3 timing value.
    code = replaceOnce(code,
      "if (b.kind === 'storm' && b.age > 1.1) { this._spawnCloud(b); if (b.ghost) this.clouds[this.clouds.length - 1].ghost = true; this._releaseBomb(b); this.bombs.splice(i, 1); continue; }",
      "if (b.kind === 'storm' && b.age > 30) { this._releaseBomb(b); this.bombs.splice(i, 1); continue; }",
      'storm airborne deploy');
    if (!code.includes('  _recycle(p) {')) code = replaceOnce(code, '  clear() {',
      '  // Pooled records wait inside the persistent G.projectiles pool across matches;\n' +
      '  // sever the Actor reference before the record is pooled (#622).\n' +
      '  _recycle(p) {\n' +
      '    p.owner = null;\n' +
      '    this.pool.push(p);\n' +
      '  }\n\n' +
      '  clear() {', 'projectile owner-severing recycle helper');
    if (!code.includes('for (const p of this.list) this._recycle(p);')) {
      const clearAnchor = code.includes('  clear() {\n    this.inkFlight.clear();\n    for (const p of this.list) this.pool.push(p);')
        ? '  clear() {\n    this.inkFlight.clear();\n    for (const p of this.list) this.pool.push(p);'
        : '  clear() {\n    for (const p of this.list) this.pool.push(p);';
      const clearTarget = clearAnchor.includes('inkFlight.clear')
        ? '  clear() {\n    this.inkFlight.clear();\n    for (const p of this.list) this._recycle(p);'
        : '  clear() {\n    for (const p of this.list) this._recycle(p);';
      code = replaceOnce(code, clearAnchor, clearTarget, 'clear recycles without owners');
    }
    code = replaceOnce(code, '{ list[i] = list[list.length - 1]; list.pop(); this.pool.push(p); } }',
      '{ list[i] = list[list.length - 1]; list.pop(); this._recycle(p); } }',
      'normal completion recycles without owners');
    code = adaptWeaponEdgecases(rel, code, replaceOnce);
    code = adaptChargerSightCache(rel, code, replaceOnce);
    code = adaptWeaponPaintInertia(rel, code, replaceOnce);
    code = adaptWeaponsFidelity(code, replaceOnce);
    code = adaptKitRescue(rel, code, replaceOnce);
    // #1135: S3 standard Slosher has no opponent-damage landing splash record.
    // Keep landing FX/paint, but do not let a zero-damage legacy radius poison
    // the shared volley hit cache or emit false hit feedback.
    code = replaceOnce(code,
      "    const w = WEAPONS[p.wid] || WEAPONS.slosher;\n    for (const e of G.actors) {",
      "    const w = WEAPONS[p.wid] || WEAPONS.slosher;\n    if (w.splashDamage > 0) {\n    for (const e of G.actors) {",
      'Slosher qualifying landing damage gate');
    code = replaceOnce(code,
      "    if (G.boss && direct !== 'boss' && !(p.vol && p.vol.hits.includes(G.boss))) { p.vol?.hits.push(G.boss); G.boss.splash(p.owner, at, w.splashRadius + 0.3, w.splashDamage, w.splashDamage, p.wid || 'slosher'); }\n    if (p.owner.isLocal || G.camera.position.distanceToSquared(at) < 26 * 26) {",
      "    if (G.boss && direct !== 'boss' && !(p.vol && p.vol.hits.includes(G.boss))) { p.vol?.hits.push(G.boss); G.boss.splash(p.owner, at, w.splashRadius + 0.3, w.splashDamage, w.splashDamage, p.wid || 'slosher'); }\n    }\n    if (p.owner.isLocal || G.camera.position.distanceToSquared(at) < 26 * 26) {",
      'Slosher visual-only landing path');

    // #1123: selected kit bombs own one source-shaped explosion paint pass.
    // Generic Splat Bomb keeps the native footprint unchanged.
    code = replaceOnce(code,
      "    let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });\n    for (let i = 0; i < 5; i++) {\n      const a = Math.random() * Math.PI * 2, r = s.paintRadius * (0.6 + Math.random() * 0.4);\n      area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });\n    }\n    b.owner.addTurf(area);",
      "    const kitArea = kitBombExplosionPaint(SUB, b, G.paint);\n    if (kitArea == null) {\n      let area = G.paint.splat(_v.copy(c).setY(c.y + 0.2), s.paintRadius, b.team, { seed: Math.random() });\n      for (let i = 0; i < 5; i++) {\n        const a = Math.random() * Math.PI * 2, r = s.paintRadius * (0.6 + Math.random() * 0.4);\n        area += G.paint.splat(_v.set(c.x + Math.cos(a) * r, c.y + 0.5, c.z + Math.sin(a) * r), 0.7 + Math.random() * 0.5, b.team, { seed: Math.random() });\n      }\n      b.owner.addTurf(area);\n    } else b.owner.addTurf(kitArea);",
      'kit-specific bomb explosion paint');
    // #1118/#1113: arbitrate the native bomb's swept segment against Vac and
    // Big Bubbler before native world-contact mutation. A nearer stage surface
    // wins ties/order; a Vac consumes without detonation, a Bubbler contact
    // detonates exactly once at the contact point.
    code = replaceOnce(code,
      '      const hit = G.physics.segment(_v, b.pos, _hit);',
      `      const hit = G.physics.segment(_v, b.pos, _hit);
      const s3BombDefense = this.kitBombDefenseCandidate?.(b, _v, b.pos);
      const s3BombStep = _v.distanceTo(b.pos);
      const s3WorldDistance = hit.hit ? _v.distanceTo(hit.point) : Infinity;
      if (s3BombDefense && s3BombDefense.distance < s3WorldDistance - 1e-10) {
        if (s3BombStep > 1e-10) b.pos.copy(_v).lerp(b.pos, Math.max(0, Math.min(1, s3BombDefense.distance / s3BombStep)));
        s3BombDefense.onHit();
        if (s3BombDefense.kind === 'bubbler') {
          const nm = G.netm; if (b.ghost && nm) nm.mute++;
          try { this._explodeBomb(b); } finally { if (b.ghost && nm) nm.mute--; }
        }
        this._releaseBomb(b); this.bombs.splice(i, 1); continue;
      }`,
      'native bomb first-contact Vac/Bubbler arbitration');
    // #1060: remove only the generic burst-floor stamp after the kit authority
    // adapter has attached its owner/ghost gate to this exact burst location.
    code = replaceOnce(code,
      "    // paint under the burst\n    const g = G.physics.raycast(_v2.copy(c).setY(c.y + 0.2), DOWN, 3.5, _hit2);\n    if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));\n",
      "    // paint under the burst\n    if (p.s3Weapon?.kind === 'blaster') {\n      applyFidelityBlasterBurstPaint(this, p, c, direct);\n    } else {\n      const g = G.physics.raycast(_v2.copy(c).setY(c.y + 0.2), DOWN, 3.5, _hit2);\n      if (g.hit) p.owner.addTurf(G.paint.splat(_v3.copy(g.point).addScaledVector(g.normal, 0.1), w.impactRadius, p.team, { seed: Math.random() }));\n    }\n",
      'Blaster source collision-burst paint with timed-burst suppression');
    // #1049: sourced Blaster SplashPaintParam owns the vertical receiving-surface window.
    code = replaceOnce(code,
      '        const g = G.physics.raycast(p.pos, DOWN, 4, _hit2, true);',
      '        const dropProbe = p.type === \'blast\' && Number.isFinite(p.s3SplashDropMax) ? p.s3SplashDropMax : 4;\n        const g = G.physics.raycast(p.pos, DOWN, dropProbe, _hit2, true);',
      'Blaster flight splash drop-height window');
    code = replaceOnce(code,
      '      if (d > kitBombRadius(SUB, b, s.radius)) continue;',
      '      if (d > Math.max(kitBombRadius(SUB, b, s.radius), b.s3Sub ? 0 : (s.knockback?.distance ?? 0))) continue;',
      'Splat Bomb independent knockback radius');
    code = replaceOnce(code,
      "      this.applyHit(b.owner, e, distanceDamage(kitBombDamageBands(SUB, b, s.damageBands), d, false), d > s.damageBands[0][0] ? 'splat-bomb-far' : 'bomb');",
      "      if (d <= kitBombRadius(SUB, b, s.radius)) {\n        this.applyHit(b.owner, e, distanceDamage(kitBombDamageBands(SUB, b, s.damageBands), d, false), d > s.damageBands[0][0] ? 'splat-bomb-far' : 'bomb');\n      }\n      if (!b.s3Sub && s.knockback && d <= s.knockback.distance) applySplatBombKnockback(b, e, c, _v, d, s.knockback);",
      'Splat Bomb damage and independent knockback');
    code = replaceOnce(code,
      '        const vn = b.vel.dot(hit.normal);\n        b.vel.addScaledVector(hit.normal, -vn * 1.35);\n        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);',
      '        applySplatBombSurfaceResponse(b, hit.normal);', 'Splat Bomb sourced ground resistance');
    code = adaptAgent3WeaponPhysics(rel, code, replaceOnce);
    // Apply after contact-recovery and Agent3 have both transformed the source.
    // Otherwise the native pre-LOS condition is gone and the build fails.
    // #1109 permits micro-speed only with actual stick admission.
    code = replaceOnce(code,
      '      if (agent3RollerBodyContact(a, e, hs) && rollerContactClear(a, e, w, G.physics, PLAYER)) {',
      '      if (rollerStickActive(a) && rollerContactCandidate(a, e, w, PLAYER) && agent3RollerBodyContact(a, e, hs, true) && rollerContactClear(a, e, w, G.physics, PLAYER)) {',
      'Roller micro-speed actor contact admission');
    code = replaceOnce(code,
      '    if (G.boss && hs > 1.0) {',
      '    if (G.boss && rollerStickActive(a)) {',
      'Roller micro-speed boss contact admission');
    // #498: only the gameplay Roller trail stamp consumes the sourced
    // 20/30F->50F width window. The separate #411 unit/near-far impact owner
    // computes its own age-scaled radius in roller-impact-paint.mjs.
    code = replaceOnce(code,
      'fidelityFlightPaintRadius(p), p.team, { seed: Math.random() }',
      'rollerTrailAgeWidth(p, fidelityFlightPaintRadius(p)), p.team, { seed: Math.random() }',
      'Roller native trail age width');
    code = "import { rollerTrailAgeWidth } from '../../patches/splatoon3/runtime/roller-impact-paint.mjs';\n" + code;
    code = adaptPaintOwnership(rel, code, replaceOnce);
    return `import { rollerStickActive, rollerContactCandidate } from '../../patches/splatoon3/runtime/roller.mjs';\nimport { kitBombExplosionPaint } from '../../patches/splatoon3/runtime/kit-subs.mjs';\nimport { applyProjectileHit, chargerDamage, distanceDamage, splatlingChargeCap } from '../../patches/splatoon3/runtime/weapons.mjs';\nimport { bombReleasePosition, bombPreviewPosition } from '../../patches/splatoon3/runtime/bomb-motion.mjs';\nimport { applySplatBombSurfaceResponse, applySplatBombKnockback } from '../../patches/splatoon3/runtime/sub-special-fidelity.mjs';\nimport { blasterBlastExposed } from '../../patches/splatoon3/runtime/blast-occlusion.mjs';\n` + code;
  }
  if (rel === 'src/fx/swimWake.js') {
    code = replaceOnce(code, "        if (f !== 'swim' && f !== 'climb') continue;",
      "        if ((f !== 'swim' && f !== 'climb') || !swimTrailVisible(a)) continue;", 'sneaking surface trail');
    return `import { swimTrailVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\n` + code;
  }
  if (rel === 'src/fx/fxHooks.js') {
    code = adaptChargerSightCache(rel, code, replaceOnce);
    code = replaceOnce(code, "      if (form === 'swim' && hs > 4.5) {",
      "      if (form === 'swim' && hs > 4.5 && swimSplashVisible(a)) {", 'sneaking turn splash');
    return `import { swimSplashVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\n` + code;
  }
  if (rel === 'src/net/netmatch.js') {
    code = replaceOnce(code,
      'const F = {',
      'const F = {\n  flickVertical: 16777216,',
      'network vertical Roller flag');
    code = replaceOnce(code,
      '  if (wr.flick >= 0) f |= F.flick;',
      '  if (wr.flick >= 0) f |= F.flick;\n  if (wr.s3RollerAttack?.vertical) f |= F.flickVertical;',
      'network vertical Roller owner state');
    code = replaceOnce(code,
      '    wr.flick = f & F.flick ? Math.max(0, wr.flick) : -1;\n    wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;',
      `    wr.flick = f & F.flick ? Math.max(0, wr.flick) : -1;
    if (a.weapon.kind === 'roller' && (f & F.flickVertical)) {
      const w = a.weapon;
      if (!wr.s3RollerAttack?.networkRemote) wr.s3RollerAttack = {
        networkRemote: true, vertical: true, windup: w.verticalWindup,
        interval: w.verticalInterval ?? w.flickInterval, elapsed: 0, released: false, rolling: false,
      };
      const attack = wr.s3RollerAttack;
      attack.elapsed = Math.min(attack.interval, attack.elapsed + Math.max(0, dt));
      attack.released = !(f & F.flick); attack.rolling = wr.rolling;
      wr.s3FlickVertical = true;
      a.character.s3RollerFlick = attack;
    } else if (wr.s3RollerAttack?.networkRemote) {
      wr.s3RollerAttack = null; wr.s3FlickVertical = false;
      a.character.s3RollerFlick = null;
    }
    wr.slosh = f & F.slosh ? Math.max(0, wr.slosh) : -1;`,
      'network vertical Roller remote state');

    code = replaceOnce(code, '  invuln: 262144, enemy: 524288,',
      '  invuln: 262144, enemy: 524288, quietTrail: 1048576, quietSplash: 2097152, swimVisibility: 4194304,', 'swim visibility wire flags');
    code = replaceOnce(code, '  if (a.onEnemy) f |= F.enemy;',
      '  if (a.onEnemy) f |= F.enemy;\n  f |= F.swimVisibility;\n  if (!swimTrailVisible(a)) f |= F.quietTrail;\n  if (!swimSplashVisible(a)) f |= F.quietSplash;', 'owner swim visibility');
    code = replaceOnce(code, '    a.onEnemy = !!(f & F.enemy);',
      '    a.onEnemy = !!(f & F.enemy);\n    a.s3 ||= {};\n    a.s3.netSwimVisibility = f & F.swimVisibility ? { trail: !(f & F.quietTrail), splash: !(f & F.quietSplash) } : null;', 'proxy swim visibility');
    code = replaceOnce(code, "d: r2(dmg), w: wid", "d: dmg, w: wid, g: victim.s3PendingHitGroup || undefined", 'unrounded hit transport with optional group');
    code = replaceOnce(code, 'G.projectiles?.applyHit(atk, v, d.d, d.w);', 'G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);', 'receive final damage group');
    code = replaceOnce(code, '    victim.alive = false; victim.hp = 0;', '    victim.alive = false; victim.hp = 0; victim.superJumpGround = null;', 'remote jump target death');
    code = replaceOnce(code, '    a.alive = true; a.hp = PLAYER.hp;', '    a.superJumpGround = null;\n    a.alive = true; a.hp = PLAYER.hp;', 'remote jump target respawn');
    return `import { swimTrailVisible, swimSplashVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\n` + code;
  }
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, 'this.fireBuffer = firePressed ? P.fireBuffer : Math.max(0, this.fireBuffer - dt);',
      'this.fireBuffer = firePressed ? rollerFireBuffer(this, P.fireBuffer, dt) : Math.max(0, this.fireBuffer - dt);', 'roller buffered squid-start press');
    code = replaceOnce(code, 'this.kidT >= P.emergeDelay',
      'this.kidT + 1e-10 >= rollerEmergeDelay(this, P.emergeDelay)', 'roller squid-start admission');

    code = replaceOnce(code, "    if (a.form === 'swim' && hs > 2 && G.fx) {",
      "    if (a.form === 'swim' && hs > 2 && G.fx && swimSplashVisible(this)) {", 'sneaking wake particles');
    code = replaceOnce(code, '    this.hp -= amount;', "    amount = finalWeaponDamage(this, amount, attacker, source);\n    if (amount <= 0) return false;\n    this.hp -= amount;\n    if (Math.abs(this.hp) < 1e-9) this.hp = 0;", 'final weapon HP quantization');
    code = replaceOnce(code, '    this.superJumpState = null;\n    this.yawVel', '    this.superJumpState = null; this.superJumpGround = null;\n    clearPendingLethal(this);\n    this.yawVel', 'reset super jump ground');
    code = replaceOnce(code, '    this.alive = false;\n    this.hp = 0;', '    this.alive = false;\n    clearPendingLethal(this);\n    this.superJumpState = null; this.superJumpGround = null;\n    this.hp = 0;', 'clear dead super jump');
    code = replaceOnce(code, '    if (this.invuln > 0) return false;', "    if (this.invuln > 0 || slamProtected(this) || this.superJumpState?.phase === 'flight') return false;", 'super jump flight damage admission');
    code = replaceOnce(code, '    if (!this.alive || amount <= 0) return false;',
      '    if (!this.alive || amount <= 0) return false;\n    if (hasPendingLethal(this)) return false;', 'pending lethal damage admission');
    code = replaceOnce(code, '    if (this.hp <= 0) { this.splat(attacker, source); return true; }',
      '    if (this.hp <= 0) { scheduleLethal(this, attacker, source, G.time); return true; }', 'one-frame lethal decision delay');
    const actorUpdateHead = code.includes('  update(dt) {\n    advanceStormLock(this, dt);\n    this.anim.time = G.time;')
      ? '  update(dt) {\n    advanceStormLock(this, dt);\n    this.anim.time = G.time;'
      : '  update(dt) {\n    this.anim.time = G.time;';
    code = replaceOnce(code, actorUpdateHead,
      actorUpdateHead.replace('    this.anim.time = G.time;', '    flushPendingLethal(this, G.time);\n    this.anim.time = G.time;'),
      'flush lethal on next fixed tick');
    code = replaceOnce(code, '  _finishFrame(dt) {', '  _finishFrame(dt) {\n    rememberSuperJumpGround(this);', 'record grounded jump destination');
    code = replaceOnce(code, '    this.grounded = grounded;\n    this.airTime', '    this.grounded = grounded;\n    rememberSuperJumpGround(this);\n    this.airTime', 'record resolved jump destination');
    code = replaceOnce(code, 'this.groundN.copy(gh.normal); }\n  }', 'this.groundN.copy(gh.normal); }\n    rememberSuperJumpGround(this);\n  }', 'record spawn jump destination');
    // Issue #1050: the Super Jump-owned branch must run the shared lethal-water
    // owner before and after each jump step so a request or a crossing inside
    // lethal open water commits the owner water splat exactly once instead of
    // being rescued by charge/flight. Dead actors never reach this branch
    // (update() returns earlier), and the owner's own alive guard keeps the
    // splat single-fire for local and remote owners alike.
    code = replaceOnce(code, "    if (this.superJumpState) { this._updateSuperJump(dt); this._finishFrame(dt); return; }", "    if (this.superJumpState) { clearFullCancelCandidate(this); this._checkFallDeath(); if (!this.alive) return; this._updateSuperJump(dt); if (this.alive) { this._checkFallDeath(); if (!this.alive) return; } updateSuperJumpMain(this, dt, firePressed); if (this.alive) this._finishFrame(dt); return; }", 'super jump main input and lethal-water hazard');
    // Issue #744: the Super Jump branch returns before the shared post-movement
    // resource phase. Charge stays damageable (#255 protects flight only), so a
    // tick that starts in charge runs the same phase once. Flight runs HP only.
    code = replaceOnce(code, '    if (this.superJumpState) { clearFullCancelCandidate(this); this._checkFallDeath(); if (!this.alive) return; this._updateSuperJump(dt); if (this.alive) { this._checkFallDeath(); if (!this.alive) return; } updateSuperJumpMain(',
      "    if (this.superJumpState) { clearFullCancelCandidate(this); this._checkFallDeath(); if (!this.alive) return; const superJumpCharge = this.superJumpState.phase === 'charge'; this._updateSuperJump(dt); if (this.alive) { this._checkFallDeath(); if (!this.alive) return; } if (this.alive) { if (superJumpCharge) updateResources(this, dt); else if (!this.remote) updateHealthRecovery(this, dt); } updateSuperJumpMain(",
      'super jump charge resource phase');
    const specialActiveHead = code.includes("    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { this._updateSpecial(dt); this._finishFrame(dt); return; }")
      ? "    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { this._updateSpecial(dt); this._finishFrame(dt); return; }"
      : "    if (this.specialActive) { this._updateSpecial(dt); this._finishFrame(dt); return; }";
    const specialActiveTarget = specialActiveHead.includes('stormHolding')
      ? "    if (stormHolding) updateStormHold(this, dt, G);\n    if (this.specialActive && !isStormHolding(this)) { clearFullCancelCandidate(this); const activeSpecial = this.specialActive.id, stormResources = activeSpecial === 'storm', slamRecovery = activeSpecial === 'slam', trizookaHealth = activeSpecial === 'trizooka' && !this.remote; this._updateSpecial(dt); if (this.alive) { if (stormResources) updateResources(this, dt); else if (slamRecovery) updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (trizookaHealth) updateResources(this, dt); } if (this.alive) this._finishFrame(dt); return; }"
      : "    if (this.specialActive) { clearFullCancelCandidate(this); const activeSpecial = this.specialActive.id, stormResources = activeSpecial === 'storm', slamRecovery = activeSpecial === 'slam', trizookaHealth = activeSpecial === 'trizooka' && !this.remote; this._updateSpecial(dt); if (this.alive) { if (stormResources) updateResources(this, dt); else if (slamRecovery) updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (trizookaHealth) updateResources(this, dt); } if (this.alive) this._finishFrame(dt); return; }";
    code = replaceOnce(code, specialActiveHead, specialActiveTarget, 'special active resources');
    // Issue #624 residual: activation also returns before ordinary resources.
    // Admit only a live Storm user; other specials retain their resource gates.
    code = replaceOnce(code, "    if (specialPressed && this.specialReady()) { this._startSpecial(); this._finishFrame(dt); return; }",
      "    if (specialPressed && this.specialReady()) { clearFullCancelCandidate(this); this._startSpecial(); if (this.alive) { if (this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.specialActive?.id === 'slam') updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (this.specialActive?.id === 'trizooka' && !this.remote) updateResources(this, dt); } this._finishFrame(dt); return; }",
      'storm/slam/trizooka activation resources');
    code = replaceOnce(code, "    this.superJumpState = { phase: 'charge',", "    this._checkWaterHazard();\n    if (!this.alive) return false;\n    if (target?.pos?.isVector3 && (target === this || target.team !== this.team || target.superJumpState)) return false;\n    const destination = new THREE.Vector3();\n    if (!superJumpTarget(target, destination)) return false;\n    target = destination.clone();\n    rememberSuperJumpGround(this);\n    this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge', startForm: this.form,", 'lethal water admission, super jump wall support and destination admission');
    code = replaceOnce(code, 'target, from: new THREE.Vector3(), to: new THREE.Vector3(), marker: 0', 'target, from: new THREE.Vector3(), to: destination, marker: 0', 'super jump committed destination');
    code = replaceOnce(code, "      this.vel.set(0, 0, 0);\n      this.form = 'squid';\n      this._probeGround();", '      const supported = prepareSuperJump(this, dt);\n      if (!this.alive) return;', 'super jump preparation physics');
    const targetStart = code.indexOf('        const tgt = s.target;'), targetEnd = code.indexOf("        s.phase = 'flight';", targetStart);
    if (targetStart < 0 || targetEnd < targetStart) throw new Error('INKWAVE patch conflict: super jump destination');
    code = replaceOnce(code, code.slice(targetStart, targetEnd), '        // Destination was committed at admission; target motion/death cannot retarget it.\n        s.from.copy(this.pos);\n', 'super jump last grounded destination');
    code = replaceOnce(code, "this.form = k > 0.82 ? 'kid' : 'squid';", "this.form = k > SUPERJUMP_MAIN_PROGRESS ? 'kid' : 'squid';", 'super jump human main boundary');
    const fallStart = code.indexOf('    // ---- fall into the sea\n'), fallEnd = code.indexOf('    this._finishFrame(dt);', fallStart);
    if (fallStart < 0 || fallEnd < fallStart) throw new Error('INKWAVE patch conflict: super jump environmental death');
    const fallBody = code.slice(fallStart, fallEnd).replace('      return;', '      return true;');
    code = code.slice(0, fallStart) + '    if (this._checkFallDeath()) return;\n\n' + code.slice(fallEnd);
    code = replaceOnce(code, '  _nearCamera() {', '  _checkFallDeath() {\n    const P = PLAYER;\n' + fallBody + '    return false;\n  }\n\n  _nearCamera() {', 'shared environmental death');
    code = replaceOnce(code, '    this._updateClimb(dt, isSquid);',
      '    this._updateClimb(dt, isSquid, jumpPressed);\n    const actionHandled = beforeActions(this, dt, jumpPressed, { wasSquid, wasSubmerged, wasClimbing, firePressed, fireWins });', 'movement actions');
    code = replaceOnce(code, '  _updateClimb(dt, isSquid) {',
      '  _updateClimb(dt, isSquid, jumpPressed = false) {', 'wall roll input edge');
    code = replaceOnce(code, '    if (into < P.climbDetachDot) {',
      '    if (into < P.climbDetachDot && !wallRollRequested(this, jumpPressed, h.normal)) {', 'wall roll before ordinary detach');
    code = replaceOnce(code, '    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing) {',
      '    if (!actionHandled && this.jumpBuffer > 0 && (this.grounded || this.coyote > 0) && !this.climbing && (isSquid || this.weapon.kind !== \'dualies\' || !this.weaponRunner.dodge && !(this.weaponRunner.lockT > 0))) {', 'jump action consumption');
    code = replaceOnce(code, '      let jv = this.submerged ? P.swimJumpVel : P.jumpVel;',
      '      let jv = takeFullCancelJumpVelocity(this) ?? (this.submerged ? P.swimJumpVel : P.jumpVel);', 'full-cancel jump launch velocity');
    code = replaceOnce(code, '      if (onEnemy) jv *= 0.72;', '      if (onEnemy) jv = this.s3?.modifiers?.enemyJumpVelocity ?? P.enemyInkJumpVel;', 'enemy ink jump');
    code = replaceOnce(code, '      this.vel.y = jv;', '      this.vel.y = normalJumpVelocity(this, jv);', 'charger full-charge jump');
    code = replaceOnce(code, '    if (!inked) {                                                        // ink ran out under us: let go',
      '    if (!inked && crossSurgeInkGap(this, h, into)) return;\n    if (!inked) {                                                        // ink ran out under us: let go', 'surge unpainted gap');
    code = replaceOnce(code, '      if (s.t > 0.75) {', '      if (supported && s.t + 1e-10 >= this.s3.jumpChargeTime + superJumpStartupTime(this)) {', 'super jump charge');
    code = replaceOnce(code, '        s.dur = 1.15 + Math.min(0.6, s.from.distanceTo(s.to) / 80);', '        s.dur = this.s3.jumpFlightTime + stealthJumpExtraTime(this, s.from, s.to);', 'super jump flight');
    code = replaceOnce(code, '        this.invuln = Math.max(this.invuln, s.dur + 0.2);',
      '        // Super Jump does not grant an extra landing shield.', 'super jump invulnerability');
    code = replaceOnce(code, '      const k = Math.min(1, s.t / s.dur);',
      '      const k = s.t + 1e-10 >= s.dur ? 1 : Math.min(1, s.t / s.dur);', 'super jump frame boundary');
    code = replaceOnce(code, "      if (k >= 1) {\n        this.superJumpState = null;",
      "      if (k >= 1) {\n        this.invuln = 0; // Spawn protection always ends before landing.\n        this.superJumpState = null;", 'super jump landing vulnerability');
    code = replaceOnce(code,
      '        this.addTurf(G.paint.splat(_v.copy(this.pos).setY(this.pos.y + 0.3), 1.4, this.team, { seed: Math.random() }));\n',
      '        // Splatoon 3: Ordinary Super Jump does not leave ink, grant turf points, or charge special at landing.\n',
      'super jump landing paint');
    const swimFormHead = code.includes('    const wantSquid = intent.squid && !intent.sub && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);')
      ? '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !intent.sub && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);\n'
      : '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy();\n';
    const swimFormTarget = swimFormHead.includes('chargerSwimLocked')
      ? '    const wasSquid = this.form === \'squid\';\n' +
        '    const wasSubmerged = this.submerged;\n' +
        '    const wasClimbing = this.climbing;\n' +
        '    // Sample the last native ground hit before choosing the next movement/collision form.\n' +
        '    this._surface();\n' +
        '    const enemyGrounded = this.grounded && this.groundTeam === 2 && !this.climbing;\n' +
        '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !intent.sub && !fireWins && !hasFullCancelGroundAttack(this) && !this.weaponRunner.busy() && !chargerSwimLocked(this) && !enemyGrounded;\n'
      : '    const wasSquid = this.form === \'squid\';\n' +
        '    const wasSubmerged = this.submerged;\n' +
        '    const wasClimbing = this.climbing;\n' +
        '    // Sample the last native ground hit before choosing the next movement/collision form.\n' +
        '    this._surface();\n' +
        '    const enemyGrounded = this.grounded && this.groundTeam === 2 && !this.climbing;\n' +
        '    const fireWins = (intent.fire || this.fireBuffer > 0) && this._firePressT >= this._squidPressT;\n' +
        '    const wantSquid = intent.squid && !fireWins && !hasFullCancelGroundAttack(this) && !this.weaponRunner.busy() && !enemyGrounded;\n';
    code = replaceOnce(code, swimFormHead, swimFormTarget, 'enemy ink swim-form eligibility');
    code = replaceOnce(code, '      if (wantSquid && this.groundTeam === 1) G.fx?.burst(', '      if (wantSquid && this.grounded && this.groundTeam === 1) G.fx?.burst(', 'no ground-entry spray for mid-air transform');
    code = replaceOnce(code,
      "    // ---- surface under feet (from last frame's ground probe; position hasn't moved since)\n    this._surface();\n",
      '', 'move surface sample before form selection');
    const start = code.indexOf('    // ---- ink / hp\n');
    const end = code.indexOf('    // ---- weapons (', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: actor resource connection');
    code = replaceOnce(code, code.slice(start, end), '    updateResources(this, dt);\n\n', 'post-movement resources');
    code = replaceOnce(code, '    this._spawnBarrier();',
      '    // S3 Spawners use stage geometry and spawn protection, not a universal radial body clamp.',
      'S3 universal spawn barrier removal');
    code = replaceOnce(code, "phase: 'rise', armor: true, startY: this.pos.y", "phase: 'rise', armor: false, startY: this.pos.y", 'Slam early action remains damageable');
    code = replaceOnce(code, '      this.invuln = 0.3;', '      // #573: protection ends with the action/landing owner.', 'Slam has no detached post-impact invulnerability');
    code = adaptTidalSlamGauge(rel, code, replaceOnce);
    code = adaptPaintOwnership(rel, code, replaceOnce);
    return `import { slamProtected } from '../../patches/splatoon3/runtime/tidal-slam-gauge.mjs';\nimport { beginTidalSlamGauge, updateTidalSlamGauge, completeTidalSlamGauge, queueTidalSlamGaugeFinish, finishTidalSlamGauge, clearTidalSlamGaugeFinish } from '../../patches/splatoon3/runtime/tidal-slam-gauge.mjs';\nimport { rollerEmergeDelay, rollerFireBuffer } from '../../patches/splatoon3/runtime/roller.mjs';\nimport { finalWeaponDamage } from '../../patches/splatoon3/runtime/final-damage.mjs';\nimport { swimSplashVisible } from '../../patches/splatoon3/runtime/swim-stealth.mjs';\nimport { prepareSuperJump, rememberSuperJumpGround, superJumpTarget, superJumpStartupTime, stealthJumpExtraTime, updateSuperJumpMain, SUPERJUMP_MAIN_PROGRESS } from '../../patches/splatoon3/runtime/superjump.mjs';\nimport { beforeActions, wallRollRequested, crossSurgeInkGap, normalJumpVelocity, clearFullCancelCandidate, hasFullCancelGroundAttack, takeFullCancelJumpVelocity } from '../../patches/splatoon3/runtime/movement.mjs';\nimport { updateResources, updateHealthRecovery, updateSpecialHealthRecovery } from '../../patches/splatoon3/runtime/resources.mjs';\nimport { scheduleLethal, flushPendingLethal, clearPendingLethal, hasPendingLethal } from '../../patches/splatoon3/runtime/damage-timing.mjs';\n` + code;
  }
  if (rel === 'src/game/character-weapons.js') {
    code = replaceOnce(code, '    if (ft >= 0.15 && ft - dt < 0.15) w.drumW += 34;', '    const release = st.flickReleaseTime ?? 0.15;\n    if (ft >= release && ft - dt < release) w.drumW += 34;', 'roller drum release impulse');
    code = replaceOnce(code, 'const BUILDERS = { shooter: buildShooter, roller: buildRoller,', 'const BUILDERS = { shooter: buildShooter, roller: () => rollerFoldModel(rollerModel(buildRoller())),', 'roller drum proportions and articulated middle hinge');
    code = replaceOnce(code, 'blaster: buildBlaster,', 'blaster: () => blasterMechanism(buildBlaster()),', 'blaster S3 lever/spring-front mechanism channels');
    return "import { rollerModel } from '../../patches/splatoon3/runtime/roller-model.mjs';\nimport { rollerFoldModel } from '../../patches/splatoon3/runtime/roller-fold.mjs';\nimport { blasterMechanism } from '../../patches/splatoon3/runtime/blaster-mechanism-model.mjs';\n" + code;
  }
  if (rel === 'src/audio/music.js') {
    // Match-start Opening cue (issue #605): an original short sting for the pre-GO intro.
    // Distinct id/name/tempo from battle and battle_final (both 150 bpm): at 140 bpm the GO
    // hand-off to the battle track takes the engine's immediate cross-fade path instead of
    // delaying the battle downbeat to the next bar line.
    const OPENING = `  // Splatoon-style match-start Opening cue (issue #605): plays through the pre-GO intro.
  // Original INKWAVE composition; distinct from battle / battle_final (see the GO hand-off).
  opening: {
    name: 'Opening Sting', bpm: 140, swing: 0, key: 'A minor', pump: 0.3,
    inst: { bass: 'punk', chords: 'guitar', arp: 'pluck' },
    mix: { hats: 0.15, arp: 0.12 },
    sections: {
      A: {
        bars: 4, crash: true, chords: ['A5', 'A5', 'C5 D5', 'G5 A5'], riser: 1,
        drums: {
          k: 'X...X...X...X...',
          s: '....X.......X...',
          h: 'x.x.x.x.x.x.x.x.',
        },
        fills: { s: 'x.x.x.x.xxxxXXXX' },
        bass: 'R.R.R.R.R.R.R.R.',
        stabs: 'X-------X-------',
        arp: { rate: 2, pattern: 'up', oct: 1, lo: 64 },
      },
    },
    order: ['A'], loopFrom: 0,
  },

`;
    // Re-applying the adapter to already-patched music must fail closed instead of duplicating the cue.
    if (code.includes("  opening: {\n    name: 'Opening Sting',")) {
      throw new Error('INKWAVE patch conflict (match-start Opening cue): expected exactly one connection. Review upstream changes; site was not built.');
    }
    code = replaceOnce(code, "  results_win: {\n    name: 'Fresh Victory',", OPENING + "  results_win: {\n    name: 'Fresh Victory',", 'match-start Opening cue');
    code = replaceOnce(code,
      '  constructor() {\n    this.ctx = null; this.players = []; this.current = null; this.intensity = 1; this._want = undefined;\n  }',
      '  constructor() {\n    this.ctx = null; this.players = []; this.current = null; this.intensity = 1; this._want = undefined; this._timerPaused = false;\n  }',
      'music visibility state');
    code = replaceOnce(code, '  _startTimer() {\n    const tick = () => this._tick();',
      '  _startTimer() {\n    if (this.offline || this._timerPaused || this.worker || this.timer) return;\n    const tick = () => this._tick();',
      'music timer idempotence');
    code = replaceOnce(code,
      '      this.worker.onerror = () => { this.worker = null; if (!this.timer) this.timer = setInterval(tick, TICK_MS); };',
      '      this.worker.onerror = () => { this.worker = null; if (!this._timerPaused && !this.timer) this.timer = setInterval(tick, TICK_MS); };',
      'music worker hidden fallback');
    code = replaceOnce(code, '      this.timer = setInterval(tick, TICK_MS);',
      '      if (!this._timerPaused) this.timer = setInterval(tick, TICK_MS);', 'music timer hidden fallback');
    code = replaceOnce(code, '  _tick() {',
      '  _pauseTimer() {\n    if (this.offline) return;\n    this._timerPaused = true;\n    if (this.worker) this.worker.postMessage(0);\n    if (this.timer) { clearInterval(this.timer); this.timer = null; }\n  }\n\n  _resumeTimer() {\n    if (this.offline || !this.ctx) return;\n    const paused = this._timerPaused; this._timerPaused = false;\n    if (this.worker) this.worker.postMessage(TICK_MS); else if (!this.timer) this._startTimer();\n    if (paused) this._tick();\n  }\n\n  _tick() {',
      'music visibility timer controls');
    code = replaceOnce(code, '  dispose() {\n    for (const p of this.players) p.dispose();',
      '  dispose() {\n    this._timerPaused = true;\n    for (const p of this.players) p.dispose();', 'music dispose visibility state');
    return code;
  }
  if (rel === 'src/audio/audio.js') {
    code = replaceOnce(code,
      "  resume() {\n    const c = this.ctx;\n    if (c && !this.offline && c.state !== 'running' && c.state !== 'closed' && c.resume) c.resume().catch(() => {});\n  }",
      "  resume() {\n    const c = this.ctx;\n    if (!c || this.offline || c.state === 'closed') return;\n    if (c.state === 'running') { this.music?._resumeTimer?.(); return; }\n    if (c.resume) c.resume().then(() => this.music?._resumeTimer?.()).catch(() => {});\n  }",
      'audio lifecycle resume');
    code = replaceOnce(code,
      "    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) h(); });",
      "    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {\n      if (document.hidden) {\n        this.music?._pauseTimer?.();\n        const c = this.ctx;\n        if (c && !this.offline && c.state !== 'closed' && c.suspend) c.suspend().catch(() => {});\n      } else h();\n    });",
      'audio visibility suspend');
    return code;
  }
  if (rel === 'src/main.js') {
    // #614: Splatoon 3's normal battle HUD has no global text feed naming remote
    // attacker/victim pairs. Drop the two remote-splat feed broadcasts; the local
    // splat confirmation (kind 'kill'), own-death showSplatted, the top roster and
    // WIPEOUT! keep their existing paths. The ally-down audio cue stays because it
    // carries no identity.
    code = replaceOnce(code,
      "        G.audio?.play('ally_splatted', { volume: 0.5 });\n" +
      "        this.hud?.feed({ text: attacker ? t('{victim} was splatted by {attacker}', { victim: victim.name, attacker: attacker.name }) : t('{victim} was splatted', { victim: victim.name }), color: G.teamHex[victim.enemyTeam], kind: 'death' });\n" +
      "      } else if (attacker && attacker.team === local?.team) {\n" +
      "        this.hud?.feed({ text: t('{attacker} splatted {victim}', { attacker: attacker.name, victim: victim.name }), color: G.teamHex[attacker.team], kind: 'ally' });\n" +
      "      }",
      "        // #614: no global text feed naming remote attacker/victim pairs — the top\n" +
      "        // roster (alive/splatted) and WIPEOUT! already carry remote splat state;\n" +
      "        // keep only the non-identifying ally-down audio cue.\n" +
      "        G.audio?.play('ally_splatted', { volume: 0.5 });\n" +
      "      }\n" +
      "      // Remote ally-on-enemy splats (#614) likewise add no text entry: the local\n" +
      "      // confirmation above is the only feed that names a remote player.",
      'splat feed remote-identity gate (#614)');
    code = replaceOnce(code,
      '  _menuApi() {\n    const self = this;\n    const api = (this.api = {\n',
      '  _menuApi() {\n    const self = this;\n    const api = (this.api = {\n      connectControllerMotion: () => (self.input?.requestWebHID ? self.input.requestWebHID() : null),\n',
      'menu api connectControllerMotion');
    code = replaceOnce(code,
      '    this.input = G.input = new Input(this.R.renderer.domElement);',
      '    this.input = G.input = new Input(this.R.renderer.domElement);\n    this.input.attachWebHID?.();',
      'auto attach WebHID on boot');
    const start = code.indexOf('    G.time += dt;\n', code.indexOf('  _frame(dt) {'));
    const end = code.indexOf('    // A full-frame lobby/showcase completely covers', start);
    if (start < 0 || end < start) throw new Error('INKWAVE patch conflict: fixed simulation connection');
    code = code.slice(0, start)
      + '    const m = this.match;\n'
      + '    const setUp = !!this.showcase?.fullFrame;\n'
      + '    runSimulation(this, dt);\n'
      // #53: RESULT keeps only the stage/GUI animation it actually needs; the
      // paint atlas and gameplay FX stop behind the results screen (offline and
      // online alike). The results stage, GUI, backdrop draw and renderer keep
      // their cadence so the reveal stays visible and rematch/resize resume.
      + "    const resultsQuiet = this.match?.state === 'results';\n"
      + code.slice(end);
    code = replaceOnce(code,
      '      if (!m || !m.paused) G.fx.update(dt, G.camera);\n      if (!m || !m.paused) this.fxHooks?.update?.(dt);',
      '      if (!m || (!m.paused && !resultsQuiet)) G.fx.update(dt, G.camera);\n      if (!m || (!m.paused && !resultsQuiet)) this.fxHooks?.update?.(dt);',
      '#53 gameplay FX behind results');
    code = replaceOnce(code, '      G.paint.flush(dt);', '      if (!resultsQuiet) G.paint.flush(dt);', '#53 paint atlas behind results');
    code = replaceOnce(code,
      '      if (this.swimWake && (!m || !m.paused)) this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);',
      '      if (this.swimWake && (!m || (!m.paused && !resultsQuiet))) this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);',
      '#53 swim wakes behind results');
    code = replaceOnce(code, '    dt = Math.min(dt, 1 / 24);\n', '', 'elapsed time');
    code = replaceOnce(code,
      `    // shadows: every frame (half-rate updates made moving shadows — your own, right under the crosshair — judder);
    // only the low preset halves it
    const sm = G.renderer.shadowMap;
    sm.autoUpdate = false;
    this._frameN = (this._frameN || 0) + 1;
    if (!worldHidden && (this.settings.quality !== 'low' || (this._frameN & 1))) sm.needsUpdate = true;`,
      `    // #1026: shadow cadence follows effective device quality. Touch-primary
    // gameplay caps the 2048px sun shadow at 30 Hz; desktop HIGH/ULTRA keeps
    // full cadence and LOW remains half-rate. ShadowCache stays enabled.
    const sm = G.renderer.shadowMap;
    sm.autoUpdate = false;
    this._frameN = (this._frameN || 0) + 1;
    const shadowQuality = effectiveQuality(this.settings, this.mobile);
    const halfRateShadow = !!this.mobile?.touch || shadowQuality.shadowSize <= 1024;
    if (!worldHidden && (!halfRateShadow || (this._frameN & 1))) sm.needsUpdate = true;`,
      'effective mobile shadow cadence');
    code = replaceOnce(code, '    this.input.endFrame();\n', '', 'input consumption');
    {
      const judgeStart = code.indexOf('  async _judge() {');
      const judgeEnd = code.indexOf('\n  _fade(', judgeStart);
      if (judgeStart < 0 || judgeEnd < judgeStart) throw new Error('INKWAVE patch conflict (Private Battle persistent progression): judge boundary');
      let judge = code.slice(judgeStart, judgeEnd);
      if (!judge.includes('const privateBattle = !!G.netm;')) {
        // score-hud runs before this inline composition and may own the exact
        // Turf XP expression. Preserve that expression without coupling this
        // ownership patch to its spelling.
        const gainedPattern = /^(\s*)const gained = ([^\n;]+);/gm;
        const gainedMatches = [...judge.matchAll(gainedPattern)];
        if (gainedMatches.length !== 1) throw new Error(`INKWAVE patch conflict (Private Battle persistent progression): expected one Turf gained line (${gainedMatches.length})`);
        judge = judge.replace(gainedPattern, (_line, indent, rhs) =>
          `${indent}const privateBattle = !!G.netm;\n${indent}const gained = privateBattle ? 0 : ${rhs};`);

        const mutStart = judge.indexOf('    p.xp += gained;');
        const saveLine = "    saveJSON('inkwave.profile', p);";
        const saveStart = judge.indexOf(saveLine, mutStart);
        if (mutStart < 0 || saveStart < mutStart) throw new Error('INKWAVE patch conflict (Private Battle persistent progression): profile mutation block');
        const mutEnd = saveStart + saveLine.length;
        const mutation = judge.slice(mutStart, mutEnd);
        const indented = mutation.split('\n').map(line => '  ' + line).join('\n');
        judge = judge.slice(0, mutStart) + '    if (!privateBattle) {\n' + indented + '\n    }' + judge.slice(mutEnd);
      }
      code = code.slice(0, judgeStart) + judge + code.slice(judgeEnd);
    }
    code = replaceOnce(code,
      '    const judgeP = this.hud?.judge({ colors: [G.teamHex[0], G.teamHex[1]], percents: [cov[0] * 100, cov[1] * 100], names: this.palette.names || TEAM_NAMES });',
      '    const judgeP = this.hud?.judge({ colors: [G.teamHex[0], G.teamHex[1]], percents: [cov[0] * 100, cov[1] * 100], names: this.palette.names || TEAM_NAMES, winner: m.result.winner });',
      'authoritative Turf winner Game to HUD');
    code = replaceOnce(code, 'const game = new Game();', 'installGame(Game);\nconst game = new Game();', 'game installation');
    // Issue #605: the turf intro starts the dedicated Opening cue instead of silence.
    // The boss intro keeps its own _playMusic(null); mode is guarded for a boss match
    // without a resolved entity. Practice Range / attract never reach _intro().
    code = replaceOnce(code,
      "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);\n    this._playMusic(null);",
      "    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.setVisible(true); }, 3000);\n    this._playMusic(this.match?.mode === 'boss' ? null : 'opening');   // #605 match-start Opening cue",
      'match-start Opening cue');

    code = replaceOnce(code,
      '    const frame = {\n      time: m.time,',
      `    const muzzleContact = w.kind === 'shooter' ? G.projectiles?.muzzleBlockFeedback?.(a) : null;
    let muzzleBlock = null;
    if (muzzleContact) {
      const projectedContact = this._muzzleBlockScreen || (this._muzzleBlockScreen = new THREE.Vector3());
      projectedContact.copy(muzzleContact.point).project(cam);
      if (projectedContact.z >= -1 && projectedContact.z <= 1
        && Math.abs(projectedContact.x) <= 1 && Math.abs(projectedContact.y) <= 1) {
        muzzleBlock = { x: projectedContact.x * W / 2, y: -projectedContact.y * H / 2 };
      }
    }
    const frame = {
      time: m.time,`,
      'projected Shooter muzzle contact');
    code = replaceOnce(code,
      "      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },",
      "      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true, guide: projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H), muzzleBlock, chargerCurrent: m.controller?.chargerReachVisible ? m.controller.chargerCurrentReach : null, chargerFull: m.controller?.chargerReachVisible ? m.controller.chargerFullReach : null },",
      'S3 ShotGuideFrame and muzzle-contact HUD projection');
    {
      const rawEnemyReveal = "          // enemies only show on the map when visible to your team (not submerged far away)\n          if (o.anim.form === 'swim') continue;";
      const scoreHudEnemyReveal = "          if (!mapActorVisible(o, a, PLAYER.hp, G.time)) continue;";
      const directEnemyReveal = "          // S3 Turf Map: opponents appear only once damaged (>=18) or explicitly marked.\n          if (!enemyRevealedOnMap(o, PLAYER.hp)) continue;";
      const combinedEnemyReveal = "          // S3 Turf Map: preserve timed/team reveal and explicit recon marking; damage >=18 satisfies both.\n          if (!mapActorVisible(o, a, PLAYER.hp, G.time) && !enemyRevealedOnMap(o, PLAYER.hp)) continue;";
      if (code.includes(scoreHudEnemyReveal)) {
        code = replaceOnce(code, scoreHudEnemyReveal, combinedEnemyReveal, 'enemy map reveal after score HUD');
      } else if (code.includes(rawEnemyReveal)) {
        code = replaceOnce(code, rawEnemyReveal, directEnemyReveal, 'enemy map reveal');
      } else {
        const accepted = [directEnemyReveal, combinedEnemyReveal].reduce((n, value) => n + (code.split(value).length - 1), 0);
        if (accepted !== 1) throw new Error('INKWAVE patch conflict (enemy map reveal): expected raw, score-HUD, or composed connection');
      }
    }
    code = replaceOnce(code,
      "        const by = attacker ? attacker.name : t(cause === 'water' ? 'the sea' : 'enemy ink');\n        this.hud?.showSplatted({ by, byColor:",
      "        const card = splatCardText(cause, attacker, t); // SPLATTED BY names the cause; the opponent is a separate line\n        this.hud?.showSplatted({ by: card.cause, who: card.who, byColor:",
      'death card splat cause');
    // #1131: an async Judd reveal belongs to the match/epoch that started it.
    // Quitting/room abort invalidates the epoch synchronously, before the fade,
    // so stale continuation cannot revive results or mutate persistent XP.
    code = replaceOnce(code,
      '  async _judge() {\n    const m = this.match;',
      '  async _judge() {\n    const m = this.match;\n    const judgeEpoch = this._s3JudgeEpoch = (this._s3JudgeEpoch || 0) + 1;',
      'Judd result epoch');
    code = replaceOnce(code,
      '    await (judgeP || new Promise((r) => setTimeout(r, 4000)));',
      '    await (judgeP || new Promise((r) => setTimeout(r, 4000)));\n    if (this._s3JudgeEpoch !== judgeEpoch || this.match !== m || m.state !== \'judge\') return;',
      'Judd stale continuation guard');
    code = replaceOnce(code,
      '  async quitToMenu() {\n    clearTimeout(this._netEndT);',
      '  async quitToMenu() {\n    this._s3JudgeEpoch = (this._s3JudgeEpoch || 0) + 1;\n    clearTimeout(this._netEndT);',
      'menu exit invalidates Judd result');
    return `import { runSimulation, installGame } from '../patches/splatoon3/runtime/clock.mjs';\nimport { projectShotGuide } from '../patches/splatoon3/runtime/weapons-fidelity.mjs';\nimport { enemyRevealedOnMap } from '../patches/splatoon3/runtime/map-reveal.mjs';\nimport { splatCardText } from '../patches/splatoon3/runtime/death-card.mjs';\n` + code;
  }

  if (rel === 'src/game/showcase.js') {
    // #1119: portrait readback staging targets are lazy resources, not
    // lifetime Showcase allocations. Leaving Locker releases them once async
    // readbacks settle; final dispose also tears down the resolve material/scene.
    code = replaceOnce(code,
      '    this._pq = []; this._pcache = new Map(); this._prt = null; this._prt8 = null; this._pbuf = null; this._pcam = null;',
      '    this._pq = []; this._pcache = new Map(); this._prt = null; this._prt8 = null; this._pbuf = null; this._pcam = null; this._portraitReleasePending = false;',
      'portrait target lifecycle state');
    code = replaceOnce(code,
      '  hide() {\n    if (!this.mode) return;',
      "  hide() {\n    if (!this.mode) return;\n    const leavingPortraitScreen = this.mode === 'locker';",
      'portrait screen exit capture');
    code = replaceOnce(code,
      '    this.mode = null;\n  }\n\n  dispose() {',
      "    this.mode = null;\n    if (leavingPortraitScreen) this._releasePortraitTargets(false);\n  }\n\n  dispose() {",
      'portrait target release on Locker exit');
    code = replaceOnce(code,
      '    this._lobRelease();\n    this._rt?.dispose(); this._rt = null;',
      '    this._lobRelease();\n    this._releasePortraitTargets(true);\n    this._rt?.dispose(); this._rt = null;',
      'portrait target final disposal');
    code = replaceOnce(code,
      '  _renderPortrait(req) {',
      `  _releasePortraitTargets(final = false) {
    if (!final && ((this._pflight || 0) > 0 || this._pq?.some?.((x) => x.cbs?.length))) { this._portraitReleasePending = true; return false; }
    this._portraitReleasePending = false;
    this._prt?.dispose(); this._prt8?.dispose();
    this._prt = this._prt8 = null;
    if (final) {
      this._pres?.dispose(); this._pres = null;
      this._presScene?.clear?.(); this._presScene = null;
      this._pcam = null; this._pbuf = null;
    }
    return true;
  }

  _renderPortrait(req) {`,
      'portrait target release helper');
    code = replaceOnce(code,
      "    read.then((cv) => { this._pflight--; finish(cv); }, (e) => { this._pflight--; console.error('[showcase] portrait read', e); finish(null); });",
      "    const settle = () => { this._pflight--; if (this._portraitReleasePending && this._pflight === 0) this._releasePortraitTargets(false); };\n    read.then((cv) => { settle(); finish(cv); }, (e) => { settle(); console.error('[showcase] portrait read', e); finish(null); });",
      'portrait readback-safe release');
    code = replaceOnce(code,
      '    const job = this._pq.shift();\n    if (!job) return;',
      '    const job = this._pq.shift();\n    if (!job) { if (this._portraitReleasePending && (this._pflight || 0) === 0) this._releasePortraitTargets(false); return; }',
      'portrait empty-queue release');
    return code;
  }

  if (rel === 'src/core/shadowcache.js') {
    // #658: a stage switch must release the previously collected static-caster
    // generation immediately. While Shadows are OFF no shadow-map render runs,
    // so the dirty flag alone never rebuilds `this.static` and the stale array
    // would keep the disposed previous stage (meshes, PropKit atlas) alive.
    code = replaceOnce(code,
      '  setStaticRoots(roots) {\n    this.roots = roots.filter(Boolean);\n    this.dynamic = new WeakSet();\n    this.dirty = true;\n  }',
      '  setStaticRoots(roots) {\n    this.roots = roots.filter(Boolean);\n    this.static.length = 0; // #658: release the previous collected caster generation at the root handoff\n    this.dynamic = new WeakSet();\n    this.dirty = true;\n  }',
      'stage-root static release');
  }


  if (rel === 'src/world/paint.js') {
    code = adaptPaintOwnership(rel, code, replaceOnce);
    return "import { installIssue570PaintPresentation } from '../../patches/splatoon3/runtime/render.mjs';\n" +
      "import { installIssue264PaintOwnership } from '../../patches/splatoon3/runtime/paint-ownership.mjs';\n" +
      code + '\ninstallIssue570PaintPresentation(PaintSystem);\n' +
      'installIssue264PaintOwnership(PaintSystem, { kind: K, reach: REACH, dripReach: DRIP_REACH, shapes: [[5, 7, 8, 3], [3, 4, 5, 2], [7, 9, 10, 4], [10, 12, 14, 5], [3, 4, 4, 2], [2, 2, 0, 1], [0, 0, 0, 0], [0, 0, 0, 0]] });\n';
  }
  code = adaptPaintOwnership(rel, code, replaceOnce);
  return code;
}

export function writeBuildIdentity(src, out, patchRoot = PATCH_ROOT, build = {}) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  const files = {};
  for (const root of [src, patchRoot]) for (const file of walk(root).sort()) {
    if (file.includes('/tests/') || file.endsWith('.md')) continue;
    files[(root === src ? 'upstream/' : 'patch/') + path.relative(root, file)] = sha256(fs.readFileSync(file));
  }
  const inputHash = sha256(JSON.stringify(files));
  const artifacts = {};
  for (const file of walk(out).sort()) {
    const rel = path.relative(out, file);
    if (rel !== 'inkwave-build.json') artifacts[rel] = sha256(fs.readFileSync(file));
  }
  const contentHash = sha256(JSON.stringify(artifacts));
  const identity = { schema: 1, patch: 'splatoon3', contentHash, inputHash, build, files, artifacts };
  fs.writeFileSync(path.join(out, 'inkwave-build.json'), JSON.stringify(identity, null, 2) + '\n');
  return identity;
}
