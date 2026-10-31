// A viewer flip changes pixel order, not the sampled world points. Reuse only a
// completed canonical projection whose actual geometry/dead mask still matches.
// The mask proof is run-length encoded with a fixed 32 KiB ceiling; fragmented
// custom masks take the original build path, without another raster-sized cache.
const MAX_MASK_RUNS = 4096;
const ARRAYS = ['hgt','topBlock','pixCell','pixFx','pixFy','pixSx','pixSy'];
function references(map) {
  return [map.level,map.paint,map.level?.blocks,map.paint?.paintFaces,map.paint?.dead,
    map.toCanvas,map._worldX,map._worldZ,map._drawBase];
}
function visitValues(map, put) {
  const level=map.level,b=level.bounds;
  put(map.w);put(map.h);put(map.s);put(b.minX);put(b.maxX);put(b.minZ);put(b.maxZ);
  put(level.blocks.length);
  for(const block of level.blocks){
    put(block.id);put(!!block.solid);put(!!block.hidden);put(!!block.roof);put(!!block.perch);
    for(const v of [block.aabbMin,block.aabbMax,block.center,block.half,block.axes?.[0],block.axes?.[1],block.axes?.[2]]){
      put(v?.x);put(v?.y);put(v?.z);
    }
  }
  const faces=map.paint.paintFaces;put(faces.length);
  for(const f of faces){
    put(!!f.turf);
    for(const v of [f.origin,f.u,f.v,f.n]){put(v?.x);put(v?.y);put(v?.z);}
    put(f.su);put(f.sv);put(f.nu);put(f.nv);put(f.cu);put(f.cv);put(f.grid);
  }
}
function maskRuns(dead) {
  if(!(dead instanceof Uint8Array)||typeof SharedArrayBuffer!=='undefined'&&dead.buffer instanceof SharedArrayBuffer)return null;
  const runs=[];
  for(let i=0;i<dead.length;){
    if(!dead[i]){i++;continue;}
    if(runs.length>=MAX_MASK_RUNS*2)return null;
    const start=i++;while(i<dead.length&&dead[i])i++;
    runs.push(start,i);
  }
  return new Uint32Array(runs);
}
function sameMask(dead, cache) {
  if(dead.length!==cache.maskLength)return false;
  const runs=cache.mask;let at=0;
  for(let i=0;i<dead.length;i++){
    while(at<runs.length&&i>=runs[at+1])at+=2;
    if(!!dead[i] !== (at<runs.length&&i>=runs[at]))return false;
  }
  return true;
}
export function rememberLegacyProjection(map, canonical) {
  map._legacyProjectionCache=null;
  if(!canonical||map.level?.native||!map._built)return false;
  const mask=maskRuns(map.paint?.dead);if(!mask)return false;
  const values=[];visitValues(map,value=>values.push(value));
  map._legacyProjectionCache={refs:references(map),values,mask,maskLength:map.paint.dead.length,flip:map.flip};
  return true;
}
export function reuseLegacyProjectionFlip(map, flip, canonical) {
  const cache=map._legacyProjectionCache,N=map.w*map.h;
  if(!canonical||!map._built||map.level?.native||!cache||cache.flip===flip||map.flip!==cache.flip
      ||!Number.isSafeInteger(N)||N<=0||!ArrayBuffer.isView(map.owner)||map.owner.length!==N||ARRAYS.some(key=>!ArrayBuffer.isView(map[key])||map[key].length!==N))return false;
  if(map.nrm!==null||['canvas','base','inkC','flashC'].some(key=>map[key]?.width!==map.w||map[key]?.height!==map.h)
      ||map.inkImg?.width!==map.w||map.inkImg?.height!==map.h||map.flashImg?.width!==map.w||map.flashImg?.height!==map.h)return false;
  const refs=references(map);
  if(refs.some((value,i)=>value!==cache.refs[i]))return false;
  let index=0,same=true;
  visitValues(map,value=>{if(!Object.is(value,cache.values[index++]))same=false;});
  if(!same||index!==cache.values.length||!sameMask(map.paint.dead,cache))return false;
  for(const key of ARRAYS)map[key].reverse();
  map.flip=flip;
  // Light, shadows, water and hatching are screen-oriented: never rotate a
  // rendered base image. Redraw with the original shading algorithm instead.
  map._drawBase();map.owner.fill(0);cache.flip=flip;
  return true;
}
