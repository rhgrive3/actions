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
