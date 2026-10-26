// Existing quality owns the number. Studio's historical 2048 ceiling remains;
// this does not invent a new phone preset or freeze animated shadow casters.
export function studioShadowSize(quality) {
  const n=quality?.shadowSize;
  return Number.isFinite(n)&&n>0?Math.min(2048,Math.floor(n)):2048;
}
export function releaseStudioShadow(key) {
  const s=key?.shadow;if(!s)return;
  const map=s.map,pass=s.mapPass;s.map=null;s.mapPass=null;
  map?.dispose();if(pass!==map)pass?.dispose();
}
export function syncStudioShadow(key, quality) {
  const s=key?.shadow;if(!s)return false;
  const size=studioShadowSize(quality);
  if(s.mapSize.x===size&&s.mapSize.y===size&&(!s.map||s.map.width===size&&s.map.height===size)&&(!s.mapPass||s.mapPass.width===size&&s.mapPass.height===size))return false;
  releaseStudioShadow(key);s.mapSize.set(size,size);s.needsUpdate=true;return true;
}

// The static-menu frame gate does not tick the hidden studio's native fade.
// Finish its existing teardown only after a screen has hidden the canvas;
// live locker/room/results modes and shader warm-up retain their owners.
export function retireHiddenStudio(showcase, dt) {
  if (!showcase || showcase.mode !== null || showcase._warmState === 'busy') return;
  if (showcase._out > 0) {
    if (!(dt > 0)) return;
    // Keep the native 200 ms grace period: a quick return to Locker resumes
    // its existing kid and pose. Once the fade expires, native update clears
    // its characters/FX and this path stops ticking entirely.
    showcase.update(dt);
    if (showcase._out > 0) return;
  }
  // Portrait work shares these lights. A submitted readback or staged job
  // stays valid; release only the shadow attachments once all work is idle.
  if (showcase._portraitJob || showcase._portraitTask || showcase._pflight > 0 ||
      showcase._portraitActiveCharacter || showcase._portraitPreparedCharacter ||
      showcase._pq?.some(job => job.cbs?.length)) return;
  releaseStudioShadow(showcase.key);
}
