// The only weapon recipe. All shape/animation/rendering is in the common engine.
// Five times the existing visual radius is an INKWAVE art setting; no physics changes.
export const ROLLER_VOLUME = Object.freeze({ asset: 'roller', visualScale: 5 });
export function captureRollerVolume(p, weapon = p.owner?.weapon) {
  const vertical = typeof p.s3Vertical === 'boolean' ? p.s3Vertical :
    p.ghost ? p.nose === .55 && p.tailK === 1.7 : !!p.owner?.weaponRunner?.s3FlickVertical;
  const horizontal = p.type === 'drop' && weapon?.kind === 'roller' &&
    !vertical;
  p._inkVolumeHorizontal = horizontal;
  if (horizontal) {
    p._inkVolumeDirection ||= p.vel.clone(); p._inkVolumeDirection.copy(p.vel);
  }
}
export function submitRollerVolume(engine, p) {
  if (!engine || !p._inkVolumeHorizontal || p._qualityDead || p.delay > 0) return false;
  return engine.submit(ROLLER_VOLUME.asset, p, (p.vis || p.size) * ROLLER_VOLUME.visualScale, p.seed < .5 ? 0 : 1);
}
