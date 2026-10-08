// #981: a centred, undistorted 16:9 visible world, independent of HUD/input size.
// Keep the full-window raster/projection so existing HUD world projections agree;
// crop only the 3D canvas. Outer space is black, not additional visible world.
// #380: current S3 reference values from the public Splatoon 3 verification wiki.
// Three.js stores vertical FOV, while the native INKWAVE source stores a 16:9 horizontal FOV.
export const BATTLE_HUMANOID_VERTICAL_FOV = 55;
export const BATTLE_SWIM_VERTICAL_FOV = 60;
export const BATTLE_ASPECT = 16 / 9;
export function horizontalFovAt16x9(verticalFov) {
  return 2 * Math.atan(Math.tan(verticalFov * Math.PI / 360) * BATTLE_ASPECT) * 180 / Math.PI;
}
export const BATTLE_HUMANOID_HORIZONTAL_FOV = horizontalFovAt16x9(BATTLE_HUMANOID_VERTICAL_FOV);
export const BATTLE_SWIM_HORIZONTAL_FOV = horizontalFovAt16x9(BATTLE_SWIM_VERTICAL_FOV);
export function battleHorizontalFov(mode, target, spectate) {
  if (mode !== 'follow' && mode !== 'spectate') return 82;
  const actor = mode === 'spectate' ? spectate : target;
  return actor?.form === 'squid' ? BATTLE_SWIM_HORIZONTAL_FOV : BATTLE_HUMANOID_HORIZONTAL_FOV;
}
export function battleFrame(width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const frameWidth = Math.min(w, h * BATTLE_ASPECT);
  const frameHeight = frameWidth / BATTLE_ASPECT;
  return { x: (w - frameWidth) / 2, y: (h - frameHeight) / 2, width: frameWidth, height: frameHeight };
}
export function battleVerticalFov(referenceVerticalFov, aspect) {
  const scale = Math.max(1, BATTLE_ASPECT / Math.max(1e-6, aspect));
  return 2 * Math.atan(Math.tan(referenceVerticalFov * Math.PI / 360) * scale) * 180 / Math.PI;
}
export function frameBattleCamera(rig, fov) {
  const camera = rig.camera;
  const active = (rig.mode === 'follow' || rig.mode === 'spectate') && !rig.mapOpen && rig.mapK <= 1e-4;
  for (const view of [camera, rig.gameCam]) if (view) {
    view.userData.s3BattleFrame = active;
    view.userData.s3ReferenceVerticalFov = fov;
  }
  return active ? battleVerticalFov(fov, camera.aspect) : fov;
}
export function cropBattleCanvas(canvas, width, height, active) {
  if (!canvas?.style) return;
  const f = battleFrame(width, height);
  const crop = active ? `inset(${f.y}px ${f.x}px)` : 'none';
  if (canvas.style.clipPath !== crop) canvas.style.clipPath = crop;
}

export function resizeBattleCamera(camera, aspect) {
  if (!camera) return;
  camera.aspect = aspect;
  if (camera.userData.s3BattleFrame) camera.fov = battleVerticalFov(camera.userData.s3ReferenceVerticalFov, aspect);
  camera.updateProjectionMatrix();
}
