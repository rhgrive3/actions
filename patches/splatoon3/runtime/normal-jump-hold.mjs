// #890 — input-duration state ownership for ordinary jumps.
// The user has explicitly authorized Splatoon 1 as a feel-reference.
// Source facts below come from the Wii U Player00_anim.szs FSKA headers,
// NOT from S3 or from jump physics. The separate hold/release coefficients
// are explicitly provisional INKWAVE game-feel values, not Nintendo numbers.
export const LEGACY_JUMP_SOURCE=Object.freeze({
  game:'Splatoon (Wii U)',archive:'thick/model/Player00_anim.szs',
  sha256:'809ccb73b110953230e5611567f635cf487d53e1536e990d0c85fba136c71938',
  startFrames:5,bodyFrames:21,endFrames:15,
  clips:Object.freeze(['Jump_Nrml00','Jump_Rllr00','JumpShoot_Nrml00']),
  // BFRES animation frame count does not reveal input hold cutoff or gravity.
  physicsExtracted:false,
});
export const LEGACY_JUMP_FEEL=Object.freeze({
  enabled:true,provenance:'legacy-approximation',
  referenceGame:LEGACY_JUMP_SOURCE.game,
  referenceAsset:LEGACY_JUMP_SOURCE.archive,
  // An editable gameplay prototype, not a claim that the 5F *clip* is
  // Nintendo's B-button cutoff. Calibrate against S1/2 capture when available.
  holdFrames:5,releaseRate:0.7,
  status:'unverified-game-feel-prototype',
});
const INSTALL=Symbol.for('inkwave.s3.normal-jump-hold.v1');
const states=new WeakMap();
export function normalJumpHoldState(actor) {
  const s=states.get(actor);
  return s ? { serial:s.serial,frames:s.frames,released:s.released,
    applied:s.applied } : null;
}
export function validJumpHoldProfile(source) {
  const verified=source?.provenance==='verified';
  const legacy=source?.provenance==='legacy-approximation' &&
    source.referenceGame===LEGACY_JUMP_SOURCE.game &&
    source.referenceAsset===LEGACY_JUMP_SOURCE.archive &&
    source.status==='unverified-game-feel-prototype';
  return !!source && source.enabled === true && (verified||legacy) &&
    Number.isInteger(source.holdFrames) && source.holdFrames > 0 && source.holdFrames <= 60 &&
    Number.isFinite(source.releaseRate) && source.releaseRate > 0 && source.releaseRate < 1;
}
export function installNormalJumpHold({ Actor },profile={}) {
  if(!Actor?.prototype?.update)throw Error('Normal jump hold requires Actor.update');
  if(Object.hasOwn(Actor.prototype,INSTALL))return;
  Object.defineProperty(Actor.prototype,INSTALL,{value:true});
  const settings=profile.normalJumpHold ?? LEGACY_JUMP_FEEL;
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
        // Explicit S1-informed playable small-hop; a prototype tune, not
        // Nintendo's measured S1/S2/S3 height or input threshold.
        if(calibrated && prior.frames <= settings.holdFrames) {
          this.vel.y*=settings.releaseRate;
          prior.applied=true;
        }
      }
    } else if(prior && (!ordinary || this.grounded)) states.delete(this);
    const result=update.call(this,dt);
    // Native update may emerge from squid before admitting a humanoid jump.
    // Own the successful jump, not the form at the beginning of its input tick.
    const started=(this.s3JumpSerial||0)!==before;
    if(started && this.alive && this.form==='kid' && !this.superJumpState &&
       !this.specialActive && !this.climbing) {
      states.set(this,{serial:this.s3JumpSerial,frames:Number.isFinite(dt)&&dt>0?dt*60:0,
        // Buffered presses can be released before native landing admission.
        // Observe that release on the next ascent tick just like an ordinary
        // 1F tap, rather than marking an unapplied response already consumed.
        released:false,applied:false});
    }
    return result;
  };
  Actor.prototype.reset=function(...args){states.delete(this);return reset.apply(this,args);};
}
