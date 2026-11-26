export function adaptShowcaseShadow(rel,code,once) {
  if(rel!=='src/game/showcase.js')return code;
  code=once(code,"import { WEAPONS } from '../config.js';","import { WEAPONS, effectiveQuality } from '../config.js';\nimport { syncStudioShadow, releaseStudioShadow, retireHiddenStudio } from '../../patches/local-quality/showcase-shadow.mjs';",'studio effective quality import');
  const sync='syncStudioShadow(this.key, effectiveQuality(G.settings, G.game?.mobile ?? G.mobile));';
  const renderSync='const _sq = G.settings?.quality, _sm = G.game?.mobile ?? G.mobile, _st = !!_sm?.touch, _si = !!_sm?.ios, _ss = this.key?.shadow; if (!_ss || _ss.map || _ss.mapPass || this._iwShadowQ !== _sq || this._iwShadowT !== _st || this._iwShadowI !== _si) { this._iwShadowQ = _sq; this._iwShadowT = _st; this._iwShadowI = _si; syncStudioShadow(this.key, effectiveQuality(G.settings, _sm)); }';
  code=once(code,'    key.shadow.mapSize.set(2048, 2048);','    '+sync,'studio initial shadow budget');
  code=once(code,'  render() {','  render() {\n    '+renderSync,'studio runtime shadow budget');
  code=once(code,'  _renderPortraitRun(req, S, kind, r) {','  _renderPortraitRun(req, S, kind, r) {\n    '+sync,'portrait shadow budget');
  code=once(code,'    r.shadowMap.needsUpdate = true; // the pedestal render after us needs its own shadow pass','    if (!idle) r.shadowMap.needsUpdate = true; // the pedestal render after us needs its own shadow pass','portrait pedestal shadow skip when idle');
  code=once(code,'  hide() {','  retireHiddenStudio(dt) { retireHiddenStudio(this, dt); }\n\n  hide() {','hidden studio retirement owner');
  return once(code,'    this.mode = null; this._clear();','    releaseStudioShadow(this.key);\n    this.mode = null; this._clear();','studio shadow disposal');
}
