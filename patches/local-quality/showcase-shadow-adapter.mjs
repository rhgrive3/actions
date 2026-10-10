export function adaptShowcaseShadow(rel,code,once) {
  if(rel!=='src/game/showcase.js')return code;
  code=once(code,"import { WEAPONS } from '../config.js';","import { WEAPONS, effectiveQuality } from '../config.js';\nimport { syncStudioShadow, releaseStudioShadow } from '../../patches/local-quality/showcase-shadow.mjs';",'studio effective quality import');
  const sync='syncStudioShadow(this.key, effectiveQuality(G.settings, G.game?.mobile ?? G.mobile));';
  code=once(code,'    key.shadow.mapSize.set(2048, 2048);','    '+sync,'studio initial shadow budget');
  code=once(code,'  render() {','  render() {\n    '+sync,'studio runtime shadow budget');
  code=once(code,'  _renderPortraitRun(req, S, kind, r) {','  _renderPortraitRun(req, S, kind, r) {\n    '+sync,'portrait shadow budget');
  return once(code,'    this.mode = null; this._clear();','    releaseStudioShadow(this.key);\n    this.mode = null; this._clear();','studio shadow disposal');
}
