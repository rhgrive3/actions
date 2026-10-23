// Browser-serialized, capture-only camera fixture. The canonical projectile
// actor is humanoid: battle-framing.mjs defines its reference vertical FOV as
// 55 degrees (60 is swimming). The 1280x720 capture uses that 16:9 projection,
// not the retained lens from variable-duration startup. No game frames advance.
export function installProjectileCaptureProjection() {
  const verticalFov = 55;
  const assertProjection = phase => {
    const camera = window.__G?.camera;
    const aspect = innerWidth / innerHeight;
    const close = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= 1e-9;
    const e = camera?.projectionMatrix?.elements;
    const y = 1 / Math.tan(verticalFov * Math.PI / 360);
    if (!camera || !close(aspect, 16 / 9) || !close(camera.fov, verticalFov) ||
        !close(camera.aspect, aspect) || !close(camera.zoom, 1) ||
        !e || !close(e[0], y / aspect) || !close(e[5], y) ||
        !close(e[8], 0) || !close(e[9], 0)) {
      throw new Error(`Projectile capture projection diverged at ${phase}: actual vertical FOV ${camera?.fov}, expected ${verticalFov}`);
    }
    return { verticalFov: camera.fov, aspect: camera.aspect, zoom: camera.zoom };
  };
  window.__iwAssertProjectileCaptureProjection = assertProjection;
  window.__iwSetProjectileCaptureProjection = () => {
    const camera = window.__G?.camera;
    if (!camera) throw new Error('Projectile capture camera is unavailable');
    camera.fov = verticalFov;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    return assertProjection('camera-setup');
  };
}
