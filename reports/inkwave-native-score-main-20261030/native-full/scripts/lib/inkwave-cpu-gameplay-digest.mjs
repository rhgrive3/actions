// Self-contained so Playwright installs the same implementation in the renderer.
export function installCpuGameplayDigest() {
 globalThis.__iwCreateCpuGameplayDigest = () => {
  const f64=new Float64Array(1),u32=new Uint32Array(f64.buffer),digests=[];
  let digest=2166136261;
  const mix=x=>{digest=Math.imul(digest^x,16777619)>>>0;};
  const number=v=>{
   const value=+v;
   if(!Number.isFinite(value))throw Error('Non-finite gameplay digest value');
   f64[0]=value;mix(u32[0]);mix(u32[1]);
  };
  return {
   digests,
   step(actors,paint){
    for(const a of actors){
     // Turf belongs to Actor.stats. Actor.turf does not exist; hashing it
     // admits NaN payloads instead of observing the actual gameplay score.
     for(const v of [a.pos.x,a.pos.y,a.pos.z,a.vel.x,a.vel.y,a.vel.z,a.hp,a.ink,a.alive,a.grounded,a.yaw,a.stats?.turf])number(v);
     mix(a.form==='kid'?1:2);
    }
    for(const v of [...paint.counts,paint.version,paint.growing.length])number(v);
    digests.push(digest);
   },
   finish(paint){
    for(const v of paint.grid)mix(v);
    for(const v of paint._paintOwnershipOrder||[])mix(v);
    return digest;
   },
  };
 };
}
