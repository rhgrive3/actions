import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// The keepers exist so that the programs of per-use special visuals (Ink Vac vortex, Big Bubbler field, slam fists,
// storm cloud, Tacticooler) survive their per-activation dispose. The GL side (program/stage-id reuse) is verified in
// the browser; here: the production composition compiles one never-disposed keeper set with the kids' match-load
// warm-up, against the HDR target, once per load batch, without touching the scene, gameplay or the render target.
async function boot(){
  const f=await fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
    extraExports:"export {specialProgramKeepers,warmSpecialPrograms,createVacVortex} from './patches/splatoon3/runtime/special-motion.mjs';"});
  f.G.scene=new f.THREE.Scene();f.G.settings={quality:'high'};
  return f;
}
function fakeRenderer(THREE){
  const calls=[];let rt=null;
  return {calls,shadowMap:{enabled:false},info:{render:{frame:7}},getRenderTarget:()=>rt,setRenderTarget:t=>{rt=t;},
    compileAsync(object,camera,target){calls.push({object,camera,target,rt});return Promise.resolve(object);}};
}

test('special program keepers are compiled once per warm batch against the HDR target and never disposed',async()=>{
  const f=await boot(),{THREE,G}=f;
  const keepers=f.specialProgramKeepers(THREE);
  assert.equal(f.specialProgramKeepers(THREE),keepers,'one keeper set per session');
  const kinds=keepers.children.map(c=>c.userData.specialKind||c.name);
  for(const k of ['trizooka','inkVac','bubbler','storm-cloud','keeper:screen','keeper:wave','keeper:strike'])assert.ok(kinds.includes(k),'keeper for '+k+' in '+kinds);
  assert.ok(keepers.children.some(c=>c.name==='special:vac-vortex'));
  let shaderMaterials=0;keepers.traverse(o=>{assert.equal(o.visible,true);if(o.material?.isShaderMaterial)shaderMaterials++;});
  assert.ok(shaderMaterials>=3,'vortex, bubbler field and fist energy are kept');
  assert.equal(keepers.parent,null,'keepers are never part of a drawn scene');

  const r=fakeRenderer(THREE),cam=new THREE.PerspectiveCamera(),scene=G.scene;
  const before=r.getRenderTarget();
  await f.warmSpecialPrograms(THREE,G,r,cam,scene);
  assert.equal(r.calls.length,1);
  assert.equal(r.calls[0].object,keepers);assert.equal(r.calls[0].target,scene);assert.equal(r.calls[0].camera,cam);
  assert.equal(r.calls[0].rt?.texture?.type,THREE.HalfFloatType,'compiled against an HDR target like the match');
  assert.equal(r.getRenderTarget(),before,'render target restored');
  f.warmSpecialPrograms(THREE,G,r,cam,scene);
  assert.equal(r.calls.length,1,'same frame (every kid of one load batch): compiled once');
  r.info.render.frame++;f.warmSpecialPrograms(THREE,G,r,cam,scene);
  assert.equal(r.calls.length,2,'next load batch recompiles (cache hits once the programs exist)');

  // the production Character.warmAll carries the keeper warm-up
  const a=new f.Actor({team:0,name:'keeper warm',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  try{
    r.info.render.frame++;const n=r.calls.length;
    await a.character.warmAll(r,cam,scene);
    assert.ok(r.calls.some((c,i)=>i>=n&&c.object===keepers),'warmAll compiles the keepers');
  }finally{a.character.dispose();}

  // per-use visuals keep their own materials and dispose them; the keeper's survive
  const vortex=f.createVacVortex(0xff0000,4,.3,1,THREE);
  assert.notEqual(vortex.material,keepers.children.find(c=>c.name==='special:vac-vortex').material);
  const kept=keepers.children.find(c=>c.name==='special:vac-vortex').material;
  assert.equal(vortex.material.vertexShader,kept.vertexShader);assert.equal(vortex.material.fragmentShader,kept.fragmentShader);
});
