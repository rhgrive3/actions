// Rejected full-Float64-position prototype. Test/archive only; not a production dependency.
// Construction-only storage. Position keeps JS-number precision because native
// triangle winding reads it before the final Float32 conversion.
const CHUNK_SIZE=3072;
export class GeometryChunkWriter {
  constructor(ArrayType=Float32Array, trackMaximum=false) {
    this.ArrayType=ArrayType;this.trackMaximum=trackMaximum;
    this.chunks=[];this.length=0;this.maximum=-Infinity;this.current=null;this.offset=0;
  }
  _chunk(count) {
    if(!this.current||this.offset+count>CHUNK_SIZE){this.current=new this.ArrayType(CHUNK_SIZE);this.chunks.push(this.current);this.offset=0;}
    return this.current;
  }
  push2(a,b) {
    const c=this.current&&this.offset+2<=CHUNK_SIZE?this.current:this._chunk(2),i=this.offset;
    c[i]=a;c[i+1]=b;this.offset=i+2;this.length+=2;return this.length;
  }
  push3(a,b,c) {
    const out=this.current&&this.offset+3<=CHUNK_SIZE?this.current:this._chunk(3),i=this.offset;
    out[i]=a;out[i+1]=b;out[i+2]=c;this.offset=i+3;this.length+=3;
    if(this.trackMaximum){if(a>this.maximum)this.maximum=a;if(b>this.maximum)this.maximum=b;if(c>this.maximum)this.maximum=c;}
    return this.length;
  }
  push4(a,b,c,d) {
    const out=this.current&&this.offset+4<=CHUNK_SIZE?this.current:this._chunk(4),i=this.offset;
    out[i]=a;out[i+1]=b;out[i+2]=c;out[i+3]=d;this.offset=i+4;this.length+=4;return this.length;
  }
  push(a,b,c,d) {
    // Generic API is used only by diagnostics; the source bridge selects the
    // known fixed attribute width so no tuple can straddle a production chunk.
    const count=arguments.length;
    for(let i=0;i<count;i++){
      const value=i===0?a:i===1?b:i===2?c:d;
      const target=this.current&&this.offset<CHUNK_SIZE?this.current:this._chunk(1);
      target[this.offset++]=value;this.length++;
      if(this.trackMaximum&&value>this.maximum)this.maximum=value;
    }
    return this.length;
  }
  get(index) {return this.chunks[Math.floor(index/CHUNK_SIZE)][index%CHUNK_SIZE];}
  finish(ArrayType=this.ArrayType) {
    const out=new ArrayType(this.length);
    for(let i=0;i<this.chunks.length;i++){
      const chunk=this.chunks[i],offset=i*CHUNK_SIZE;
      out.set(chunk.subarray(0,Math.min(CHUNK_SIZE,this.length-offset)),offset);
      this.chunks[i]=null;
    }
    this.chunks.length=0;this.current=null;this.offset=0;
    return out;
  }
}
export function createLevelGeometryStorage() {
  return {pos:new GeometryChunkWriter(Float64Array),nor:new GeometryChunkWriter(),col:new GeometryChunkWriter(),
    puv:new GeometryChunkWriter(),luv:new GeometryChunkWriter(),fuv:new GeometryChunkWriter(),fdat:new GeometryChunkWriter(),
    fflag:new GeometryChunkWriter(),ftan:new GeometryChunkWriter(),idx:new GeometryChunkWriter(Uint32Array,true)};
}

// Consume only caller-owned ordinary nonindexed parts. Preflight every input
// before consuming anything; unsupported/custom formats retain the vendor path.
export function mergeOwnedSceneryGeometries(parts,THREE,fallback) {
  if(!parts.length)return fallback(parts);
  const first=parts[0],names=Object.keys(first.attributes),firstMorph=first.morphTargetsRelative;
  if(new Set(parts).size!==parts.length)return fallback(parts);
  for(const geometry of parts){
    if(!geometry?.isBufferGeometry||geometry.index!==null||Object.keys(geometry.morphAttributes).length||
      geometry.morphTargetsRelative!==firstMorph||Object.keys(geometry.attributes).length!==names.length)
      return fallback(parts);
    for(const name of names){
      const attribute=geometry.attributes[name],sample=first.attributes[name];
      if(!attribute||attribute.isInterleavedBufferAttribute||attribute.isInstancedBufferAttribute||
        attribute.array?.constructor!==Float32Array||attribute.itemSize!==sample.itemSize||
        attribute.normalized!==sample.normalized||attribute.gpuType!==sample.gpuType||
        attribute.count*attribute.itemSize!==attribute.array.length)
        return fallback(parts);
    }
  }
  const merged=new THREE.BufferGeometry();
  // Do not retain per-attribute source lists while allocating the next output.
  for(const name of names){
    const itemSize=first.attributes[name].itemSize,normalized=first.attributes[name].normalized,gpuType=first.attributes[name].gpuType;
    let length=0;for(const geometry of parts)length+=geometry.attributes[name].array.length;
    const array=new Float32Array(length);let offset=0;
    for(const geometry of parts){
      const attribute=geometry.attributes[name];array.set(attribute.array,offset);offset+=attribute.array.length;
      geometry.attributes[name]=null;
    }
    const attribute=new THREE.BufferAttribute(array,itemSize,normalized);
    if(gpuType!==undefined)attribute.gpuType=gpuType;
    merged.setAttribute(name,attribute);
  }
  parts.length=0;
  return merged;
}
