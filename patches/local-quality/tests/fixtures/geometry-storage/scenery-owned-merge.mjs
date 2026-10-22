// Rejected experiment: capacity improves, warmed CPU regresses. Test-only.
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
