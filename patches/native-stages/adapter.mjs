export function adaptNativeStages(rel,code){
 const once=(a,b)=>{if(code.split(a).length!==2)throw Error('Native stage adapter conflict: '+rel+' / '+a.slice(0,70));code=code.replace(a,b);};
 if(rel==='src/config.js'){
  code="import { nativeStageEnabled, NATIVE_MAPS } from '../patches/native-stages/runtime/registry.mjs';\n"+code;
  once('export const OFFLINE_MAPS =',"if (nativeStageEnabled) { for (const m of NATIVE_MAPS) { const i = MAPS.findIndex(x => x.id === m.id); if (i >= 0) MAPS[i] = m; else MAPS.push(m); } }\nexport const OFFLINE_MAPS =");
 }
 if(rel==='src/world/maps.js')code="import { nativeStageEnabled, NATIVE_LAYOUTS } from '../../patches/native-stages/runtime/registry.mjs';\n"+code+"\nif (nativeStageEnabled) Object.assign(MAP_LAYOUTS, NATIVE_LAYOUTS);\n";
 if(rel==='src/main.js'){
  code="import { nativeStageEnabled, NATIVE_IDS } from '../patches/native-stages/runtime/registry.mjs';\nimport { buildNativeWorld, releaseNativeWorld } from '../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('    if (this.layoutId === layoutId) {', '    if (this.layoutId === layoutId && !(G.level?.native && this._builtQuality !== this.settings?.quality)) {');
  once('    this._builtQuality = this.settings?.quality;',`    if (nativeStageEnabled && NATIVE_IDS.includes(layoutId)) {
      await buildNativeWorld(this, map, worldCurrent); return;
    }
    this._nativeAbort?.abort();
    this._builtQuality = this.settings?.quality;`);
  once('    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh);', '    releaseNativeWorld(this);\n    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh);');
  once('this.levelMesh, this.props?.group, this.decor?.group, G.env?.root','this.levelMesh, this.nativeWorld?.display?.group, this.props?.group, this.decor?.group, G.env?.root');
 }
 if(rel==='src/net/session.js'){
  code="import { nativeStageFingerprint, nativeStageCompatible } from '../../patches/native-stages/runtime/registry.mjs';\n"+code;
  once('    this.tr.broadcast(cfg);', '    const stageFingerprint = nativeStageFingerprint(l.map); if (stageFingerprint) cfg.nativeStage = stageFingerprint;\n    this.tr.broadcast(cfg);');
  once('  async _begin(cfg) {', `  async _begin(cfg) {
    if (!nativeStageCompatible(cfg)) { this._fail(new Error('Stage assets differ between players. Use the same reference build.')); return; }`);
 }
 if(rel==='src/world/paint.js'){
  code="import { initNativeGrid, layoutNativePaint } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('  _layout(maxDensity) {','  _layout(maxDensity) {\n    if (this.level.native) return layoutNativePaint(this, maxDensity);');
  once('  _initGrid() {','  _initGrid() {\n    if (this.level.native) return initNativeGrid(this);');
  once('        const prev = this.grid[k];','        if (this.level.native && this.dead[k]) continue;\n        const prev = this.grid[k];');
  once('    return this.grid[f.grid + j * f.nu + i];',`    const k = f.grid + j * f.nu + i;
    if (this.level.native && (u < 0 || v < 0 || u > f.su || v > f.sv || this.dead[k])) return 0;
    return this.grid[k];`);
 }
 if(rel==='src/game/nav.js'){
  code="import { buildNativeNav } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('  _build() {','  _build() {\n    if (this.level.native) return buildNativeNav(this);');
 }
 if(rel==='src/game/minimap.js'){
  code="import { buildNativeMinimap } from '../../patches/native-stages/runtime/engine.mjs';\n"+code;
  once('  _build() {','  _build() {\n    if (this.level.native) return buildNativeMinimap(this);');
 }
 if(rel==='patches/splatoon3/runtime/ranked/stages.mjs'){
  code="import { nativeRankedStage } from '../../../native-stages/runtime/engine.mjs';\n"+code;
  once('  const spec = SPECS[id];','  if (level?.native) return nativeRankedStage(G);\n  const spec = SPECS[id];');
 }
 return code;
}
