// Diagnostic exports are detached on first observation. Animation owns stable
// scalar records; unread frames allocate no debug/contact/fallback snapshots.
class VersionedFallbacks extends Set {
  constructor() { super(); Object.defineProperty(this, 'version', {value:0,writable:true}); }
  add(value) { if (!this.has(value)) this.version++; return super.add(value); }
  delete(value) { const deleted=super.delete(value); if(deleted)this.version++; return deleted; }
  clear() { if(this.size)this.version++; return super.clear(); }
}
export function initMotionDiagnostics(controller) {
  const d=controller._iwDiagnostics={base:{},annotations:{},mode:'initial',cached:{},materialized:true,
    fallbackVersion:-1,fallbackSet:null,fallbackValues:[],contact0:0,contact1:0};
  Object.defineProperty(controller,'debug',{enumerable:true,configurable:true,
    get(){
      if(d.materialized)return d.cached;
      const b=d.base;
      const out=d.mode==='manual'?{status:b.status,state:b.state,variant:b.variant,clips:b.clips}:{
        status:b.status,variant:b.variant,state:b.state,family:b.family,speed:b.speed,pivoting:b.pivoting,pivotTurnRate:b.pivotTurnRate,
        phase:b.phase,stride:b.stride,stepAmplitude:b.stepAmplitude,cadenceHz:b.cadenceHz,authoredCadenceHz:b.authoredCadenceHz,
        run:b.run,shootBlend:b.shootBlend,sourceUpper:b.sourceUpper,clips:b.clips,contact:[d.contact0,d.contact1],fallbacks:d.fallbackValues.slice()};
      for(const key in d.annotations){
        if(key==='bodyBalance')out.bodyBalance={enabled:d.bodyEnabled,reachCorrection:d.bodyReach};
        else if(key==='squid')out.squid={name:d.squidName,frame:d.squidFrame};
        else out[key]=d.annotations[key];
      }
      d.cached=out;d.materialized=true;return out;
    },set(value){d.cached=value;d.materialized=true;}});
  return new VersionedFallbacks();
}
function begin(controller,mode){
  const d=controller._iwDiagnostics;d.mode=mode;d.cached=null;d.materialized=false;
  for(const key in d.annotations)delete d.annotations[key];
  return d;
}
export function motionDebug(controller,state,family,stride,stepAmplitude,cadenceHz,nominalCadence,run){
  const d=begin(controller,'full'),b=d.base,c=controller;
  b.status=c.status;b.variant=c.variant;b.state=state;b.family=family;b.speed=c.speed;b.pivoting=c.pivoting;b.pivotTurnRate=c.turnRate;
  b.phase=c.phase;b.stride=stride;b.stepAmplitude=stepAmplitude;b.cadenceHz=cadenceHz;b.authoredCadenceHz=nominalCadence;
  b.run=run;b.shootBlend=c.shootBlend;b.sourceUpper=c.sourceUpper;b.clips=c.currentClips;
  d.contact0=c.contact[0];d.contact1=c.contact[1];
  const set=c.fallbacks;
  if(set!==d.fallbackSet||set.version!==d.fallbackVersion||set.size!==d.fallbackValues.length||!(set instanceof VersionedFallbacks)){
    d.fallbackSet=set;d.fallbackVersion=set.version;d.fallbackValues=Array.from(set);
  }
}
export function manualMotionDebug(controller){
  const d=begin(controller,'manual'),b=d.base;b.status=controller.status;b.state=controller.state;b.variant=controller.variant;b.clips=controller.currentClips;
}
export function motionDebugScalar(controller,key,value){
  const d=controller._iwDiagnostics;d.annotations[key]=value;
  if(d.materialized)d.cached[key]=value;
}
export function motionDebugBody(controller,enabled,reachCorrection){
  const d=controller._iwDiagnostics;d.annotations.bodyBalance=true;d.bodyEnabled=enabled;d.bodyReach=reachCorrection;
  if(d.materialized)d.cached.bodyBalance={enabled,reachCorrection};
}
export function motionDebugSquid(controller,name,frame){
  const d=controller._iwDiagnostics;d.annotations.squid=true;d.squidName=name;d.squidFrame=frame;
  if(d.materialized)d.cached.squid={name,frame};
}
