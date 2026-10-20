// Physical floor paint is emitted after the current two-hand contact pose.
// No renderer/readback is involved: only the held cylinder's world transform.
let context = null;
// Sparse tables omit this documented class default. It is a length, separate
// from WidthHalfMax; provenance/uncertainty: reference/roller-overhead-2026-10-20.json.
export function rollerContactDepth(paint, scale = 1) {
  return (Number.isFinite(paint?.Depth) && paint.Depth > 0 ? paint.Depth : 1.5) * scale;
}
export function rollerPaintHalfWidth(paint, speed, scale = 1, hz = 60) {
  const min = (Number.isFinite(paint.WidthHalfMin) ? paint.WidthHalfMin : 1.3) * scale;
  const max = paint.WidthHalfMax * scale;
  const low = (Number.isFinite(paint.SpeedMin) ? paint.SpeedMin : 0) * hz * scale;
  const high = paint.SpeedMax * hz * scale;
  const t = high > low ? Math.max(0, Math.min(1, (speed - low) / (high - low))) : 1;
  return min + (max - min) * t;
}
export function installRollerContactPaint(api, emitStroke) {
  context = { Hit: api.Hit };
  const finish = api.Actor.prototype._finishFrame;
  api.Actor.prototype._finishFrame = function (...args) {
    const result = finish.apply(this, args),
      runner = this.weaponRunner;
    for (let i = 0; i < 2; i++) {
      const stroke =
        i === 0 ? runner?.catalogState?.rollPaint : runner?.s3ContactPaint;
      if (!stroke) continue;
      if (stroke.pending) {
        stroke.pending = false;
        if (this.alive && !this.remote && this.grounded && runner.rolling &&
            this.character?.weapon?.drum && this.character.weapon.def?.drum)
          emitStroke(this, stroke, true);
        else stroke.active = false;
      } else if (stroke === runner?.s3ContactPaint) stroke.active = false;
    }
    return result;
  };
}
export function queueRollerContactPaint(runner, dt, radius, depth = 1.5) {
  const a = runner.a;
  if (!context || !a.character?.weapon?.drum || !a.character.weapon.def?.drum ||
      !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(depth) || depth <= 0)
    return false;
  if (
    !a.alive ||
    a.remote ||
    !a.grounded ||
    !runner.rolling ||
    a.ink <= 0.5 ||
    Math.hypot(a.intent?.move?.x || 0, a.intent?.move?.z || 0) <= 1e-9 ||
    Math.hypot(a.vel.x, a.vel.z) <= 1e-9
  )
    return true;
  let stroke = runner.s3ContactPaint;
  if (!stroke || stroke.weapon !== a.weapon) {
    stroke = runner.s3ContactPaint = {
      weapon: a.weapon,
      from: a.pos.clone(),
      to: a.pos.clone(),
      point: a.pos.clone(),
      heading: a.pos.clone(),
      active: false,
      face: -1,
      contact: {
        point: a.pos.clone(),
        origin: a.pos.clone(),
        down: a.pos.clone(),
        hit: new context.Hit(),
      },
    };
  }
  stroke.pending = true;
  stroke.radius = radius;
  stroke.depth = depth;
  stroke.dt = dt;
  return true;
}
