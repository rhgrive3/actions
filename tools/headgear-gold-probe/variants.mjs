// QA ONLY. Never imported by runtime. A physical conductor hypothesis, not a claim
// that Nintendo's Golden Gala Masque uses pure gold.
export const GOLD_F0=Object.freeze([1,.766,.336]);
export const GOLD_SOURCE='https://dev.epicgames.com/documentation/unreal-engine/physically-based-materials-in-unreal-engine?lang=en-US';
export const VARIANTS=Object.freeze(['current','neutral-hook-disabled','measured-gold-f0']);
const srgb=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
export const GOLD_SRGB=Object.freeze(GOLD_F0.map(v=>255*srgb(v)));
// Recover the exact 2x2 coverage classes from the unchanged linear PBR map.
// This also handles antialiased gold/ivory/ink boundaries without region guesses.
export function coverageFromPbr(green,blue){
 for(let g=0;g<=4;g++)for(let k=0;k<=4-g;k++){
  const w=4-g-k;
  if(Math.trunc((94*g+105*k+90*w)/4)===green&&Math.trunc((190*g+60*k+10*w)/4)===blue)return {g,k,w};
 }
 throw Error('Unrecognized original PBR coverage '+green+','+blue);
}
export function transformMaps(color,pbr){
 const outColor=new Uint8Array(color),outPbr=new Uint8Array(pbr);let changed=0;
 if(color.length!==pbr.length)throw Error('Map sizes differ');
 for(let i=0;i<pbr.length;i+=4){const {g,k,w}=coverageFromPbr(pbr[i+1],pbr[i+2]);if(!g)continue;changed++;
  for(let c=0;c<3;c++)outColor[i+c]=Math.max(0,Math.min(255,color[i+c]+(GOLD_SRGB[c]-[185,163,78][c])*g/4));
  outPbr[i+2]=(255*g+60*k+10*w)/4;
 }
 return {color:outColor,pbr:outPbr,changed};
}
export function applyVariant(gear,variant){
 if(!VARIANTS.includes(variant))throw Error('Unknown QA variant');
 const restores=[],owned=[];const receipt={variant,qaOnly:true,goldSource:GOLD_SOURCE,goldF0:GOLD_F0,goldSrgbBytes:GOLD_SRGB,changedTexels:0};
 const meshes=[];gear.traverse(o=>{if(o.isMesh)meshes.push(o);});
 if(variant==='neutral-hook-disabled')for(const m of new Set(meshes.flatMap(o=>Array.isArray(o.material)?o.material:[o.material]))){
  const before=m.onBeforeCompile,key=m.customProgramCacheKey;
  m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=> 'qa-gold-neutral-hooks-disabled';m.needsUpdate=true;
  restores.push(()=>{m.onBeforeCompile=before;m.customProgramCacheKey=key;m.needsUpdate=true;});
 }
 if(variant==='measured-gold-f0'){
  const shell=meshes.find(o=>o.name==='ivory-and-flat-goldfish-art')?.material,rim=meshes.find(o=>o.name==='gold-rim')?.material;
  if(!shell?.map?.image?.data||shell.metalnessMap!==shell.roughnessMap||!rim)throw Error('Unexpected goldfish material contract');
  const map=shell.map,pbr=shell.metalnessMap,bytes=transformMaps(map.image.data,pbr.image.data);receipt.changedTexels=bytes.changed;
  const clone=(t,data)=>{const c=t.clone();c.image={...t.image,data};c.needsUpdate=true;owned.push(c);return c;};
  shell.map=clone(map,bytes.color);shell.metalnessMap=shell.roughnessMap=clone(pbr,bytes.pbr);shell.needsUpdate=true;
  const color=rim.color.clone(),metalness=rim.metalness;rim.color.setRGB(...GOLD_F0);rim.metalness=1;rim.needsUpdate=true;
  restores.push(()=>{shell.map=map;shell.metalnessMap=shell.roughnessMap=pbr;shell.needsUpdate=true;rim.color.copy(color);rim.metalness=metalness;rim.needsUpdate=true;});
 }
 let disposed=false;return {receipt,restore(){if(disposed)return;disposed=true;restores.reverse().forEach(f=>f());owned.forEach(t=>t.dispose());}};
}
