// INKWAVE stage-aware texlib runtime support for Issue #542.
// Manages bounded texlib lifecycle across stage transitions, updates lobby texlib users,
// and ensures inactive stage packs are not allocated or pinned in memory.

export const SLOT = { plain: 0, brick: 1, render: 2, concrete: 3, metalpanel: 4, corrugated: 5, hazard: 6, treads: 7, planks: 8, grate: 9, rubber: 10, asphalt: 11 };
export const SLOT_LAYER = ['concrete', 'brick', 'render', 'concrete', 'metalpanel', 'corrugated', 'hazard', 'treads', 'planks', 'grate', 'rubber', 'asphalt'];
export const SLOT_NSTR = [0, 1.0, 0.9, 0.8, 0.8, 1.0, 0.8, 0.9, 1.0, 0.7, 0.7, 0.9];

export function stageHasPack(stageId, surfaces) {
  return stagePackFor(stageId, surfaces) !== null;
}

export function stagePackFor(stageId, surfaces) {
  if (!stageId) return null;
  const list = surfaces || (typeof globalThis !== 'undefined' && globalThis.__inkwave_stage_surfaces) || null;
  if (list && Array.isArray(list)) {
    return list.some((s) => s.stage === stageId) ? stageId : null;
  }
  return null;
}

export async function syncWorldTexlib(game, layoutId, renderer, size, createFn, surfaces) {
  const currentLib = (game?.texlib && !game.texlib.disposed) ? game.texlib : null;
  const targetStage = stagePackFor(layoutId, surfaces);
  const currentStage = currentLib ? (currentLib.stage ?? null) : undefined;

  // If texlib is already valid for this stage pack and matching size, keep it
  if (currentLib && currentStage === targetStage && currentLib.size === size) {
    return { nextTexlib: currentLib, oldTexlib: null };
  }

  let nextTexlib = null;
  try {
    const fn = createFn || (async (r, opts) => {
      const { createTextureLibrary } = await import('./world/texlib.js');
      return createTextureLibrary(r, opts);
    });
    nextTexlib = await fn(renderer, { size, stage: targetStage, surfaces });
  } catch (e) {
    console.error('[inkwave] texture library failed — procedural fallback', e);
    nextTexlib = null;
  }

  // If generation failed, preserve valid current library without disposal or use-after-free
  if (!nextTexlib) {
    return { nextTexlib: currentLib, oldTexlib: null };
  }

  return { nextTexlib, oldTexlib: currentLib };
}

export function updateLobbyTexlib(game, newLib) {
  const validLib = (newLib && !newLib.disposed) ? newLib : null;
  const set = game?.showcase?.lob?.set || game?.showcase?.lobbySet || game?.lobbySet;
  if (!set) return;
  if (validLib) {
    set.texlib = validLib;
  } else if (set.texlib?.disposed) {
    set.texlib = null;
  }
  const mats = [set.surfaceMat, set.groundMat, set.mats?.surface, set.mats?.ground, set.mat?.surface, set.mat?.ground].filter(Boolean);
  for (const m of mats) {
    if (m.userData?.texlibHolder) {
      if (validLib) {
        m.userData.texlibHolder.lib = validLib;
      } else if (m.userData.texlibHolder.lib?.disposed) {
        m.userData.texlibHolder.lib = null;
      }
    }
    const u = m.userData?.shaderUniforms;
    if (u) {
      if (validLib) {
        if (u.tAlbedo) u.tAlbedo.value = validLib.albedo;
        if (u.tNormal) u.tNormal.value = validLib.normal;
        if (u.tOrm) u.tOrm.value = validLib.orm;
        if (u.uTexSize) u.uTexSize.value = validLib.stats?.size || validLib.size || 512;
        if (u.uTL?.value && validLib.layers && validLib.meta) {
          const L = validLib.layers, M = validLib.meta;
          SLOT_LAYER.forEach((n, i) => {
            const v = u.uTL.value[i];
            if (v?.set) {
              v.set(L[n] ?? 0, 1 / ((M[n] && M[n].scale) || 2), (M[n] && M[n].mode) ?? 1, (M[n] && M[n].sym) ?? 7);
            } else if (v) {
              v.x = L[n] ?? 0;
              v.y = 1 / ((M[n] && M[n].scale) || 2);
              v.z = (M[n] && M[n].mode) ?? 1;
              v.w = (M[n] && M[n].sym) ?? 7;
            }
          });
        }
        if (u.uTLt?.value && validLib.layers && validLib.meta) {
          const M = validLib.meta;
          SLOT_LAYER.forEach((n, i) => {
            const v = u.uTLt.value[i];
            const x = i === 0 ? -1 : i === SLOT.hazard ? 1 : M[n] && M[n].mask ? 2 : M[n] && M[n].tint === false ? 0 : 1;
            const y = SLOT_NSTR[i];
            if (v?.set) {
              v.set(x, y, 0, 0);
            } else if (v) {
              v.x = x; v.y = y; v.z = 0; v.w = 0;
            }
          });
        }
        if (u.uAs?.value && validLib.layers && validLib.meta) {
          const n = 'asphalt', M = validLib.meta[n] || { scale: 2, mode: 2, sym: 7 };
          const x = validLib.layers[n] ?? 0, y = 1 / M.scale, z = M.mode ?? 2, w = M.sym ?? 7;
          if (u.uAs.value.set) {
            u.uAs.value.set(x, y, z, w);
          } else {
            u.uAs.value.x = x; u.uAs.value.y = y; u.uAs.value.z = z; u.uAs.value.w = w;
          }
        }
      } else {
        if (u.tAlbedo && (u.tAlbedo.value?.disposed || newLib?.disposed)) u.tAlbedo.value = null;
        if (u.tNormal && (u.tNormal.value?.disposed || newLib?.disposed)) u.tNormal.value = null;
        if (u.tOrm && (u.tOrm.value?.disposed || newLib?.disposed)) u.tOrm.value = null;
      }
    }
  }
}
