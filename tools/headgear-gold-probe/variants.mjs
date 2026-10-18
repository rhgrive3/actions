// QA ONLY. Roughness sensitivity experiment; original color/metalness preserved.
export const VARIANTS=Object.freeze(['current','gold-roughness-012','gold-roughness-060']);
// Recover the exact 2x2 coverage classes from the unchanged linear PBR map.
// This also handles antialiased gold/ivory/ink boundaries without region guesses.
export function coverageFromPbr(green,blue){
 for(let g=0;g<=4;g++)for(let k=0;k<=4-g;k++){
  const w=4-g-k;
  if(Math.trunc((94*g+105*k+90*w)/4)===green&&Math.trunc((190*g+60*k+10*w)/4)===blue)return {g,k,w};
 }
 throw Error('Unrecognized original PBR coverage '+green+','+blue);
}
export function applyVariant(gear,variant){
 if(!VARIANTS.includes(variant))throw Error('Unknown QA variant');
 const restores=[],owned=[];const receipt={variant,qaOnly:true,diagnostic:'gold roughness response, original F0 and all lights preserved',changedTexels:0};
 const meshes=[];gear.traverse(o=>{if(o.isMesh)meshes.push(o);});
 if(variant!=='current'){
  const roughness=variant==='gold-roughness-012'?.12:.60;receipt.goldRoughness=roughness;
  const shell=meshes.find(o=>o.name==='ivory-and-flat-goldfish-art')?.material,rim=meshes.find(o=>o.name==='gold-rim')?.material;
  if(!shell?.map?.image?.data||shell.metalnessMap!==shell.roughnessMap||!rim)throw Error('Unexpected goldfish material contract');
  const pbr=shell.metalnessMap,data=new Uint8Array(pbr.image.data);let changed=0;
  for(let i=0;i<data.length;i+=4){const {g,k,w}=coverageFromPbr(data[i+1],data[i+2]);if(g){data[i+1]=(roughness*255*g+105*k+90*w)/4;changed++;}}
  receipt.changedTexels=changed;
  const clone=pbr.clone();clone.image={...pbr.image,data};clone.needsUpdate=true;owned.push(clone);
  shell.metalnessMap=shell.roughnessMap=clone;shell.needsUpdate=true;
  const old=rim.roughness;rim.roughness=roughness;rim.needsUpdate=true;
  restores.push(()=>{shell.metalnessMap=shell.roughnessMap=pbr;shell.needsUpdate=true;rim.roughness=old;rim.needsUpdate=true;});
 }
 let disposed=false;return {receipt,restore(){if(disposed)return;disposed=true;restores.reverse().forEach(f=>f());owned.forEach(t=>t.dispose());}};
}
