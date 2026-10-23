import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
// Counterfactual implements BOTH advertised native creation hooks. It is not
// production: the current public mutable dictionaries can still replace an
// already-rendered material without calling either factory.
function creationOnly(rel,source){
 if(rel!=='patches/splatoon3/runtime/hit-spawn-motion.mjs')return source;
 const sweep='      coatAll(this);\n';assert.equal(source.split(sweep).length-1,1);
 const hook='    C.warmAll = function (...args) {';assert.equal(source.split(hook).length-1,1);
 return source.replace(sweep,'      // counterfactual: creation hooks only\n').replace(hook,`    const dither = C._ditherMat;
    C._ditherMat = function(kind,...args) { const material=dither.call(this,kind,...args); if(COATED.includes(kind))coatMaterial(material,get(this),cfg); return material; };
${hook}`);
}
async function result(counterfactual){
 const f=await sourceLoadedActorFixture({sourceOnly:true,moduleTransform:counterfactual?creationOnly:null}),a=await f.make();
 try{
  a._finishFrame(1/60);a._finishFrame(1/60);
  const ch=a.character,material=new f.THREE.MeshPhysicalMaterial(),selected=ch.lodSets[ch.lod.tier].list.filter(m=>m.userData.iwMat==='skin');assert(selected.length>0);
  ch.mats.skin=material;for(const mesh of selected)mesh.material=material;
  const dither=new f.THREE.MeshPhysicalMaterial();ch.matsD[0].skin=dither;
  a._finishFrame(0);
  const shader=m=>{const s={vertexShader:f.THREE.ShaderLib.physical.vertexShader,fragmentShader:f.THREE.ShaderLib.physical.fragmentShader,uniforms:{}};m.onBeforeCompile(s);return s;};
  const base=shader(material),twin=shader(dither);
  return{baseCoated:!!base.uniforms.uS3SpawnCoating,ditherCoated:!!twin.uniforms.uS3SpawnCoating,baseMarker:material.customProgramCacheKey().includes('|iwSpawnCoating1'),renderedMaterialRetained:selected.every(m=>m.material===material)};
 }finally{f.reset();}
}
test('creation-only coating misses actual public base/dither replacements that current update safely coats',async()=>{
 const baseline=await result(false),candidate=await result(true);
 assert.deepEqual(baseline,{baseCoated:true,ditherCoated:true,baseMarker:true,renderedMaterialRetained:true});
 assert.deepEqual(candidate,{baseCoated:false,ditherCoated:false,baseMarker:false,renderedMaterialRetained:true});
});
