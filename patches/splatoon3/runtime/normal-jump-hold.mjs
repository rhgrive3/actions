// #890 — input-duration state ownership for ordinary jumps, without guessing
// Nintendo's unreleased 11.3.0 hold cutoff or vertical response curve.
// This observer is inert until an explicitly calibrated profile is supplied.
const INSTALL=Symbol.for('inkwave.s3.normal-jump-hold.v1');
const states=new WeakMap();
export function normalJumpHoldState(actor) {
  const s=states.get(actor);
  return s ? { serial:s.serial,frames:s.frames,released:s.released,
    applied:s.applied } : null;
}
export function validJumpHoldProfile(source) {
  return !!source && source.enabled === true && source.provenance === 'verified' &&
    Number.isInteger(source.holdFrames) && source.holdFrames > 0 && source.holdFrames <= 60 &&
    Number.isFinite(source.releaseRate) && source.releaseRate > 0 && source.releaseRate < 1;
}
export function installNormalJumpHold({ Actor },profile={}) {
  if(!Actor?.prototype?.update)throw Error('Normal jump hold requires Actor.update');
  if(Object.hasOwn(Actor.prototype,INSTALL))return;
  Object.defineProperty(Actor.prototype,INSTALL,{value:true});
  const settings=profile.normalJumpHold;
  const calibrated=validJumpHoldProfile(settings);
  const update=Actor.prototype.update,reset=Actor.prototype.reset;
  Actor.prototype.update=function(dt) {
    const before=this.s3JumpSerial||0,prior=states.get(this);
    const ordinary=!!this.alive && this.form==='kid' && !this.superJumpState &&
      !this.specialActive && !this.climbing;
    if(prior && ordinary && Number.isFinite(dt) && dt>0 &&
       this.grounded===false && Number.isFinite(this.vel?.y) && this.vel.y>0) {
      if(this.intent?.jump) prior.frames+=dt*60;
      else if(!prior.released) {
        prior.released=true;
        // Without a verified current-S3 source, never perturb game physics.
        if(calibrated && prior.frames <= settings.holdFrames) {
          this.vel.y*=settings.releaseRate;
          prior.applied=true;
        }
      }
    } else if(prior && (!ordinary || this.grounded)) states.delete(this);
    const result=update.call(this,dt);
    if(ordinary && this.s3JumpSerial!==before && !this.superJumpState) {
      states.set(this,{serial:this.s3JumpSerial,frames:Number.isFinite(dt)&&dt>0?dt*60:0,
        released:!this.intent?.jump,applied:false});
    }
    return result;
  };
  Actor.prototype.reset=function(...args){states.delete(this);return reset.apply(this,args);};
}
