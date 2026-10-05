export function adaptResultContinuation(rel, code, once) {
  if(rel==='src/ui/menus.js'){
    code="import { clearContinuation, continuationNavigation, resultChangeButton, augmentContinuationLoadout } from '../../patches/local-quality/result-continuation.mjs';\n"+code;
    code=once(code,"    if (name === prev && !force) return;", "    if (name === prev && !force) return;\n    continuationNavigation(this, name, opts);",'continuation native navigation invalidation');
    code=once(code,'  dispose() {','  dispose() {\n    clearContinuation(this, true);','continuation disposal');
    code=once(code,'  showResults(data) {','  showResults(data) {\n    clearContinuation(this);','continuation results replacement');
    code=once(code,"    const scr = this['_scr_' + name](opts);", "    const scr = this['_scr_' + name](opts);\n    if (name === 'loadout') augmentContinuationLoadout(this, scr);",'continuation existing loadout augmentation');
    return once(code,'hostBack ? null : lobbyPill, rematch, home','hostBack ? null : lobbyPill, rematch, resultChangeButton(this, d), home','continuation Turf result choice');
  }
  if(rel==='src/main.js'){
    code="import { restoreOfflineResultShowcase } from '../patches/local-quality/result-continuation.mjs';\n"+code;
    return once(code,'    if (!this.showcase) return;','    if (!this.showcase) return;\n    restoreOfflineResultShowcase(this, G, s);','continuation original result podium');
  }
  if(rel==='styles/ui.css')return code+'\n/* #478: existing loadout actions, preserving responsive flow. */\n.iw-continuation-actions { flex-direction: column; gap: 12px; }\n.iw-res__btns { flex-wrap: wrap; }\n';
  return code;
}
