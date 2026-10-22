// Compatibility bridge for pinned environment.js; the bounds/batch policy is
// an ordinary source-owned module shared with the source-owned PropKit.
export function adaptSceneryBounds(rel, code, once) {
  if (rel !== 'src/world/environment.js') return code;
  code = "import { setEnvironmentLifeEnvelopes } from './render-bounds.js';\n" + code;
  const patch = (a, b, why) => { code = once(code, a, b, 'scenery bounds: ' + why); };
  patch('    treeInst.frustumCulled = false;', '    treeInst.computeBoundingSphere(); treeInst.frustumCulled = true;', 'static tree aggregate bounds');
  patch('    this._animate(0);', '    this._animate(0);\n    setEnvironmentLifeEnvelopes(this, WATER_Y);', 'full-time sail/buoy/gull envelopes');
  return code;
}
