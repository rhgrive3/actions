// Final build-only refinements; immutable upstream files remain untouched.
function once(code,before,after){
 if(code.includes(after))return code;
 if(code.split(before).length!==2)throw Error('Extra world queue anchor: '+before.slice(0,75));
 return code.replace(before,after);
}
export function adaptQueueExtraWorld(rel,code){
 if(rel==='src/world/level.js'){
  code=once(code,'const [i, j] = [0, 1, 2].filter((a) => a !== k);','const i = k === 0 ? 1 : 0, j = k === 2 ? 1 : 2;');
  code=once(code,'    // AABB\n    b.aabbMin.set(Infinity, Infinity, Infinity);',`    // Finite axis-aligned boxes have the same extrema without eight vector transforms.
    // AABB FAST BEGIN
    if(b.aligned && Number.isFinite(b.center.x) && Number.isFinite(b.center.y) && Number.isFinite(b.center.z) &&
       Number.isFinite(b.half.x) && Number.isFinite(b.half.y) && Number.isFinite(b.half.z) && b.half.x >= 0 && b.half.y >= 0 && b.half.z >= 0){
      b.aabbMin.set(Math.min(b.center.x-b.half.x,b.center.x+b.half.x),Math.min(b.center.y-b.half.y,b.center.y+b.half.y),Math.min(b.center.z-b.half.z,b.center.z+b.half.z));
      b.aabbMax.set(Math.max(b.center.x-b.half.x,b.center.x+b.half.x),Math.max(b.center.y-b.half.y,b.center.y+b.half.y),Math.max(b.center.z-b.half.z,b.center.z+b.half.z));
    } else {
    // AABB FAST FALLBACK
    b.aabbMin.set(Infinity, Infinity, Infinity);`);
  code=once(code,'    this.blocks.push(b);','    } // AABB FAST END\n    this.blocks.push(b);');
 }
 return code;
}
