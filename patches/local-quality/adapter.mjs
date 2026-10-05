import { adaptFxActorLifetime } from './fx-actor-lifetime-adapter.mjs';
import { adaptHudSnapshots } from './hud-snapshots-adapter.mjs';
import { adaptTenacity } from './tenacity-adapter.mjs';
import { adaptResultContinuation } from './result-continuation-adapter.mjs';
import { adaptShowcaseShadow } from './showcase-shadow-adapter.mjs';
import { adaptTeamWipeout } from './team-wipeout-adapter.mjs';

import { adaptSplatlingReticle } from './splatling-reticle-adapter.mjs';

import { adaptPortraitGuard } from './portrait-guard-adapter.mjs';
// Build-only quality corrections composed after the gameplay, touch-layout and
// reliability adapters. Upstream inkwave-public/ remains byte-for-byte intact.
import fs from 'node:fs';
import { adaptHudAuthority } from './hud-authority-adapter.mjs';
import { adaptIdleSource } from './idle-adapter.mjs';
import { adaptPlatformSource } from './platform-adapter.mjs';
import { adaptLandingRigidity } from './landing-rigidity-adapter.mjs';
import { adaptFirstTouch } from './first-touch-adapter.mjs';
import { adaptTouchRelayout } from './touch-relayout.mjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptMinimapResources } from './minimap-resource-adapter.mjs';
import { adaptLobbyResources } from './lobby-resource-adapter.mjs';

export const QUALITY_ROOT = fileURLToPath(new URL('./', import.meta.url));
const IDENTITY_FILES = [
  'fx-actor-lifetime-adapter.mjs',
  'hud-snapshots-adapter.mjs', 'hud-snapshots.mjs',
  'hud-authority-adapter.mjs',
  'tenacity-adapter.mjs', 'tenacity.mjs',
  'result-continuation-adapter.mjs', 'result-continuation.mjs',
  'showcase-shadow.mjs', 'showcase-shadow-adapter.mjs',
  'team-wipeout.mjs', 'team-wipeout-adapter.mjs',

  'splatling-reticle.mjs', 'splatling-reticle-adapter.mjs',

  'portrait-guard.mjs', 'portrait-guard-adapter.mjs',
  'idle-adapter.mjs', 'idle-resources.mjs', 'music-idle.mjs',
  'lobby-resource-adapter.mjs', 'minimap-resource-adapter.mjs',
  'adapter.mjs', 'gyro.mjs', 'install.mjs', 'menu-preview.mjs', 'menu.mjs',
  'roller-motion.mjs', 'roller-visual.mjs', 'surface.mjs', 'landing-rigidity-adapter.mjs', 'first-touch-adapter.mjs', 'touch-relayout.mjs',
  'platform-adapter.mjs', 'platform-lifecycle.mjs', 'platform-game.mjs',
  'platform-input.mjs', 'platform-audio.mjs', 'platform-transport.mjs',
  'mobile-platform.mjs', 'gyro-permission.mjs', 'gyro-startup.mjs',
];

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE quality patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptQualitySource(rel, code) {
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
  code = adaptIdleSource(rel, code, replaceOnce);
  code = adaptLobbyResources(rel, code);
  code = adaptMinimapResources(rel, code);
  code = adaptLandingRigidity(rel, code);
  code = adaptHudAuthority(rel, code);
  if (rel === 'src/core/mobile.js') {
    code = adaptFirstTouch(rel, code);
    code = adaptTouchRelayout(rel, code);
  }
  code = adaptPlatformSource(rel, code);
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

  if (rel === 'src/core/gyro.js') {
    return "import { installGyroQuality } from '../../patches/local-quality/gyro.mjs';\n" + code +
      '\ninstallGyroQuality(Gyro, screenAngle);\n';
  }

  return code;
}

export function qualityIdentity() {
  return Object.fromEntries(IDENTITY_FILES.map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(new URL(file, import.meta.url))).digest('hex')]));
}
