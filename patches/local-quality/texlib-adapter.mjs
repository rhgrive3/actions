// Issue #542: Eager 28-layer texlib pins ~28 MiB on mobile and ~112 MiB on HIGH/ULTRA.
// Stage-aware texlib generation: shared 25 layers on cold boot for non-pack stages (Tidewater/Kelpline),
// generate Cargo pack (28 layers) only when Cargo stage is selected. Bounded replacing/disposal after
// previous level/material refs retired; lobby texlib users update uniforms so they never sample disposed library.
// Preserves stable shader slot semantics (32 slots) and material names. Upstream inkwave-public remains byte-identical.

export function replaceOnceTexlib(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE texlib patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptTexlibSource(rel, code) {
  if (rel === 'src/world/texlib.js') {
    code = replaceOnceTexlib(code,
      'for (const s of STAGE_SURFACES) MATERIALS.push({ ...s.mat, name: s.name, group: s.group });',
      '// Stage materials are included on demand per stage pack in createTextureLibrary',
      'texlib materials push');
    code = replaceOnceTexlib(code,
      'export async function createTextureLibrary(renderer, { size = 512 } = {}) {',
      'export async function createTextureLibrary(renderer, { size = 512, stage = null, surfaces = null } = {}) {',
      'createTextureLibrary signature');
    code = replaceOnceTexlib(code,
      '  const t0 = performance.now();\n  const L = MATERIALS.length;',
      '  const t0 = performance.now();\n  const list = surfaces || STAGE_SURFACES;\n  const stageId = typeof stage === \'string\' ? stage : (stage?.layout || stage?.id || null);\n  const stagePacks = stageId ? list.filter((s) => s.stage === stageId) : [];\n  const stagePack = stagePacks.length ? stageId : null;\n  const activeMaterials = stagePacks.length ? [...MATERIALS, ...stagePacks.map((s) => ({ ...s.mat, name: s.name, group: s.group }))] : MATERIALS;\n  const L = activeMaterials.length;',
      'createTextureLibrary activeMaterials');
    code = replaceOnceTexlib(code,
      'const groups = [...new Set(MATERIALS.map((m) => m.group || 0))].sort((a, b) => a - b).map((g) => MATERIALS.map((m, i) => [m, i]).filter(([m]) => (m.group || 0) === g)).filter((l) => l.length);',
      'const groups = [...new Set(activeMaterials.map((m) => m.group || 0))].sort((a, b) => a - b).map((g) => activeMaterials.map((m, i) => [m, i]).filter(([m]) => (m.group || 0) === g)).filter((l) => l.length);',
      'createTextureLibrary groups');
    code = replaceOnceTexlib(code,
      '    const m = MATERIALS[i];',
      '    const m = activeMaterials[i];',
      'createTextureLibrary render loop');
    code = replaceOnceTexlib(code,
      '  MATERIALS.forEach((m, i) => {',
      '  activeMaterials.forEach((m, i) => {',
      'createTextureLibrary meta loop');
    code = replaceOnceTexlib(code,
      '    names: MATERIALS.map((m) => m.name),\n    size,\n    stats: { ms: +(t1 - t0).toFixed(1), compileMs: +(tCompiled - t0).toFixed(1), size },\n    dispose() { out.dispose(); },',
      '    names: activeMaterials.map((m) => m.name),\n    size,\n    stage: stagePack,\n    stats: { ms: +(t1 - t0).toFixed(1), compileMs: +(tCompiled - t0).toFixed(1), size },\n    dispose() { this.disposed = true; out.dispose(); },',
      'createTextureLibrary return object');
    code = replaceOnceTexlib(code,
      '  await renderer.compileAsync(scene, cam);',
      '  try { await renderer.compileAsync(scene, cam); } catch (error) { progs.forEach((p) => p.dispose()); geo.dispose(); out.dispose(); throw error; }',
      'texlib compile failure cleanup');
    code = replaceOnceTexlib(code,
      '  renderer.autoClear = false;\n  renderer.xr.enabled = false;',
      '  let generated = false;\n  try {\n  renderer.autoClear = false;\n  renderer.xr.enabled = false;',
      'texlib generation guard');
    code = replaceOnceTexlib(code,
      '  renderer.setRenderTarget(prevRT);\n  renderer.autoClear = prevAutoClear;\n  renderer.xr.enabled = prevXR;\n  progs.forEach((p) => p.dispose());\n  geo.dispose();',
      '  generated = true;\n  } finally {\n    try { renderer.setRenderTarget(prevRT); } finally {\n      renderer.autoClear = prevAutoClear;\n      renderer.xr.enabled = prevXR;\n      progs.forEach((p) => p.dispose());\n      geo.dispose();\n      if (!generated) out.dispose();\n    }\n  }',
      'texlib render failure cleanup');
    code += '\nif (typeof globalThis !== \'undefined\') { globalThis.__inkwave_stage_surfaces = STAGE_SURFACES; }\nexport { MATERIALS, STAGE_SURFACES };\n';
    return code;
  }

  if (rel === 'src/world/levelMaterial.js') {
    code = replaceOnceTexlib(code,
      '  const lib = opts.texlib || null;\n  if (lib) {',
      '  const lib = (opts.texlib && !opts.texlib.disposed) ? opts.texlib : null;\n  if (lib) {',
      'levelMaterial disposed texlib guard');
    code = replaceOnceTexlib(code,
      '...Array.from({ length: LAST_STAGE_SLOT - FIRST_STAGE_SLOT + 1 }, (_, k) => (STAGE_SURFACES.find((s) => s.slot === FIRST_STAGE_SLOT + k) || { name: \'concrete\' }).name),',
      '...Array.from({ length: LAST_STAGE_SLOT - FIRST_STAGE_SLOT + 1 }, (_, k) => { const s = STAGE_SURFACES.find((s) => s.slot === FIRST_STAGE_SLOT + k); return (s && L && s.name in L) ? s.name : \'concrete\'; }),',
      'levelMaterial slot mapping');
    code = replaceOnceTexlib(code,
      'for (const s of STAGE_SURFACES) { if (s.onWall != null) onWall[s.slot] = s.onWall; if (s.onTop != null) onTop[s.slot] = s.onTop; }',
      'for (const s of STAGE_SURFACES) { if (L && !(s.name in L)) continue; if (s.onWall != null) onWall[s.slot] = s.onWall; if (s.onTop != null) onTop[s.slot] = s.onTop; }',
      'levelMaterial onWall/onTop');
    return code;
  }

  if (rel === 'src/main.js') {
    code = "import { syncWorldTexlib, updateLobbyTexlib, stagePackFor } from '../patches/local-quality/texlib.mjs';\nimport { STAGE_SURFACES } from './world/stages/surfaces.js';\n" + code;
    code = replaceOnceTexlib(code,
      '      const { createTextureLibrary } = await import(\'./world/texlib.js\');\n      this.texlib = await createTextureLibrary(G.renderer, { size: q.paintAtlas >= 4096 ? 512 : 256 });',
      '      const { createTextureLibrary } = await import(\'./world/texlib.js\');\n      const coldStage = stagePackFor(map.layout || map.id, STAGE_SURFACES);\n      this.texlib = await createTextureLibrary(G.renderer, { size: q.paintAtlas >= 4096 ? 512 : 256, stage: coldStage });',
      'main cold boot texlib');
    code = replaceOnceTexlib(code,
      '    if (!worldCurrent()) { lightmap?.dispose?.(); props?.dispose?.(); return; }\n' +
      '    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh); this.levelMesh.geometry.dispose(); this.grateMesh?.geometry.dispose(); this.levelMat.dispose(); this.grateMat?.dispose(); }\n' +
      '    this.decor?.dispose?.();\n' +
      '    if (this.stageLightmap) { this.stageLightmap.dispose(); this.stageLightmap = null; }\n' +
      '    if (this.props) { this.props.dispose?.(); this.props = null; }\n' +
      '    G.paint?.dispose();\n' +
      '    this.layoutId = layoutId;',
      '    if (!worldCurrent()) { lightmap?.dispose?.(); props?.dispose?.(); return; }\n' +
      '    const { nextTexlib, oldTexlib } = await syncWorldTexlib(this, layoutId, G.renderer, q.paintAtlas >= 4096 ? 512 : 256, null, STAGE_SURFACES);\n' +
      '    if (!worldCurrent()) { lightmap?.dispose?.(); props?.dispose?.(); if (nextTexlib && nextTexlib !== this.texlib) nextTexlib.dispose(); return; }\n' +
      '    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh); this.levelMesh.geometry.dispose(); this.grateMesh?.geometry.dispose(); this.levelMat.dispose(); this.grateMat?.dispose(); }\n' +
      '    this.decor?.dispose?.();\n' +
      '    if (this.stageLightmap) { this.stageLightmap.dispose(); this.stageLightmap = null; }\n' +
      '    if (this.props) { this.props.dispose?.(); this.props = null; }\n' +
      '    G.paint?.dispose();\n' +
      '    if (nextTexlib) { this.texlib = nextTexlib; updateLobbyTexlib(this, nextTexlib); } else if (this.texlib?.disposed) { this.texlib = null; }\n' +
      '    if (oldTexlib && oldTexlib !== nextTexlib && !oldTexlib.disposed) oldTexlib.dispose();\n' +
      '    this.layoutId = layoutId;',
      'main _buildWorld transition');
    return code;
  }

  if (rel === 'src/game/lobbySet-mats.js') {
    code = replaceOnceTexlib(code,
      'export function surfaceMaterial(U, texlib, decalTex, envMap) {\n  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMap, envMapIntensity: 0.55 });\n  const lib = texlib;\n  mat.onBeforeCompile = (s) => {',
      'export function surfaceMaterial(U, texlib, decalTex, envMap) {\n  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMap, envMapIntensity: 0.55 });\n  const libHolder = (mat.userData.texlibHolder = { lib: (texlib && !texlib.disposed) ? texlib : null });\n  mat.onBeforeCompile = (s) => {\n    mat.userData.shaderUniforms = s.uniforms;\n    const lib = (libHolder.lib && !libHolder.lib.disposed) ? libHolder.lib : null;',
      'lobbySet surfaceMaterial holder');
    code = replaceOnceTexlib(code,
      "  mat.customProgramCacheKey = () => 'lsSurface' + (lib ? 1 : 0);",
      "  mat.customProgramCacheKey = () => 'lsSurface' + ((libHolder.lib && !libHolder.lib.disposed) ? 1 : 0);",
      'lobbySet surfaceMaterial cache key');
    code = replaceOnceTexlib(code,
      'export function groundMaterial(U, texlib, maskTex, maskRect, envMap) {\n  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMap, envMapIntensity: 1 });\n  const lib = texlib;\n  const R = (mat.userData.refl = { tex: { value: null }, mat: { value: new THREE.Matrix4() }, on: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } });\n  mat.userData.rip = { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) };\n  mat.onBeforeCompile = (s) => {',
      'export function groundMaterial(U, texlib, maskTex, maskRect, envMap) {\n  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMap, envMapIntensity: 1 });\n  const libHolder = (mat.userData.texlibHolder = { lib: (texlib && !texlib.disposed) ? texlib : null });\n  const R = (mat.userData.refl = { tex: { value: null }, mat: { value: new THREE.Matrix4() }, on: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } });\n  mat.userData.rip = { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) };\n  mat.onBeforeCompile = (s) => {\n    mat.userData.shaderUniforms = s.uniforms;\n    const lib = (libHolder.lib && !libHolder.lib.disposed) ? libHolder.lib : null;',
      'lobbySet groundMaterial holder');
    code = replaceOnceTexlib(code,
      "  mat.customProgramCacheKey = () => 'lsGround' + (lib ? 1 : 0);",
      "  mat.customProgramCacheKey = () => 'lsGround' + ((libHolder.lib && !libHolder.lib.disposed) ? 1 : 0);",
      'lobbySet groundMaterial cache key');
    return code;
  }

  return code;
}
