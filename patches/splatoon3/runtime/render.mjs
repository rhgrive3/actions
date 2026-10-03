// The public cache hook bypasses Three's disabled-shadow early return, then
// reads shadow.map.width before a map exists. Preserve Three's own behavior.
export function installRendering({ ShadowCache }) {
  const render = ShadowCache.prototype._render;
  ShadowCache.prototype._render = function (shadowMap, lights, scene, camera) {
    if (!shadowMap.enabled) return this._orig.call(shadowMap, lights, scene, camera);
    return render.call(this, shadowMap, lights, scene, camera);
  };
}
