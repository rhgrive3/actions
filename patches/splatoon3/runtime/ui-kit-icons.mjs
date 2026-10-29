// Lightweight list/HUD art. Register after all legacy kit icon writers.
import { CATALOGUE_SUB_ICONS } from './ui-sub-icons.mjs';
import { CATALOGUE_SPECIAL_ICONS } from './ui-special-icons.mjs';

export function installCatalogueKitIcons({ SUB_ICONS, SPECIAL_ICONS }) {
  Object.assign(SUB_ICONS, CATALOGUE_SUB_ICONS);
  Object.assign(SPECIAL_ICONS, CATALOGUE_SPECIAL_ICONS);
  // Existing legacy lookup, shared artwork only; gameplay IDs remain distinct.
  SPECIAL_ICONS.slam = CATALOGUE_SPECIAL_ICONS.tripleSplashdown;
}

// Existing detail slots only: preserve the select control and comparison owner.
// Node identity also detects a normal detail render replacing our cached art.
export function syncCatalogueKitIcons(chips, subId, specialId, { SUB_ICONS, SPECIAL_ICONS }) {
  for (const [chip, id, icons] of [[chips[0], subId, SUB_ICONS], [chips[1], specialId, SPECIAL_ICONS]]) {
    const slot = chip?.querySelector('.iw-kit__icon');
    if (!slot) continue;
    const artwork = icons?.[id] || '';
    if (slot._s3KitIconArtwork === artwork && slot._s3KitIconNode === slot.firstChild) continue;
    slot.innerHTML = artwork;
    slot._s3KitIconArtwork = artwork;
    slot._s3KitIconNode = slot.firstChild;
  }
}

const FOCUS_SYNC = Symbol('catalogueKitIconFocus');
export function bindCatalogueKitIconFocus(screen, sync) {
  const prior = screen[FOCUS_SYNC];
  if (prior && screen.onFocus === prior.wrapper) { prior.sync = sync; return; }
  const state = { original: screen.onFocus, sync, depth: 0, syncing: false, wrapper: null };
  state.wrapper = function (...args) {
    let result;
    state.depth++;
    try { result = state.original?.apply(this, args); }
    finally { state.depth--; }
    if (state.depth === 0 && !state.syncing) {
      state.syncing = true;
      try { state.sync(); }
      finally { state.syncing = false; }
    }
    return result;
  };
  screen[FOCUS_SYNC] = state;
  screen.onFocus = state.wrapper;
}
