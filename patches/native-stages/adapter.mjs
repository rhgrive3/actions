import {adaptNativeRuleAvailability} from './rule-availability-adapter.mjs';
export function adaptNativeStages(rel,code){
 const once=(a,b)=>{if(code.split(a).length!==2)throw Error('Native stage adapter conflict: '+rel+' / '+a.slice(0,70));code=code.replace(a,b);};
 if(rel==='src/game/inkCollision.js'){
  code="import { sweepNativeLevelSphere } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  const signature='export function sweepLevelSphere(level, from, to, radius, out, skipGrates = true) {';
  once(signature,signature+'\n  if (level.native) return sweepNativeLevelSphere(level, from, to, radius, out, skipGrates, sweepLevelSphere);');
 }
 if(rel==='src/config.js'){
  code="import { nativeStageEnabled, NATIVE_MAPS } from '../patches/native-stages/runtime/registry.mjs';\n"+code;
  once('export const OFFLINE_MAPS =',"if (nativeStageEnabled) { for (const m of NATIVE_MAPS) { const i = MAPS.findIndex(x => x.id === m.id); if (i >= 0) MAPS[i] = m; else MAPS.push(m); } }\nexport const OFFLINE_MAPS =");
 }
 if(rel==='src/world/maps.js')code="import { nativeStageEnabled, NATIVE_LAYOUTS } from '../../patches/native-stages/runtime/registry.mjs';\n"+code+"\nif (nativeStageEnabled) Object.assign(MAP_LAYOUTS, NATIVE_LAYOUTS);\n";
 if(rel==='styles/ui.css')code+='\n/* Long stage lists stay inside their column and scroll above match settings. */\n.iw-ss__list{overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scroll-padding-block:calc(var(--u)*.8);padding-left:calc(var(--u)*.9);margin-left:calc(var(--u)*-.9);}\n.iw-native-unavailable{display:flex;flex-direction:column;gap:.35em;flex-shrink:0;padding:1em;text-align:left;color:var(--text,#fff);background:rgba(20,23,35,.8);border:1px solid rgba(255,255,255,.25);border-radius:.5em;cursor:not-allowed;opacity:.7;font:inherit}.iw-native-unavailable strong{font-size:1.05em}.iw-native-unavailable small{line-height:1.5;white-space:normal}\n';
 if(rel==='src/ui/menus.js'){
  code="import { UNAVAILABLE_NATIVE_STAGES } from '../../patches/native-stages/runtime/registry.mjs';\nimport { nativeStageArt } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('const stageArt = (id, time, small) => `${STAGE_DIR}', 'const stageArt = (id, time, small) => nativeStageArt(id, time) || `${STAGE_DIR}');
  once("const sc = next.closest('.iw-rows, .iw-lob__roster');", "const sc = next.closest('.iw-rows, .iw-lob__roster, .iw-ss__list');");
  once("const sc = f.closest('.iw-rows');", "const sc = f.closest('.iw-rows, .iw-ss__list');");
  once("    const listEl = h('div', { class: 'iw-ss__list' }, tickets);", `    const unavailableTickets = UNAVAILABLE_NATIVE_STAGES.map(stage => h('button', {
      class: 'iw-native-unavailable', type: 'button', disabled: true, 'aria-disabled': 'true',
      'data-native-stage': stage.id, 'aria-describedby': 'native-unavailable-' + stage.id,
    }, h('strong', null, stage.name + ' · 準備中'), h('small', { id: 'native-unavailable-' + stage.id }, stage.reason)));
    const listEl = h('div', { class: 'iw-ss__list' }, tickets, unavailableTickets);`);
  once('  _startMatch() {', `  _startMatch() {
    const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === this._setup?.mapId);
    if (unavailable) { this.toast(unavailable.name + '：' + unavailable.reason); return; }`);
 }
 if(rel==='src/main.js'){
  code="import { nativeStageEnabled, NATIVE_IDS, UNAVAILABLE_NATIVE_STAGES } from '../patches/native-stages/runtime/registry.mjs';\nimport { buildNativeWorld, releaseNativeWorld, nativeSpawnYaw, nativeArenaBasis } from '../patches/native-stages/runtime/engine.mjs';\n"+code;
  const unavailableGuard = `
    const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === (o.mapId || this.mapDef?.id));
    if (unavailable) { this.menus?.toast?.(unavailable.name + '：' + unavailable.reason); return false; }`;
  once('  async _startMenuMatch(o = {}) {', '  async _startMenuMatch(o = {}) {' + unavailableGuard);
  once('  async startMatch(o = {}, flow = this._beginMatchFlow()) {', '  async startMatch(o = {}, flow = null) {' + unavailableGuard + '\n    flow ||= this._beginMatchFlow();');
  once('  async startNetMatch(cfg, nm) {', `  async startNetMatch(cfg, nm) {
    const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === cfg.map);
    if (unavailable) throw new RangeError(unavailable.name + '：' + unavailable.reason);`);
  once('  async _buildWorld(map, flow = null) {', `  async _buildWorld(map, flow = null) {
    const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === map.id || stage.id === map.layout);
    if (unavailable) throw new RangeError(unavailable.name + '：' + unavailable.reason);`);
  once("    this.menus?.show(params.has('skipTitle') ? 'main' : 'title');", `    const unavailableRequestedStage = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === pm);
    this.menus?.show(unavailableRequestedStage ? 'setup' : params.has('skipTitle') ? 'main' : 'title');
    if (unavailableRequestedStage) this.menus?.toast?.(unavailableRequestedStage.name + '：' + unavailableRequestedStage.reason);`);
  once("if (params.has('autostart')) this.api.startMatch({ mapId: map.id,", "if (params.has('autostart')) this.api.startMatch({ mapId: unavailableRequestedStage ? pm : map.id,");
  once('this.rig.yaw = m.local.team === 0 ? 0 : Math.PI;', 'this.rig.yaw = nativeSpawnYaw(G.level, m.local.team, m.local.team === 0 ? 0 : Math.PI);');
  once('this.rig.yaw = team === 0 ? 0 : Math.PI;', 'this.rig.yaw = nativeSpawnYaw(G.level, team, team === 0 ? 0 : Math.PI);');
  once('    this.rig.cinematic(from, to, lookFrom, lookTo, 3.6, () => {});', `    const nativeBasis = nativeArenaBasis(L);
    if (nativeBasis) {
      const fx=nativeBasis.forward.x*sgn, fz=nativeBasis.forward.z*sgn;
      to.set(pad.x-fx*(I?.toBack??5.2),pad.y+2.6,pad.z-fz*(I?.toBack??5.2));
      lookTo.set(pad.x+fx*6,pad.y+1.6,pad.z+fz*6);
    }
    this.rig.cinematic(from, to, lookFrom, lookTo, 3.6, () => {});`);
  once('if (this._builtQuality !== this.settings?.quality) applyRuntimeWorldQuality(this, this.settings, this.mobile, { G, effectiveQuality, dressingFor, THREE });', 'if (this._builtQuality !== this.settings?.quality) await applyRuntimeWorldQuality(this, this.settings, this.mobile, { G, effectiveQuality, dressingFor, THREE });');
  once('    this._builtQuality = this.settings?.quality;',`    if (nativeStageEnabled && NATIVE_IDS.includes(layoutId)) {
      await buildNativeWorld(this, map, worldCurrent); return;
    }
    this._nativeAbort?.abort();
    this._builtQuality = this.settings?.quality;`);
  once('    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh);', '    releaseNativeWorld(this);\n    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh);');
  once('    if ((map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality) await this._buildWorld(map, flow);\n    if (!flow.current()) return;\n    const theme = mapTheme(map, opts.time);',`    if ((map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality) {
      try { await this._buildWorld(map, flow); }
      catch (error) {
        if (!map.nativeSource) throw error;
        if (!flow.current()) return;
        this.input.exitLock();this._startAttract();G.mode='menu';this.menus?.show('setup');
        this.menus?.toast?.('ステージを読み込めませんでした。接続を確認して再試行してください。');
        await this._fade(0,200);return;
      }
    }
    if (!flow.current()) return;
    const theme = mapTheme(map, opts.time);`);
 }
 if(rel==='src/net/session.js'){
  code="import { nativeStageFingerprint, nativeStageCompatible, UNAVAILABLE_NATIVE_STAGES } from '../../patches/native-stages/runtime/registry.mjs';\n"+code;
  once('  startBlock() {', `  startBlock() {
    const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === this.lobby?.map);
    if (unavailable) return unavailable.name + '：' + unavailable.reason;`);
  once('    this.tr.broadcast(cfg);', '    const stageFingerprint = nativeStageFingerprint(l.map); if (stageFingerprint) cfg.nativeStage = stageFingerprint;\n    this.tr.broadcast(cfg);');
  once('  async _begin(cfg) {', `  async _begin(cfg) {
    const unavailable = UNAVAILABLE_NATIVE_STAGES.find(stage => stage.id === cfg.map);
    if (unavailable) { this._fail(new Error(unavailable.name + '：' + unavailable.reason)); return; }
    if (!nativeStageCompatible(cfg)) { this._fail(new Error('Stage assets differ between players. Use the same reference build.')); return; }`);
 }
 if(rel==='src/world/paint.js'){
  code="import { initNativeGrid, layoutNativePaint } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('  _layout(maxDensity) {','  _layout(maxDensity) {\n    if (this.level.native) return layoutNativePaint(this, maxDensity);');
  once('    const shouldRebuild = this._mipsDirty &&', '    const shouldRebuild = !this.level.native && this._mipsDirty &&');
  once('  _initGrid() {','  _initGrid() {\n    if (this.level.native) return initNativeGrid(this);');
  once('        let px = (i + 0.5) * f.cu - lu, py = (j + 0.5) * f.cv - lv;', '        if (this.level.native && this.dead[f.grid + j * f.nu + i]) continue;\n        let px = (i + 0.5) * f.cu - lu, py = (j + 0.5) * f.cv - lv;');
  once('        const prev = this.grid[k];','        if (this.level.native && this.dead[k]) continue;\n        const prev = this.grid[k];');
  once('    return this.grid[f.grid + j * f.nu + i];',`    const k = f.grid + j * f.nu + i;
    if (this.level.native && (u < 0 || v < 0 || u > f.su || v > f.sv || this.dead[k])) return 0;
    return this.grid[k];`);
 }
 if(rel==='src/game/bots.js'){
  code="import { nativePaintGoalIds,updateNativeJumpAttach,updateNativeClimb,nativeClimbTravelForm,nativeDropTravelForm,updateNativeDrop,updateNativeSurge,nativeSourceWaypointReached,nativeSourceTravelInput } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('    this.think -= dt; this.jumpCd -= dt;', '    if (updateNativeJumpAttach(this,G,dt)||updateNativeSurge(this,G,dt)||updateNativeDrop(this,G,dt)||updateNativeClimb(this,G,dt)) { this._nativeTraversalHandled=true; return; }\n    this.think -= dt; this.jumpCd -= dt;');
  once('    const p = nav.path(s, g, this.a.team);', '    const p = nav.path(s, g, this.a.team, (G.level.manifest?.sourceNavigation?.wallClimb || G.level.manifest?.sourceNavigation?.highDrops || G.level.manifest?.sourceNavigation?.wallSurge) ? Math.max(6000, nav.nodes.length * 4) : undefined);');
  once('this.pi + 7', 'this.pi + (G.level.manifest?.sourceNavigation?.wallClimb || G.level.manifest?.sourceNavigation?.highDrops || G.level.manifest?.sourceNavigation?.wallSurge ? 1 : 7)');
  once("nav.edgeType(this.path[Math.max(0, this.pi - 1)], this.path[this.pi]) !== 'jump'", "(nav.edgeType(this.path[Math.max(0, this.pi - 1)], this.path[this.pi]) !== 'jump' && (!(G.level.manifest?.sourceNavigation?.wallClimb || G.level.manifest?.sourceNavigation?.wallSurge) || nav.edgeType(this.path[Math.max(0, this.pi - 1)], this.path[this.pi]) !== 'climb'))");
  once('  _tail(dt, move, wantYaw, wantPitch, aimDist, wantMove) {', '  _tail(dt, move, wantYaw, wantPitch, aimDist, wantMove) {\n    nativeClimbTravelForm(this,G);\n    nativeDropTravelForm(this,G);');
  once('dx * dx + dz * dz < 0.6 * 0.6 && dy < 0.9 && dy > -1.8', 'dx * dx + dz * dz < 0.6 * 0.6 && dy < 0.9 && dy > -1.8 && nativeSourceWaypointReached(G,a,n)');
  once('this.noProg > 1.5 && this.path', 'this.noProg > 1.5 && !G.level.manifest?.sourceNavigation?.highDrops && this.path');
  once("et === 'jump' && cur.y - a.pos.y > 0.4", "et === 'jump' && cur.y - a.pos.y > (G.level.manifest?.sourceNavigation?.highDrops ? PLAYER.stepUp : 0.4)");
  once('    it.move.set(Math.sin(this.mvYaw) * this.mvMag, 0, Math.cos(this.mvYaw) * this.mvMag);','    it.move.set(Math.sin(this.mvYaw) * this.mvMag, 0, Math.cos(this.mvYaw) * this.mvMag);\n    nativeSourceTravelInput(this,G);');

  once('    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot);', '    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot);\n    const candidates = G.level.native ? nativePaintGoalIds(this, G) : nav.validIds;');
  once('      const id = nav.validIds[(Math.random() * nav.validIds.length) | 0];', '      if (!candidates.length) break;\n      const id = candidates[(Math.random() * candidates.length) | 0];');
 }
 if(rel==='src/game/actor.js'){
  code="import { nativeSpawnYaw } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('    const yaw = this.team === 0 ? 0 : Math.PI;', '    const yaw = nativeSpawnYaw(G.level, this.team, this.team === 0 ? 0 : Math.PI);');
 }
 if(rel==='src/game/match.js'){
  code="import { nativeSpawnYaw } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  const initial='a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);';
  if(code.split(initial).length!==3)throw Error('Native match initial placement adapter conflict');
  code=code.replaceAll(initial,'a.spawnAt(_v, nativeSpawnYaw(G.level, a.team, a.team === 0 ? 0 : Math.PI));');
 }
 if(rel==='src/game/nav.js'){
  code="import { buildNativeNav } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('  _build() {','  _build() {\n    if (this.level.native) return buildNativeNav(this);');
 }
 if(rel==='src/game/minimap.js'){
  code="import { buildNativeMinimap } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('  _build() {','  _build() {\n    if (this.level.native) return buildNativeMinimap(this);');
 }
 if(rel==='patches/local-quality/world-quality.mjs'){
  code="import { applyNativeQuality } from '../native-stages/runtime/engine.mjs';\n"+code;
  once('  updatePaintQuality(game, q.paintAtlas, G, THREE_LIB);', `  if (G?.level?.native) return applyNativeQuality(game, settings, mob, { G, q, updatePaintQuality, updateEnvironmentShadowQuality, updateFXQuality });
  updatePaintQuality(game, q.paintAtlas, G, THREE_LIB);`);
 }
 if(rel==='patches/splatoon3/runtime/respawn-lifecycle.mjs'){
  code="import { nativeInitialLanding, nativeBotInitialLanding, nativeSpawnYaw } from '../../native-stages/runtime/engine.mjs';\n"+code;
  once('const supportedTarget = (actor, x, z) => {\n    const y = G.level.groundHeight?.(x, z);','const supportedTarget = (actor, x, z, sourceY = null) => {\n    const y = G.level?.native && Number.isFinite(sourceY) ? sourceY : G.level.groundHeight?.(x, z);');
  once('    const target = s.target && supportedTarget(actor, s.target.x, s.target.z);','    const sourceY = G.level?.native && Number.isFinite(s.target?.nativeSourceY) ? s.target.nativeSourceY : null;\n    const target = s.target && supportedTarget(actor,s.target.x,s.target.z,sourceY);\n    if(target&&sourceY!==null)target.nativeSourceY=sourceY;');
  once('(actor.team === 0 ? 0 : Math.PI); dx', 'nativeSpawnYaw(G.level, actor.team, actor.team === 0 ? 0 : Math.PI); dx');
  once('const angle = (actor.team === 0 ? 0 : Math.PI) +', 'const angle = nativeSpawnYaw(G.level, actor.team, actor.team === 0 ? 0 : Math.PI) +');
  once('p = slotPoint(actor), yaw = actor.team === 0 ? 0 : Math.PI;', 'p = slotPoint(actor), yaw = nativeSpawnYaw(G.level, actor.team, actor.team === 0 ? 0 : Math.PI);');
  once('  const initialBotTarget = actor => {', '  const initialBotTarget = actor => {\n    if (G.level?.native) return nativeBotInitialLanding(G,actor,(x,z,y)=>supportedTarget(actor,x,z,y));');
  once('    return slotTarget(actor);', '    return slotTarget(actor) ?? nativeInitialLanding(G, actor, (x,z,y) => supportedTarget(actor,x,z,y));');
  once('      target: ownerReplicated ? null : ((initial && actor.isBot ? initialBotTarget(actor) : null) ?? targetFor(actor) ?? slotTarget(actor)) };','      target: ownerReplicated ? null : (G.level?.native && actor.isBot ? initialBotTarget(actor) : ((initial && actor.isBot ? initialBotTarget(actor) : null) ?? targetFor(actor) ?? slotTarget(actor) ?? nativeInitialLanding(G,actor,(x,z,y)=>supportedTarget(actor,x,z,y)))) };');
  once('          const target = targetFor(this);','          const target = G.level?.native && this.isBot ? initialBotTarget(this) : targetFor(this);');
 }
 if(rel==='patches/splatoon3/runtime/ranked/rainmaker.mjs'){
  code="import { nativeRetreatCoordinate } from '../../../native-stages/runtime/engine.mjs';\n"+code;
  once('const retreat = this._isRetreating(team, pos[2]);', 'const retreat = this._isRetreating(team, nativeRetreatCoordinate(this.config, pos));');
 }
 if(rel==='patches/splatoon3/runtime/paint-ownership.mjs'){
  code="import { nativePieceHasInterior, nativeAncillaryCanClaim } from '../../native-stages/runtime/native-paint.mjs';\n"+code;
  once('  let claimed = 0, changed = false;\n  for (let n = 0; n < E.length; n += 7)', '  let claimed = 0, changed = false;\n  const nativeMasks = paint.level?.native ? new Map() : null;\n  for (let n = 0; n < E.length; n += 7)');
  once('    if (!face?.atlas || dn >= g.R || face.cu <= 0 || face.cv <= 0) continue;', '    if (!face?.atlas || dn >= g.R || face.cu <= 0 || face.cv <= 0 || (nativeMasks && face.nativeEmpty)) continue;');
  once('          const previousOrder = paint._paintOwnershipOrder[index] || 0;', '          if (nativeMasks && paint.dead[index]) { visit[index] = stamp; continue; }\n          const previousOrder = paint._paintOwnershipOrder[index] || 0;');
  once('    const cellArea = face.cu * face.cv;', '    if (nativeMasks && !nativeAncillaryCanClaim(g.R, dn, face.atlas.ppm)) continue;\n    const cellArea = face.cu * face.cv;');
  // Fail closed if a future source changes the SDF constants behind the bound.
  for (const term of ['0.055 + 0.06 * h3','tipR * (1.6 + 1.4 * h2)','0.028 + 0.085 * h3','0.042 + 0.04 * h3','1.2 + 0.35 * p.h2']) if (!code.includes(term)) throw Error('Native ancillary bound needs review: '+term);
  once('    const mask = prepareAncillary(g, face, lu, lv, dn, sdu, sdv, sa, tn, dT, contract);', `    const nativeMaskKey = nativeMasks ? [face.wall, face.atlas.ppm, dn, sdu, sdv, sa].join('/') : null;
    let mask = nativeMasks?.get(nativeMaskKey);
    if (mask === undefined) {
      mask = prepareAncillary(g, face, lu, lv, dn, sdu, sdv, sa, tn, dT, contract);
      if (nativeMasks && mask) {
        mask.pieces = mask.pieces.filter(p => nativePieceHasInterior(mask, p));
        if (!mask.pieces.length) mask = null;
      }
      nativeMasks?.set(nativeMaskKey, mask);
    }`);
  once('function claimPaintCell(paint, index, value, orderId, orderState = null) {', 'function claimPaintCell(paint, index, value, orderId, orderState = null) {\n  if (paint.level?.native && paint.dead[index]) return false;');
 }
 if(rel==='patches/splatoon3/runtime/ranked/stages.mjs'){
  code="import { nativeRankedStage } from '../../../native-stages/runtime/engine.mjs';\n"+code;
  once('  const spec = SPECS[id];','  if (level?.native) return nativeRankedStage(G,G.match?.mode);\n  const spec = SPECS[id];');
 }
 return adaptNativeRuleAvailability(rel,code);
}
