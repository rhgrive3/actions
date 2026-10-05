// INKWAVE stage-aware texlib runtime support for Issue #542.
// Manages bounded texlib lifecycle across stage transitions, updates lobby texlib users,
// and ensures inactive stage packs (Cargo) are not allocated or pinned in memory.

export const SLOT = { plain: 0, brick: 1, render: 2, concrete: 3, metalpanel: 4, corrugated: 5, hazard: 6, treads: 7, planks: 8, grate: 9, rubber: 10, asphalt: 11 };
export const SLOT_LAYER = ['concrete', 'brick', 'render', 'concrete', 'metalpanel', 'corrugated', 'hazard', 'treads', 'planks', 'grate', 'rubber', 'asphalt'];
export const SLOT_NSTR = [0, 1.0, 0.9, 0.8, 0.8, 1.0, 0.8, 0.9, 1.0, 0.7, 0.7, 0.9];

export function stageHasPack(stageId) {
  return stageId === 'cargo';
}

export function stagePackFor(stageId) {
  return stageHasPack(stageId) ? stageId : null;
}

export async function syncWorldTexlib(game, layoutId, renderer, size, createFn) {
  const currentLib = game?.texlib;
  const targetStage = stagePackFor(layoutId);
  const currentStage = currentLib ? (currentLib.stage ?? (currentLib.names?.some((n) => n.startsWith('cargo:')) ? 'cargo' : null)) : undefined;

  // If texlib is already valid for this stage and matching size, keep it
  if (currentLib && currentStage === targetStage && currentLib.size === size && !currentLib.disposed) {
    return { nextTexlib: currentLib, oldTexlib: null };
  }

  let nextTexlib = null;
  try {
    const fn = createFn || (await import('../../src/world/texlib.js')).createTextureLibrary;
    nextTexlib = await fn(renderer, { size, stage: targetStage });
  } catch (e) {
    console.error('[inkwave] texture library failed — procedural fallback', e);
    nextTexlib = null;
  }
  return { nextTexlib, oldTexlib: currentLib };
}

export function updateLobbyTexlib(game, newLib) {
  if (!newLib) return;
  const set = game?.showcase?.lob?.set || game?.showcase?.lobbySet;
  if (!set) return;
  set.texlib = newLib;
  const L = newLib.layers, M = newLib.meta;
  const surf = set.mat?.surface;
  if (surf?.userData?.texlibHolder) {
    surf.userData.texlibHolder.lib = newLib;
  }
  const surfUniforms = surf?.userData?.shaderUniforms || surf?.uniforms;
  if (surfUniforms) {
    if (surfUniforms.tAlbedo) surfUniforms.tAlbedo.value = newLib.albedo;
    if (surfUniforms.tNormal) surfUniforms.tNormal.value = newLib.normal;
    if (surfUniforms.tOrm) surfUniforms.tOrm.value = newLib.orm;
    if (surfUniforms.uTL?.value && Array.isArray(surfUniforms.uTL.value)) {
      for (let i = 0; i < SLOT_LAYER.length; i++) {
        const n = SLOT_LAYER[i];
        surfUniforms.uTL.value[i]?.set(
          L[n] ?? 0,
          1 / ((M[n] && M[n].scale) || 2),
          (M[n] && M[n].mode) ?? 1,
          (M[n] && M[n].sym) ?? 7,
        );
      }
    }
    if (surfUniforms.uTLt?.value && Array.isArray(surfUniforms.uTLt.value)) {
      for (let i = 0; i < SLOT_LAYER.length; i++) {
        const n = SLOT_LAYER[i];
        surfUniforms.uTLt.value[i]?.set(
          i === 0 ? -1 : i === SLOT.hazard ? 1 : M[n] && M[n].mask ? 2 : M[n] && M[n].tint === false ? 0 : 1,
          SLOT_NSTR[i],
          0,
          0,
        );
      }
    }
  }
  const gnd = set.mat?.ground;
  if (gnd?.userData?.texlibHolder) {
    gnd.userData.texlibHolder.lib = newLib;
  }
  const gndUniforms = gnd?.userData?.shaderUniforms || gnd?.uniforms;
  if (gndUniforms) {
    if (gndUniforms.tAlbedo) gndUniforms.tAlbedo.value = newLib.albedo;
    if (gndUniforms.tNormal) gndUniforms.tNormal.value = newLib.normal;
    if (gndUniforms.tOrm) gndUniforms.tOrm.value = newLib.orm;
    if (gndUniforms.uAs?.value?.set) {
      gndUniforms.uAs.value.set(L.asphalt ?? 0, 1 / (M.asphalt?.scale || 4), M.asphalt?.mode ?? 1, M.asphalt?.sym ?? 7);
    }
  }
  if (set.U?.uAs?.set) {
    set.U.uAs.set(L.asphalt ?? 0, 1 / (M.asphalt?.scale || 4), M.asphalt?.mode ?? 1, M.asphalt?.sym ?? 7);
  }
}
