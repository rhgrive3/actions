// Physical floor paint is emitted after the current two-hand contact pose.
// No renderer/readback is involved: only the held cylinder's world transform.
let context = null;
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
export function queueRollerContactPaint(runner, dt, widthRatio = 1) {
  const a = runner.a;
  if (!context || !a.character?.weapon?.drum || !a.character.weapon.def?.drum)
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
  stroke.widthRatio = widthRatio;
  stroke.dt = dt;
  return true;
}
