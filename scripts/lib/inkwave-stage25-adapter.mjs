// Final build-only integration. Native upstream-locked files remain byte-for-byte unchanged.
// Anchors fail closed when another workstream changes an integration point.
export function adaptStage25(rel,source) {
  let s=source;const path=rel.replaceAll('\\','/');
  const one=(from,to)=>{const n=s.split(from).length-1;if(n!==1)throw new Error(`stage25 ${path}: expected 1 anchor, got ${n}: ${from.slice(0,90)}`);s=s.replace(from,to);};
  const all=(from,to,min=1)=>{const n=s.split(from).length-1;if(n<min)throw new Error(`stage25 ${path}: missing ${from.slice(0,90)}`);s=s.split(from).join(to);};
  if(path==='src/config.js'){
    s="import { registerStage25 } from './world/stages/splatoon3/catalog.js';\n"+s;
    one('// Stage rules (','registerStage25(MAPS);\n\n// Stage rules (');
  } else if(path==='src/i18n.js'){
    s="import { STAGE25_JA } from './world/stages/splatoon3/catalog.js';\n"+s;
    one('const d = DATA_JA.maps[m.id]','const d = STAGE25_JA[m.id] || DATA_JA.maps[m.id]');
  } else if(path==='src/world/maps.js'){
    s="import { STAGE25_LAYOUTS } from './stages/splatoon3/index.js';\n"+s+'\nObject.assign(MAP_LAYOUTS, STAGE25_LAYOUTS);\n';
  } else if(path==='src/ui/menus.js'){
    s="import { stage25Thumbnail } from '../world/stages/splatoon3/thumbnail.js';\n"+s;
    one("const stageArt = (id, time, small) => `${STAGE_DIR}","const stageArt = (id, time, small) => stage25Thumbnail(id,time) || `${STAGE_DIR}");
  } else if(path==='src/main.js'){
    s="import { isStage25, getStageLayout, normalizeStageRule, assertStageCompatibility } from './world/stages/splatoon3/index.js';\nimport { StageRuntime } from './world/stages/splatoon3/runtime.js';\nimport { installStageLab } from './world/stages/splatoon3/lab.js';\n"+s;
    one('    const layoutId = map.layout || map.id;','    const layoutId = map.layout || map.id;\n    const stageLayout = isStage25(layoutId) ? getStageLayout(layoutId,this.stageRule || \'turf\') : MAP_LAYOUTS[layoutId];\n    const stageKey = stageLayout?.stageId ? `${layoutId}:${stageLayout.layoutRule}:${stageLayout.compatibilityHash}` : layoutId;');
    one('if (this.layoutId === layoutId) {','if (this.layoutId === layoutId && this._stageLayoutKey === stageKey) {');
    one('for (const it of dressingFor(layoutId))','for (const it of (isStage25(layoutId) ? [] : dressingFor(layoutId)))');
    one('level = new Level(MAP_LAYOUTS[layoutId], colliders);','level = new Level(stageLayout, colliders);');
    one('    if (this.levelMesh) { scene.remove','    G.stage25?.dispose(); G.stage25 = null;\n    if (this.levelMesh) { scene.remove');
    one('    this.layoutId = layoutId;','    this.layoutId = layoutId; this._stageLayoutKey = stageKey;');
    one('level.buildGeometry(G.paint.size), this.levelMat','level.buildGeometry(G.paint.size, b => !b.grate && (!level.layout.stageId || (!b.glass && !b.dynamic))), this.levelMat');
    one('level.buildGeometry(G.paint.size, (b) => b.grate)','level.buildGeometry(G.paint.size, (b) => b.grate && (!level.layout.stageId || !b.dynamic))');
    one('    this.decor = new Decor(scene, level);','    G.stage25 = level.layout.stageId ? new StageRuntime(level,scene,G.paint,this.levelMat,this.grateMat) : null;\n    this.decor = new Decor(scene, level);');
    one('  async _loadLightmap(level, layoutId) {','  async _loadLightmap(level, layoutId) {\n    if (level.layout.stageId) return null; // No bake exists for these authored layouts.');
    one('this.decor?.group, G.env?.root','this.decor?.group, G.stage25?.scenery?.group, G.env?.root');
    one('  _applyNight() {','  _applyNight() {\n    G.stage25?.applyEnvironment(G.env);');
    one("      mode: o.mode === 'boss' ? 'boss' : 'turf',","      mode: o.mode === 'boss' ? 'boss' : 'turf',\n      stageRule: normalizeStageRule(o.stageRule || params.get('stageRule') || 'turf'),");
    one('    this.lastMatchOpts = { ...opts };','    this.lastMatchOpts = { ...opts };\n    this.stageRule = opts.stageRule;');
    all('if ((map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality) await this._buildWorld(map, flow);','await this._buildWorld(map, flow);',2);
    one('  async startNetMatch(cfg, nm) {',"  async startNetMatch(cfg, nm) {\n    assertStageCompatibility(cfg.map,cfg.stage25);\n    this.stageRule = cfg.stage25?.rule || 'turf';");
    all('    m.setup();','    m.setup();\n    G.stage25?.reset();',2);
    one('this.rig.yaw = m.local.team === 0 ? 0 : Math.PI;','this.rig.yaw = G.level.layout.spawnYaw?.[m.local.team] ?? (m.local.team === 0 ? 0 : Math.PI);');
    // install lazily: a query-gated panel, not a forced overlay on the normal game.
    one('  _applyNight() {','  _applyNight() {\n    installStageLab(this,G);');
  } else if(path==='src/game/match.js'){
    all('a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);','a.spawnAt(_v, G.level.layout.spawnYaw?.[a.team] ?? (a.team === 0 ? 0 : Math.PI));',2);
  } else if(path==='src/game/actor.js'){
    one('const yaw = this.team === 0 ? 0 : Math.PI;','const yaw = G.level.layout.spawnYaw?.[this.team] ?? (this.team === 0 ? 0 : Math.PI);');
    one('if (this.pos.y < PLAYER.fallDeathY && G.level.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.6) === -Infinity) {',
      'if (G.stage25 ? G.stage25.isHazard(this.pos) : (this.pos.y < PLAYER.fallDeathY && G.level.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.6) === -Infinity)) {');
    one('G.fx?.burst(_v.copy(this.pos).setY(PLAYER.waterY + 0.05)',"if (!G.stage25 || G.level.layout.hazard.kind === 'water') G.fx?.burst(_v.copy(this.pos).setY((G.stage25?.waterY ?? PLAYER.waterY) + 0.05)");
  } else if(path==='patches/splatoon3/runtime/respawn-lifecycle.mjs'){
    // Lemuria mirrors one axis, so the launch yaw is not the legacy +/-Z team convention.
    all('(actor.team === 0 ? 0 : Math.PI)', '(G.level.layout.spawnYaw?.[actor.team] ?? (actor.team === 0 ? 0 : Math.PI))',2);
    one('p = slotPoint(actor), yaw = actor.team === 0 ? 0 : Math.PI;', 'p = slotPoint(actor), yaw = G.level.layout.spawnYaw?.[actor.team] ?? (actor.team === 0 ? 0 : Math.PI);');
  } else if(path==='src/world/paint.js'){
    one('if (lvl.pointInside(p, 0, f.block)) this.dead[k] = 1;',
      'if ((lvl.layout.stageId && !lvl.faceContainsUV(f,(i+0.5)*f.cu,(j+0.5)*f.cv)) || lvl.pointInside(p, 0, f.block)) this.dead[k] = 1;');
    one('    const seed = opts.seed ?? Math.random();','    G.stage25?.onPaintContact(center,radius,team,opts);\n    const seed = opts.seed ?? Math.random();');
    one('    return this.grid[f.grid + j * f.nu + i];','    const k = f.grid + j * f.nu + i;\n    if (this.level.layout.stageId && (!this.level.faceContainsUV(f,u,v) || this.dead[k])) return 0;\n    return this.grid[k];');
  } else if(path==='src/game/physics.js'){
    one('    return out;\n  }\n\n  segment(',
      '    if (this.level.layout.stageId) { const owner=this.level.resolveSurfaceFace(out.point,out.normal,out.face); if(owner){out.face=owner.face;out.block=this.level.faces[owner.face].block;out.u=owner.u;out.v=owner.v;} }\n    return out;\n  }\n\n  segment(');
  } else if(path==='patches/splatoon3/runtime/clock.mjs'){
    one('        beginActorMotionTick(G.actors);',"        if (!gameplayPaused && m.state === 'playing') G.stage25?.step(simDt,m);\n        beginActorMotionTick(G.actors);");
  } else if(path==='src/net/session.js'){
    s="import { stageDescriptor, assertStageCompatibility } from '../world/stages/splatoon3/index.js';\n"+s;
    one("const cfg = { k: 'start', roster, map: l.map,", "const cfg = { k: 'start', stage25: stageDescriptor(l.map), roster, map: l.map,");
    one("{ k: 'ready', id: cfg.id }", "{ k: 'ready', id: cfg.id, stage25: stageDescriptor(cfg.map,cfg.stage25?.rule || 'turf') }");
    one("case 'ready': if (this.isHost && this._startCfg && d.id === this._startCfg.id) this._markReady(from); break;",
      "case 'ready': if (this.isHost && this._startCfg && d.id === this._startCfg.id) { try { assertStageCompatibility(this._startCfg.map,d.stage25); this._markReady(from); } catch(e) { this.error=e.message; this._emit('error',{message:e.message}); } } break;");
  } else if(path==='patches/local-quality/world-quality.mjs'){
    // Atlas resizing also changes the atlas UVs on kinematic surfaces.
    one('level.buildGeometry(targetSize)',"level.buildGeometry(targetSize,b=>!b.grate&&(!level.layout.stageId||(!b.glass&&!b.dynamic)))");
    one('(b) => b.grate','(b) => b.grate && (!level.layout.stageId || !b.dynamic)');
    one('  // Update level shader uniforms:', '  (ctx?.stage25 || level?.stageRuntime)?.rebuildAtlasGeometry(targetSize);\n\n  // Update level shader uniforms:');
    one('const items = dressingFn(layoutId);', 'const items = (ctx?.level?.layout.stageId || props.stage25) ? [] : dressingFn(layoutId);');
  }
  return s;
}
