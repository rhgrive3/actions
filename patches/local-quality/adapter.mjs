import { adaptMenuNavigationTimer } from './menu-navigation-timer-adapter.mjs';
import { adaptMuralAtlas } from './mural-atlas-adapter.mjs';
import { adaptBotPaintObservation } from './bot-paint-observation-adapter.mjs';
import { adaptClothingGear } from '../splatoon3/clothing-gear-adapter.mjs';
import { adaptIssue465 } from '../splatoon3/issue-465-adapter.mjs';
import { adaptIssue479 } from '../splatoon3/issue-479-adapter.mjs';
import { adaptIssue481 } from '../splatoon3/issue-481-adapter.mjs';
import { adaptQualityIssue418 } from './issue-418-adapter.mjs';
import { adaptTexlibSource } from './texlib-adapter.mjs';
import { adaptIssue477Source } from '../splatoon3/issue-477-adapter.mjs';
import { adaptBossHit } from './boss-hit-adapter.mjs';
import { adaptTeamSpecialSignal } from './team-special-signal-adapter.mjs';
import { adaptIssue483 } from '../splatoon3/issue-483-adapter.mjs';
import { adaptSlosherEmergeGate } from '../splatoon3/issue-435-adapter.mjs';
import { patchLobbySetShowcase } from './lobby-quality-adapter.mjs';
import { adaptPaintMipmaps } from './issue-190-adapter.mjs';
import { adaptPropRetention } from './prop-retention-adapter.mjs';
import { adaptPropAtlas } from './prop-atlas-adapter.mjs';
import { adaptIssue482 } from '../splatoon3/issue-482-adapter.mjs';
import { adaptIssue405 } from '../splatoon3/issue-405-adapter.mjs';
import { adaptIssue484 } from '../splatoon3/issue-484-adapter.mjs';
import { adaptIssue460Source } from '../splatoon3/issue-460-adapter.mjs';
import { adaptIssue427 } from '../splatoon3/issue-427-adapter.mjs';
import { adaptIssue461Source } from './issue-461-sfx-mute.mjs';
import { adaptIssue480Source } from './issue-480-camera-shake-fidelity.mjs';
import { adaptTenacity } from './tenacity-adapter.mjs';
import { adaptFxActorLifetime } from './fx-actor-lifetime-adapter.mjs';
import { adaptHudSnapshots } from './hud-snapshots-adapter.mjs';
import { adaptResultContinuation } from './result-continuation-adapter.mjs';
import { adaptShowcaseShadow } from './showcase-shadow-adapter.mjs';
import { adaptTeamWipeout } from './team-wipeout-adapter.mjs';
import { adaptSplatlingReticle } from './splatling-reticle-adapter.mjs';
import { adaptPortraitGuard } from './portrait-guard-adapter.mjs';
import { adaptHudAuthority } from './hud-authority-adapter.mjs';
// Build-only quality corrections composed after the gameplay, touch-layout and
// reliability adapters. Upstream inkwave-public/ remains byte-for-byte intact.
import fs from 'node:fs';
import { adaptScreenfxDamageReset } from './screenfx-damage-reset-adapter.mjs';
import { adaptComposerFormat } from './composer-format-adapter.mjs';
import { adaptComposerTarget } from './composer-target-adapter.mjs';
import { adaptScreenfxLensRelease } from './screenfx-lens-release-adapter.mjs';
import { adaptActorWeaponInput } from './actor-weapon-input-adapter.mjs';
import { adaptBotRefillRelease } from './bot-refill-release-adapter.mjs';
import { adaptBotEdgeGuard } from './bot-edge-guard-adapter.mjs';
import { adaptFinalMinuteMusic } from './final-minute-music-adapter.mjs';
import { adaptFinalCount } from './final-count-adapter.mjs';
import { adaptTurfLead } from './turf-lead-adapter.mjs';
import { adaptScoreReticle } from './score-reticle-adapter.mjs';
import { adaptMapTeammateStatus } from './map-teammate-status-adapter.mjs';
import { adaptResourceSource } from './resource-adapter.mjs';
import { adaptMedalSource } from './medal-adapter.mjs';
import { adaptAimProfiles } from './aim-profile-adapter.mjs';
import { adaptUiActorLifetime } from './ui-actor-lifetime-adapter.mjs';
import { adaptIdleSource } from './idle-adapter.mjs';
import { adaptPlatformSource } from './platform-adapter.mjs';
import { adaptLandingRigidity } from './landing-rigidity-adapter.mjs';
import { adaptMatchRetainers } from './match-retainer-adapter.mjs';
import { adaptFirstTouch } from './first-touch-source-adapter.mjs';
import { adaptTouchRelayout } from './touch-relayout-adapter.mjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptMinimapResources } from './minimap-resource-adapter.mjs';
import { adaptLobbyResources } from './lobby-resource-adapter.mjs';
import { adaptFrameOrder } from './frame-order-adapter.mjs';
import { adaptReflSkip } from './refl-skip-adapter.mjs';
import { adaptFinishTape } from './finish-tape-adapter.mjs';
import { adaptAudioListener } from './audio-listener-adapter.mjs';

export const QUALITY_ROOT = fileURLToPath(new URL('./', import.meta.url));
const IDENTITY_FILES = [
  'lobby-quality-adapter.mjs', 'first-touch-source-adapter.mjs', 'touch-relayout-adapter.mjs',
  'menu-navigation-timer-adapter.mjs',
  'mural-atlas-adapter.mjs',
  'bot-paint-observation-adapter.mjs',
  'issue-418-adapter.mjs','world-quality.mjs','quality-probe.mjs','texlib-adapter.mjs','texlib.mjs',
  'boss-hit-adapter.mjs',
  'team-special-signal-adapter.mjs',
  'issue-190-adapter.mjs', 'paint-mipmap-probe.mjs', 'issue-472-adapter.mjs',
  'screenfx-damage-reset-adapter.mjs', 'composer-format-adapter.mjs', 'composer-target-adapter.mjs', 'screenfx-lens-release-adapter.mjs', 'actor-weapon-input-adapter.mjs', 'bot-refill-release-adapter.mjs', 'bot-edge-guard-adapter.mjs',
  'fx-actor-lifetime-adapter.mjs',
  'hud-snapshots-adapter.mjs', 'hud-snapshots.mjs',
  'hud-authority-adapter.mjs',
  'result-continuation-adapter.mjs', 'result-continuation.mjs',
  'showcase-shadow.mjs', 'showcase-shadow-adapter.mjs',
  'team-wipeout.mjs', 'team-wipeout-adapter.mjs',
  'splatling-reticle.mjs', 'splatling-reticle-adapter.mjs',
  'portrait-guard.mjs', 'portrait-guard-adapter.mjs',
  'final-minute-music-adapter.mjs',
  'final-count-adapter.mjs',
  'turf-lead-adapter.mjs',
  'score-reticle-adapter.mjs', 'map-teammate-status-adapter.mjs',
  'prop-retention-adapter.mjs', 'prop-atlas-adapter.mjs',
  'issue-461-sfx-mute.mjs', 'issue-480-camera-shake-fidelity.mjs',
  'audio-listener-adapter.mjs', 'runtime/audio-listener.mjs',
  'resource-adapter.mjs', 'resource-budget.mjs', 'portrait-work.mjs', 'depth-cache.mjs',
  'aim-profile-adapter.mjs', 'aim-profile.mjs', 'medal-adapter.mjs',
  'resource-adapter.mjs', 'resource-budget.mjs', 'depth-cache.mjs',
  'hud-authority-adapter.mjs',
  'aim-profile-adapter.mjs', 'aim-profile.mjs', 'medal-adapter.mjs',
  'ui-actor-lifetime-adapter.mjs',
  'tenacity-adapter.mjs', 'tenacity.mjs',
  'idle-adapter.mjs', 'idle-resources.mjs', 'music-idle.mjs',
  'lobby-resource-adapter.mjs', 'minimap-resource-adapter.mjs', 'refl-skip-adapter.mjs', 'finish-tape-adapter.mjs',
  'adapter.mjs', 'gyro.mjs', 'install.mjs', 'menu-preview.mjs', 'menu.mjs',
  'roller-motion.mjs', 'roller-visual.mjs', 'surface.mjs', 'landing-rigidity-adapter.mjs', 'match-retainer-adapter.mjs', 'first-touch-adapter.mjs', 'touch-relayout.mjs',
  'offscreen-visual-budget.mjs',
  'platform-adapter.mjs', 'platform-lifecycle.mjs', 'platform-game.mjs',
  'platform-input.mjs', 'platform-audio.mjs', 'platform-transport.mjs',
  'mobile-platform.mjs', 'gyro-permission.mjs', 'gyro-startup.mjs',
  'screen-angle.mjs', 'frame-order-adapter.mjs', 'charger-sight.mjs',
];

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE quality patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

// Presentation-order corrections run last, on this layer's finished output.
export function adaptQualitySource(rel, code) {
  code = adaptMuralAtlas(rel, code, replaceOnce);
  code = adaptIssue482(rel, code);
  code = adaptIssue405(rel, code);
  code = adaptIssue484(rel, code);
  const framed = adaptFrameOrder(rel, adaptQualityLayer(rel, code));
  const lazy = adaptComposerTarget(rel, framed, replaceOnce);
  return adaptMenuNavigationTimer(rel, adaptComposerFormat(rel, lazy, replaceOnce), replaceOnce);
}

function adaptQualityLayer(rel, code) {
  code = adaptBotPaintObservation(rel, code);
  code = adaptPropRetention(rel, code);
  code = adaptPropAtlas(rel, code);
  code = adaptScreenfxDamageReset(rel, code, replaceOnce);
  code = adaptScreenfxLensRelease(rel, code, replaceOnce);
  code = adaptActorWeaponInput(rel, code, replaceOnce);
  code = adaptBotRefillRelease(rel, code, replaceOnce);
  code = adaptBotEdgeGuard(rel, code, replaceOnce);
  code = adaptFinalMinuteMusic(rel, code, replaceOnce);
  code = adaptFinalCount(rel, code, replaceOnce);
  code = adaptTurfLead(rel, code, replaceOnce);
  code = adaptScoreReticle(rel, code, replaceOnce);
  code = adaptMapTeammateStatus(rel, code, replaceOnce);
  code = adaptIssue427(rel, code);
  code = adaptClothingGear(rel, code, replaceOnce);
  code = adaptBossHit(rel, code);
  code = adaptTeamSpecialSignal(rel, code, replaceOnce);
  code = adaptIssue460Source(rel, code);
  code = adaptIssue461Source(rel, code);
  code = adaptAudioListener(rel, code);
  code = adaptAimProfiles(rel, code);
  code = adaptMedalSource(rel, code);
  code = adaptResourceSource(rel, code, replaceOnce);
  code = adaptFxActorLifetime(rel, code, replaceOnce);
  if (rel === 'src/main.js') {
    code = replaceOnce(code,
      "    // your team on the podium\n    const team = m.actors.filter((a) => a.team === myTeam);\n    this.showcase.showResults(myTeam, won, G.teamColors[myTeam], team.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));",
      "    // #565: showcase authority is independent of local rewards/audio.\n    const podiumTeam = m.result.winner;\n    const team = m.actors.filter((a) => a.team === podiumTeam);\n    if (podiumTeam === 0 || podiumTeam === 1) this.showcase.showResults(podiumTeam, true, G.teamColors[podiumTeam], team.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));",
      'winner-only Turf showcase');
  }
  if (rel === 'src/game/match.js') {
    code = replaceOnce(code,
      '    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;',
      "    emit('match:dispose', { match: this });\n    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;",
      'release match-owned boss audio before disposal');
  }
  if (rel === 'src/audio/bossAudio.js') {
    code = replaceOnce(code,
      'const end = () => { stopAll(0.4); st.active = false; st.boss = null; st.track = null; setRemap(false); };',
      'const end = () => { stopAll(0.4); if (followId) { clearInterval(followId); followId = 0; } st.active = false; st.boss = null; st.track = null; setRemap(false); };',
      'boss audio terminal interval owner');
    code = replaceOnce(code,
      "  on('match:state', ({ state, match }) => {",
      "  on('match:dispose', ({ match }) => { if (st.active && match?.boss && match.boss === st.boss) end(); });\n  on('match:state', ({ state, match }) => {",
      'boss audio follows its matching disposal');
    code = replaceOnce(code,
      "    if (state === 'results' || state === 'judge') { stopAll(0.3); setRemap(false); }",
      "    if ((state === 'results' || state === 'judge') && match.mode === 'boss' && match.boss === st.boss) end();",
      'boss audio terminal state releases retained graph');
  }
  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(code,
      "      this._killCard(victim, 'kill');",
      "      this._killCard(victim, 'kill');\n      // #593: Turf uses ordinary splat confirmation and independent team WIPEOUT.\n      if (G.match?.mode === 'turf') return;",
      'Turf excludes arcade personal streak ribbons');
    code = replaceOnce(code,
      "      const kk = L.kind === 'blaster' ? 0 : this._kick * this._kick * (L.kind === 'splatling' ? 4 : 7);\n      const sp = clamp((+ch.spread || 0) + this._bloom * (L.kind === 'blaster' ? 5 : 2.5) + kk, 0, 90);",
      "      // #560: Game already projects the authoritative weapon cone.\n      const sp = clamp(+ch.spread || 0, 0, 90);\n      if (L.bl !== 0) { L.bl = 0; this.ret.style.setProperty('--bl', '0'); }",
      'authoritative HUD spread, no second recoil cone');
  }
  code = adaptHudSnapshots(rel, code, replaceOnce);
  code = adaptTenacity(rel, code, replaceOnce);
  if (rel !== 'src/ui/menus.js') code = adaptResultContinuation(rel, code, replaceOnce);
  code = adaptShowcaseShadow(rel, code, replaceOnce);
  code = adaptTeamWipeout(rel, code, replaceOnce);
  code = adaptSplatlingReticle(rel, code, replaceOnce);
  code = adaptPortraitGuard(rel, code, replaceOnce);
  code = adaptIssue465(rel, code);
  code = adaptIssue481(rel, code);
  code = adaptIssue479(rel, code);
  code = adaptTexlibSource(rel, code);
  code = adaptIssue477Source(rel, code);
  code = adaptIdleSource(rel, code, replaceOnce);
  code = adaptIssue480Source(rel, code);
  code = adaptReflSkip(rel, code, replaceOnce);
  code = adaptLobbyResources(rel, code);
  code = adaptMinimapResources(rel, code);
  code = adaptUiActorLifetime(rel, code, replaceOnce);
  code = adaptLandingRigidity(rel, code);
  code = adaptMatchRetainers(rel, code, replaceOnce);
  code = adaptQualityIssue418(rel, code);
  if (rel === 'src/main.js') {
    code = "import { updateSplatGhosts } from '../patches/splatoon3/issue-284-adapter.mjs';\n" + code;
    code = replaceOnce(code, 'this.fxHooks?.update?.(worldDt);', '{ this.fxHooks?.update?.(worldDt); updateSplatGhosts(G, worldDt); }', 'ghost presentation in existing FX cadence');
  }
  code = adaptIssue483(rel, code);
  code = adaptPaintMipmaps(rel, code);
  code = patchLobbySetShowcase(rel, code);
  code = adaptSlosherEmergeGate(rel, code);
  // Issue #580 runs before the final HUD-authority pass so shared HUD anchors
  // are composed once on the finished presentation layer.
  code = adaptFinishTape(rel, code);
  code = adaptHudAuthority(rel, code);
  if (rel === 'src/core/mobile.js') {
    code = adaptFirstTouch(rel, code);
    code = adaptTouchRelayout(rel, code);
  }
  code = adaptPlatformSource(rel, code);
  if (rel === 'src/game/cameraRig.js') {
    code = replaceOnce(code,
      "    if (this.mode !== this._prevMode || (this.mode === 'follow' && this.target !== this._prevTarget)) {\n",
      "    if (this.mode !== this._prevMode || (this.mode === 'follow' && this.target !== this._prevTarget)) {\n" +
      "      this._inkwaveCameraProbeCache = null;\n",
      'camera probe mode/target invalidation');
    code = replaceOnce(code,
      '    G.physics.cameraProbe(this.pivot, _back, this.wantDist, 0.62, _probe);',
      '    // #862: Physics.cameraProbe only queries the current level broadphase. Reuse its exact\n' +
      '    // result while the follow probe is effectively stationary (1 mm pivot/want-distance\n' +
      '    // tolerance and 0.001 unit-vector delta); keep a short bound for\n' +
      '    // geometry edits that preserve the Level/collection objects.\n' +
      '    const _qcPhysics = G.physics, _qcLevel = _qcPhysics.level;\n' +
      '    const _qcOld = this._inkwaveCameraProbeCache;\n' +
      '    const _qcAge = _qcOld ? _qcOld.age + (Number.isFinite(dt) ? Math.max(0, dt) : 0) : 0;\n' +
      '    const _qcPX = _qcOld ? this.pivot.x - _qcOld.px : Infinity;\n' +
      '    const _qcPY = _qcOld ? this.pivot.y - _qcOld.py : Infinity;\n' +
      '    const _qcPZ = _qcOld ? this.pivot.z - _qcOld.pz : Infinity;\n' +
      '    const _qcBX = _qcOld ? _back.x - _qcOld.bx : Infinity;\n' +
      '    const _qcBY = _qcOld ? _back.y - _qcOld.by : Infinity;\n' +
      '    const _qcBZ = _qcOld ? _back.z - _qcOld.bz : Infinity;\n' +
      '    const _qcChanged = !_qcOld || _qcOld.target !== a || _qcOld.mode !== this.mode ||\n' +
      '      _qcOld.level !== G.level || _qcOld.physics !== _qcPhysics ||\n' +
      '      _qcOld.probe !== _qcPhysics.cameraProbe || _qcOld.raycast !== _qcPhysics.raycast ||\n' +
      '      _qcOld.collisionLevel !== _qcLevel || _qcOld.blocks !== _qcLevel?.blocks ||\n' +
      '      _qcOld.hash !== _qcLevel?.hash || _qcOld.blockStamp !== _qcLevel?.blockStamp ||\n' +
      '      _qcPX * _qcPX + _qcPY * _qcPY + _qcPZ * _qcPZ > 0.000001 ||\n' +
      '      _qcBX * _qcBX + _qcBY * _qcBY + _qcBZ * _qcBZ > 0.000001 ||\n' +
      '      Math.abs(this.wantDist - _qcOld.want) > 0.001 ||\n' +
      '      (this.wantDist !== _qcOld.want &&\n' +
      '       (_qcOld.hard !== _qcOld.want || _qcOld.soft !== _qcOld.want));\n' +
      '    if (_qcChanged || _qcAge >= 0.25) {\n' +
      '      _qcPhysics.cameraProbe(this.pivot, _back, this.wantDist, 0.62, _probe);\n' +
      '      this._inkwaveCameraProbeCache = { target: a, mode: this.mode, level: G.level,\n' +
      '        physics: _qcPhysics, probe: _qcPhysics.cameraProbe, raycast: _qcPhysics.raycast,\n' +
      '        collisionLevel: _qcLevel, blocks: _qcLevel?.blocks, hash: _qcLevel?.hash,\n' +
      '        blockStamp: _qcLevel?.blockStamp, px: this.pivot.x, py: this.pivot.y, pz: this.pivot.z,\n' +
      '        bx: _back.x, by: _back.y, bz: _back.z, want: this.wantDist,\n' +
      '        hard: _probe.hard, soft: _probe.soft, floor: _probe.floor, age: 0 };\n' +
      '    } else {\n' +
      '      _qcOld.age = _qcAge;\n' +
      '      // A free probe is equal to its sampled request distance. Keep that\n' +
      '      // endpoint live when a sub-millimetre zoom step reuses the cache.\n' +
      '      _probe.hard = _qcOld.hard === _qcOld.want ? this.wantDist : _qcOld.hard;\n' +
      '      _probe.soft = _qcOld.soft === _qcOld.want ? this.wantDist : _qcOld.soft;\n' +
      '      _probe.floor = _qcOld.floor;\n' +
      '    }',
      'stationary follow-camera collision probe cache');
  }
  if (rel === 'src/core/mobile.js') return code;
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code,
      "    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(this._refit).observe(this.el);",
      "    if (typeof ResizeObserver !== 'undefined') { this._qualityFitObserver = new ResizeObserver(this._refit); this._qualityFitObserver.observe(this.el); }",
      'menu fit observer owner');
    code = replaceOnce(code,
      '    this._refit = () => { if (!this._fitQ)',
      '    this._refit = () => { if (!this._qualityDisposed && !this._fitQ)',
      'retired menu fit guard');
    code = replaceOnce(code,
      '  dispose() {\n    cancelAnimationFrame(this._raf);\n    this.wipe.cancel();\n    this.el.remove();\n  }',
      '  dispose() {\n' +
      '    this._qualityDisposed = true;\n' +
      '    cancelAnimationFrame(this._raf); cancelAnimationFrame(this._fitQ); this._fitQ = 0;\n' +
      '    this._qualityFitObserver?.disconnect(); this._qualityFitObserver = null;\n' +
      "    window.removeEventListener('resize', this._refit);\n" +
      "    document.fonts?.removeEventListener?.('loadingdone', this._refit);\n" +
      '    safeCall(() => this._scr?.destroy?.()); this._scr = null; this._cur.targetEl = null;\n' +
      '    this.wipe.cancel();\n    this.el.remove();\n  }',
      'menu fit lifetime');
    // Keep the logical target current even when touch uses the row's own tint
    // or the screen entrance temporarily hides the floating ring.
    code = replaceOnce(code,
      '    if (!want) {\n      if (C.on)',
      '    if (!want) {\n' +
      '      if (f && f.isConnected && C.targetEl !== f) {\n' +
      '        const r = f.getBoundingClientRect(), pad = f.dataset.curPad != null ? +f.dataset.curPad : 7;\n' +
      '        C.targetEl = f;\n' +
      '        C.x.target = r.left - pad; C.y.target = r.top - pad;\n' +
      '        C.w.target = r.width + pad * 2; C.h.target = r.height + pad * 2;\n' +
      '      }\n      if (C.on)',
      'hidden cursor logical target');
    code = replaceOnce(code,
      '    C.x.target = tx; C.y.target = ty; C.w.target = tw; C.h.target = th;',
      '    C.targetEl = f;\n    C.x.target = tx; C.y.target = ty; C.w.target = tw; C.h.target = th;',
      'cursor target owner');
    return adaptResultContinuation(rel, code, replaceOnce);
  }
  if (rel === 'src/ui/menu-art.js') {
    code = replaceOnce(code,
      'export function createPreview(key, ctx = {}) {',
      'function createNativePreview(key, ctx = {}) {',
      'preview factory');
    return "import { guardPreview } from '../../patches/local-quality/menu-preview.mjs';\n" + code +
      '\nexport function createPreview(key, ctx = {}) { return guardPreview(createNativePreview(key, ctx)); }\n';
  }

  if (rel === 'patches/splatoon3/runtime/walk.mjs') {
    code = replaceOnce(code,
      'oldTrack.call(this,dt,s);if(this.tread){w.vx=this.tvx;w.vz=this.tvz;}',
      'oldTrack.call(this,dt,s);if(this.tread){w.vx=this.tvx;w.vz=this.tvz;}\n' +
      '    // Scalar travel speed cannot cancel when direction reverses. One owner, no second gait update.\n' +
      '    w.scalarSpeed=w.rootMotionKnown?damp(w.scalarSpeed??0,Math.hypot(w.vx,w.vz),18,dt):0;',
      'gait scalar speed');
    return replaceOnce(code,
      'const v=this.gv,rw=smooth(tuning.runStart,tuning.runFull,v);',
      'const v=state(this).scalarSpeed??this.gv,rw=smooth(tuning.runStart,tuning.runFull,v);',
      'gait cadence source');
  }

  if (rel === 'src/world/inkShading.js') {
    return replaceOnce(code,
      '    vec3 team = mix(uTeamA, uTeamB, tm);',
      '    // Convert per-texel derivatives to the slope of a 4mm world-space film.\n' +
      '    gInkD *= uPpm * 0.004 / 1.9;\n    vec3 team = mix(uTeamA, uTeamB, tm);',
      'ink derivative units');
  }

  if (rel === 'src/world/levelMaterial.js') {
    code = replaceOnce(code,
      '    uSeeOn: { value: 0 },',
      '    uSeeOn: { value: 0 },\n    uSeeSupport: { value: new THREE.Vector4(0, 0, 0, 0) },',
      'support plane uniform');
    code = replaceOnce(code,
      '    const rt = renderer.getRenderTarget();',
      '    const n = loc?.grounded ? loc.groundN : null;\n' +
      '    if (n && Number.isFinite(n.x + n.y + n.z)) uniforms.uSeeSupport.value.set(n.x, n.y, n.z, n.dot(loc.pos));\n' +
      '    else uniforms.uSeeSupport.value.set(0, 0, 0, 0);\n' +
      '    const rt = renderer.getRenderTarget();',
      'support plane sample');
    code = replaceOnce(code,
      'uniform float uSeeFeet;',
      'uniform float uSeeFeet;\nuniform vec4 uSeeSupport;',
      'support GLSL declaration');
    code = replaceOnce(code,
      '      k *= smoothstep(dB - 0.2, dB - 0.75, dP);',
      '      k *= 1.0 - smoothstep(dB - 0.75, dB - 0.2, dP);',
      'defined depth smoothstep');
    code = replaceOnce(code,
      '      if (vWNorm.y > 0.6 && vWPos.y < feetTop) k = 0.0;',
      '      if (vWNorm.y > 0.6 && vWPos.y < feetTop) k = 0.0;\n' +
      '      // A supporting ramp is not a camera obstruction, even uphill of the feet.\n' +
      '      if (uSeeSupport.y > 0.6 && dot(vWNorm, uSeeSupport.xyz) > 0.995\n' +
      '          && abs(dot(vWPos, uSeeSupport.xyz) - uSeeSupport.w) < 0.03) k = 0.0;',
      'support ramp dithering');
    code = replaceOnce(code,
      'smoothstep(1.0, 0.8, a)',
      '(1.0 - smoothstep(0.8, 1.0, a))',
      'defined coverage smoothstep');
    return replaceOnce(code,
      'inkwave-level-v6',
      'inkwave-level-v6-quality1',
      'material program identity');
  }

  if (rel === 'src/fx/fxHooks.js') {
    code = replaceOnce(code,
      'this.fx.flickCurtain?.(_v, _dir, a.color, a.weapon?.flickSpreadDeg || 50);',
      'this.fx.flickCurtain?.(_v, _dir, a.color, a.weapon?.flickSpreadDeg || 50, rollerCurtainSources(this.G, a, this.fx));',
      'roller visual selection');
    return "import { rollerCurtainSources } from '../../patches/local-quality/roller-visual.mjs';\n" + code;
  }

  if (rel === 'src/fx/fx.js') {
    code = replaceOnce(code,
      '  flickCurtain(pos, dir, color, spreadDeg = 50) {',
      '  flickCurtain(pos, dir, color, spreadDeg = 50, sources = null) {',
      'roller curtain context');
    const before = '      this._spawnDrop(pos.x + Math.sin(a) * 0.4, pos.y + (rand() - 0.3) * 0.4, pos.z + Math.cos(a) * 0.4, Math.sin(a) * cu * sp, Math.sin(up) * sp, Math.cos(a) * cu * sp, col, sz, 1.4, 1, 1.2, sz > 0.055 ? paint : 0);';
    code = replaceOnce(code, before,
      before.replace('this._spawnDrop', 'const drop = this._spawnDrop') +
      '\n      if (sources?.length) bindRollerDrop(this, drop, sources[i % sources.length]);',
      'non-scoring spray follows real projectile');
    code = replaceOnce(code,
      '      const a = yaw + (i - 1) * spread * 0.35;',
      '      const a = yaw + (i - 1) * (sources?.length ? 0 : spread) * 0.35;',
      'vertical centre puff axis');
    const puff = 'Math.sin(a) * 3, 1.0, Math.cos(a) * 3, this._colB, 0.2, 0.7, 0.4, 0.3, 4);';
    code = replaceOnce(code, puff,
      'Math.sin(a) * 3, 1.0, Math.cos(a) * 3, this._colB, sources?.length ? 0.12 : 0.2, sources?.length ? 0.3 : 0.7, sources?.length ? 0.16 : 0.4, 0.3, 4);',
      'vertical puff silhouette');
    code = replaceOnce(code,
      '    const i3 = i * 3, i8 = i * 8;\n    this.dP[i3] = px;',
      '    if (this._qualityDropSource) this._qualityDropSource[i] = null;\n' +
      '    const i3 = i * 3, i8 = i * 8;\n    this.dP[i3] = px;',
      'drop recycle link reset');
    code = replaceOnce(code,
      '    const last = --this.dN;',
      '    const last = --this.dN;\n' +
      '    if (this._qualityDropSource) {\n' +
      '      this._qualityDropSource[i] = this._qualityDropSource[last];\n' +
      '      this._qualityDropGeneration[i] = this._qualityDropGeneration[last];\n' +
      '      this._qualityDropSource[last] = null;\n' +
      '    }',
      'drop compaction links');
    code = replaceOnce(code,
      '      const vx = Vv[i3], vy = Vv[i3 + 1], vz = Vv[i3 + 2];',
      '      const source = this._qualityDropSource?.[i];\n' +
      '      const linked = source && !source._qualityDead && source._qualityGeneration === this._qualityDropGeneration[i];\n' +
      '      const vx = linked ? source.vel.x : Vv[i3], vy = linked ? source.vel.y : Vv[i3 + 1], vz = linked ? source.vel.z : Vv[i3 + 2];',
      'roller render velocity');
    const positionLine = '      aP[i4] = P[i3]; aP[i4 + 1] = P[i3 + 1]; aP[i4 + 2] = P[i3 + 2]; aP[i4 + 3] = size * grow * fade;';
    code = replaceOnce(code, positionLine,
      '      if (linked) {\n' +
      '        const fraction = .25 + .75 * A[i8 + 5];\n' +
      '        aP[i4] = source.prev.x + (source.pos.x - source.prev.x) * fraction;\n' +
      '        aP[i4 + 1] = source.prev.y + (source.pos.y - source.prev.y) * fraction;\n' +
      '        aP[i4 + 2] = source.prev.z + (source.pos.z - source.prev.z) * fraction;\n' +
      '      } else { aP[i4] = P[i3]; aP[i4 + 1] = P[i3 + 1]; aP[i4 + 2] = P[i3 + 2]; }\n' +
      '      aP[i4 + 3] = source && !linked ? 0 : size * grow * fade;',
      'roller render position');
    code = replaceOnce(code,
      '    this.dN = 0; this.dGeo.instanceCount = 0;',
      '    this._qualityDropSource?.fill(null);\n' +
      '    if (this._qualityCurtainSources) this._qualityCurtainSources.length = 0;\n' +
      '    this.dN = 0; this.dGeo.instanceCount = 0;',
      'drop stage reset');
    return "import { bindRollerDrop } from '../../patches/local-quality/roller-visual.mjs';\n" + code;
  }

  // #678: the DeviceMotion/DeviceOrientation axis conversion was a *player-space* construction, not the
  // Splatoon 3 World Orientation mapping. Three separate defects lived in one block:
  //   1. the yaw projection dropped the screen-x gravity term gx*px, so real world yaw vanished in
  //      every rolled/landscape pose and pure roll was reported as yaw;
  //   2. the result was then scaled by a player-space 1.41 magnitude relax and capped against the
  //      local hypot(py, pz), so angular velocity ORTHOGONAL to world vertical still became camera yaw;
  //   3. pitch = px unconditionally, so pitch ignored gravity entirely and never reduced at bank.
  // The whole block becomes one world-orientation projection. The gx*px term is retained because it
  // falls out of the correct complete projection, not as a cherry-picked partial; the 1.41 relax and
  // the local magnitude cap are removed because they are precisely the player-space construction the
  // Issue rejects. Sensitivity (sens / gyroTurnDeg / _gain), inversion, every smoothing and filter
  // coefficient, _calibrate/_rrScale and the resync/dropout lifecycle below are untouched, and
  // inkwave-public/ is never edited.
  if (rel === 'src/core/gyro.js') {
    code = replaceOnce(code,
      "import { screenAngle } from './device.js';",
      "import { screenAngle as deviceScreenAngle } from './device.js';\n" +
      "import { sensorScreenAngle } from '../../patches/local-quality/screen-angle.mjs';\n" +
      'const screenAngle = () => sensorScreenAngle(globalThis, deviceScreenAngle);',
      'gyro sensor-frame screen angle');
    code = replaceOnce(code, `    const d = this._down;
    const gy = d[0] * s + d[1] * c, gz = d[2];
    const gl = Math.hypot(d[0] * c - d[1] * s, gy, gz) || 1;
    // player-space yaw: the part of the turn around real vertical, allowed to borrow from roll (±45° relax)
    const worldYaw = -(gy * py + gz * pz) / gl;
    const yawAxes = Math.hypot(py, pz);
    let yaw = Math.sign(worldYaw) * Math.min(Math.abs(worldYaw) * 1.41, yawAxes);
    let pitch = px;`, `    const d = this._down;
    const gx = d[0] * c - d[1] * s, gy = d[0] * s + d[1] * c, gz = d[2];
    const gl = Math.hypot(gx, gy, gz) || 1;
    const ux = gx / gl, uy = gy / gl, uz = gz / gl;              // unit earth-down, in screen space
    // World Orientation: one projection of the whole screen-space omega. yaw is the turn about real
    // vertical and nothing else - no player-space 1.41 magnitude borrow, no hypot(py, pz) cap, so
    // angular velocity orthogonal to gravity can no longer become camera yaw.
    let yaw = -(px * ux + py * uy + pz * uz);
    // pitch: the device pitch axis (screen-right) with its gravity component removed, i.e. the
    // world-horizontal direction nearest it. Exactly px while gravity is perpendicular to screen-right
    // (flat / upright portrait); reduced and mixed as the device banks.
    const hx = 1 - ux * ux, hy = -ux * uy, hz = -ux * uz;       // = e_x - (e_x . u) u
    const hl = Math.hypot(hx, hy, hz);
    let pitch;
    if (hl > 1e-6) pitch = (px * hx + py * hy + pz * hz) / hl;
    else {
      // Gravity lies along screen-right: the screen plane is vertical, so the device pitch axis has no
      // world-horizontal part and gravity alone cannot define the camera pitch axis. Deterministic
      // documented fallback: screen-up with gravity removed. Splatoon 3 does not publish its behaviour
      // in this band, so it stays explicitly UNQUANTIFIED and is not a Nintendo constant.
      const ex = -uy * ux, ey = 1 - uy * uy, ez = -uy * uz;
      pitch = (px * ex + py * ey + pz * ez) / (Math.hypot(ex, ey, ez) || 1);
    }`, 'gyro world-orientation axis mapping');
  }

  if (rel === 'src/core/gyro.js') {
    return "import { installGyroQuality } from '../../patches/local-quality/gyro.mjs';\n" + code +
      '\ninstallGyroQuality(Gyro, screenAngle);\n';
  }

  // #363/#367: Splatoon 3 holds the lens off the player's right even when the boom is
  // clear. The shipped term only reached that while the boom was forced short, because
  // closeK hits 0 at curDist >= 2.8, so normal follow stayed vertically centred behind the
  // crosshair. SH0 adds a persistent baseline and keeps the obstruction-driven shift at its
  // full current range at closeK = 1.
  // SH0 is deliberately modest and explicitly unquantified: Splatoon 3 publishes no shoulder
  // offset and none is pinned in this repository, so this is NOT a claimed Nintendo constant.
  // The shift stays a parallel lens+target offset, so the aim direction is unchanged; the
  // right-side wall probe, muzzle-to-target parallax, obstacle avoidance, input axes and the
  // Charger zoom profile are all untouched.
  if (rel === 'src/game/cameraRig.js') {
    code = replaceOnce(code, `    const closeK = clamp((2.8 - this.curDist) / 1.8, 0, 1);
    let shT = 0.55 * closeK * closeK * (3 - 2 * closeK);
    if (shT > 0.01 && G.physics) {
      const hr = G.physics.raycast(cam.position, _right, shT + 0.25, _hit, true);
      if (hr.hit) shT = Math.max(0, hr.dist - 0.25);
    }
    this.shoulder = damp(this.shoulder || 0, shT, 8, dt);
    if (this.shoulder > 1e-3) cam.position.addScaledVector(_right, this.shoulder);`, `    const closeK = clamp((2.8 - this.curDist) / 1.8, 0, 1);
    const SH0 = 0.28;   // persistent right-shoulder framing; not a pinned S3 value
    let shT = SH0 + (0.55 - SH0) * closeK * closeK * (3 - 2 * closeK);
    // C19-CAMERA-COLLISION-TRANSITION: the wall probe used to be target-only. With SH0 the damped
    // shoulder is normally 0.28, so when a right-side wall then becomes reachable the probe only
    // ever looked as far as the new target and the *applied* (still-damped) value kept rendering the
    // lens inside the 0.25 m clearance for several frames. Probe as far as the lens actually is, and
    // clamp the applied value as well as the target, so the first frame after the transition is safe.
    // The open case is untouched: no hit means no cap, so the damped return to SH0 is unchanged.
    let shMax = Infinity;
    if (shT > 0.01 && G.physics) {
      const hr = G.physics.raycast(cam.position, _right, Math.max(shT, this.shoulder || 0) + 0.25, _hit, true);
      if (hr.hit) { shMax = Math.max(0, hr.dist - 0.25); shT = Math.min(shT, shMax); }
    }
    this.shoulder = damp(this.shoulder || 0, shT, 8, dt);
    if (this.shoulder > shMax) this.shoulder = shMax;
    if (this.shoulder > 1e-3) cam.position.addScaledVector(_right, this.shoulder);`, 'camera persistent shoulder framing and wall-transition clearance');
  }

  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, '    ch.update(dt, a);',
      '    a.remote = this.remote === true;\n    ch.update(dt, a);',
      'carry actor authority into Character presentation budget');
  }

  return code;
}

export function qualityIdentity() {
  return Object.fromEntries(IDENTITY_FILES.map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(new URL(file, import.meta.url))).digest('hex')]));
}
