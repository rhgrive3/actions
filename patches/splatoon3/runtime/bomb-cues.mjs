// Display selectors for the native bomb records. No new projectile, collision,
// target scan, fuse, paint or RNG owner lives here.
import { kitBombPresentation } from './kit-subs.mjs';

export function bombCuePresentation(b, SUB, state) {
  const source = b.ghost ? b.s3GhostResolved : b.s3Resolved;
  let cue = state.cue;
  if (!cue || cue.source !== source || cue.ghost !== !!b.ghost) {
    const { id, resolved } = kitBombPresentation(b);
    cue = state.cue = { id, resolved, source, ghost: !!b.ghost,
      warning: id !== 'curling' && id !== 'sprinkler',
      follows: id === 'bomb' || id === 'autobomb', spec: resolved?.spec };
  }
  const resolved = cue.resolved;
  cue.radius = Number.isFinite(resolved?.radius) ? resolved.radius : SUB.bomb.radius;
  cue.fuse = b.s3FuseTotal > 0 ? b.s3FuseTotal : resolved?.fuse > 0 ? resolved.fuse : SUB.bomb.fuse;
  return cue;
}

// Retail Autobomb exposes its search area on landing (owner observation and
// Inkipedia Autobomb description). Use the existing acquisition radius and
// initial rotate window, not the unrelated explosion radius/countdown. The
// thin rim and linear fade are INKWAVE art; their retail pixels/timing have
// not been measured. Immediate marks expire each draw, including retirement,
// water removal, match clear and a late/culled first observation.
export function drawAutobombScan(hooks, b, state, cue, color, near) {
  const scan = b.s3Auto, spec = cue.spec;
  if (cue.id !== 'autobomb' || !scan || !spec) return;
  const elapsed = Math.max(0, (b.age - scan.startAge) * 60);
  if (!near || !(elapsed < spec.rotateFrames) || scan.phase === 'chasing') return;
  if (state.scan !== scan) {
    state.scan = scan;
    state.scanPoint ||= state.gp.clone();
    state.scanNormal ||= state.gn.clone();
    state.scanDown ||= state.gn.clone().set(0, -1, 0);
    const from = hooks._sp.copy(b.pos); from.y += .3;
    const hit = hooks.G.physics?.raycast(from, state.scanDown, 2.5, hooks.hit, true);
    state.scanGround = !!(hit?.hit && hit.normal.y > .6);
    if (state.scanGround) {
      state.scanNormal.copy(hit.normal);
      state.scanPoint.copy(hit.point).addScaledVector(hit.normal, .02);
    }
  }
  if (state.scanGround && spec.acquireRadius > 0)
    // FX's existing thin-ring shader places its rim at normalized r=.93.
    // Put that visible rim on the acquisition boundary rather than 7% inside it.
    hooks.fx.mark?.(state.scanPoint, state.scanNormal, color, spec.acquireRadius / .93,
      7, .7 * (1 - elapsed / spec.rotateFrames), 0, .3, .37);
}
