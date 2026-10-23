import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// A launched brella canopy and the Super Jump arrival gauge are built per use and dispose their materials when the
// flight ends. three.js deletes a program with its last material, so each launch/jump linked those programs again
// mid-match (measured in Chromium: the Recycled Brella paper and the gauge's track/arc/label relinked on every use).
// Like the special program keepers, one never-disposed copy compiled with the match-load warm-up keeps them alive.
// The GL side (no new program per use) is verified in the browser; here: the keepers resolve to the same program
// inputs as the live visuals (geometry, material class and parameters, shader text), are compiled against the HDR
// target with the kids' warm-up, stay out of the scene and survive every live dispose.
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true,vmMathRandom:()=>.5,
  extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';
export {installWeaponsFidelity} from './patches/splatoon3/runtime/weapons-fidelity.mjs';
export {retireDetachedCanopy} from './patches/splatoon3/runtime/brella-canopy-visual.mjs';
export {specialProgramKeepers,warmCanopyPrograms} from './patches/splatoon3/runtime/special-motion.mjs';
export {renderJumpGauge460,clearJumpGauge460,findArrivalGauge,ARRIVAL_GAUGE_NAME} from './patches/splatoon3/issue-460-gauge.mjs';`});
f.installWeaponsFidelity(f.installedRuntime,f.profile);f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
const {G,THREE}=f;

function fakeRenderer(){
  const calls=[];let rt=null;
  return {calls,shadowMap:{enabled:false},info:{render:{frame:7}},getRenderTarget:()=>rt,setRenderTarget:t=>{rt=t;},
    compileAsync(object,camera,target){calls.push({object,camera,target,rt});return Promise.resolve(object);}};
}
// Everything three.js reads into a program key, without the per-instance identity and team colour.
function programInputs(material){
  const json=material.toJSON();
  for(const key of ['uuid','color','emissive','metadata'])delete json[key];
  return {type:material.type,json,vertexShader:material.vertexShader,fragmentShader:material.fragmentShader,custom:material.customProgramCacheKey()};
}
function launch(a){
  for(let i=0;i<900;i++){
    const before=a.weaponRunner.catalogState?.canopy;a.ink=100;a.intent.fire=true;G.time+=1/60;
    a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});a._finishFrame(1/60);
    if(before?.launched&&a.weaponRunner.catalogState.canopy===null)return before;
  }
  return null;
}
function actor(weapon){
  const a=new f.Actor({team:0,weapon,isLocal:true,CharacterClass:f.Character});
  G.actors=[a];a.character.onEvent=null;G.scene.add(a.character.root);a.grounded=a.ground.hit=true;
  return a;
}

for(const id of ['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'])test(id+' launched canopy programs are kept by a warm-compiled keeper',async()=>{
  G.scene=new THREE.Scene();G.time=0;G.actors=[];G.projectiles=new f.Projectiles({add(){},remove(){}});G.physics.segment=(_a,_b,h)=>{h.hit=false;return h};
  const a=actor(id);
  try{
    // the warm-up runs before the owner Actor is resolved by the Character itself
    assert.equal(a.character.actor,null);
    const r=fakeRenderer(),cam=new THREE.PerspectiveCamera(),before=r.getRenderTarget();
    await f.warmCanopyPrograms(THREE,G,r,cam,G.scene,a.character);
    assert.equal(r.calls.length,1,'compiled with the kid');
    const keeper=r.calls[0].object;
    assert.equal(r.calls[0].target,G.scene);assert.equal(r.calls[0].camera,cam);
    assert.equal(r.calls[0].rt?.texture?.type,THREE.HalfFloatType,'compiled against an HDR target like the match');
    assert.equal(r.getRenderTarget(),before,'render target restored');
    assert.equal(keeper.parent,null,'the keeper is never drawn');
    await f.warmCanopyPrograms(THREE,G,r,cam,G.scene,a.character);
    assert.equal(r.calls[1].object,keeper,'one keeper per brella model');

    const launched=launch(a);
    assert(launched?.mesh,'real native launch');
    const live=launched.mesh.children;
    assert.deepEqual(keeper.children.map(c=>c.name),live.map(c=>c.name));
    let keptDisposals=0;
    for(const [i,cloth] of live.entries()){
      const kept=keeper.children[i];
      assert.equal(kept.geometry,cloth.geometry,cloth.name+' shares the cached model buffer');
      assert.notEqual(kept.material,cloth.material,'the flight owns its own material');
      assert.deepEqual(programInputs(kept.material),programInputs(cloth.material),cloth.name+' resolves to the same program');
      assert.deepEqual([kept.position.toArray(),kept.scale.toArray()],[cloth.position.toArray(),cloth.scale.toArray()]);
      kept.material.addEventListener('dispose',()=>keptDisposals++);
    }
    let liveDisposals=0;for(const cloth of live)cloth.material.addEventListener('dispose',()=>liveDisposals++);
    f.retireDetachedCanopy(launched);
    assert.equal(liveDisposals,live.length,'the flight still disposes its materials');
    assert.equal(keptDisposals,0,'the keeper survives');
  }finally{G.projectiles.clear();a.weaponRunner.reset();a.character.root.removeFromParent();a.character.dispose();G.actors=[];}
});

test('weapons without a brella canopy add no keeper',async()=>{
  G.scene=new THREE.Scene();G.actors=[];
  const r=fakeRenderer(),cam=new THREE.PerspectiveCamera();
  for(const weapon of ['shooter','roller','dualies']){
    const a=actor(weapon);
    try{assert.equal(f.warmCanopyPrograms(THREE,G,r,cam,G.scene,a.character),null,weapon);}
    finally{a.character.root.removeFromParent();a.character.dispose();G.actors=[];}
  }
  assert.equal(r.calls.length,0);
});

test('the Super Jump arrival gauge is kept with the special program keepers',()=>{
  const keepers=f.specialProgramKeepers(THREE);
  const kept=keepers.children.find(c=>c.name==='keeper:'+f.ARRIVAL_GAUGE_NAME);
  assert(kept,'gauge keeper in the warm-compiled keeper set');
  assert.equal(keepers.parent,null);
  const scene=new THREE.Scene(),owner={};
  const flight={progress:.25,remaining:1.5,label:'A'};
  const gauge=f.renderJumpGauge460({scene},owner,flight,new THREE.Vector3(),0xff8a14,THREE);
  assert.equal(f.findArrivalGauge(scene),gauge.group,'the live gauge is the only one in the scene');
  const pairs=[[kept.children.find(c=>c.userData.issue460Track),gauge.track],[kept.children.find(c=>c.userData.issue460Arc),gauge.arc]];
  if(gauge.label)pairs.push([kept.children.find(c=>c.userData.issue460Label),gauge.label]);
  let keptDisposals=0;
  for(const [k,live] of pairs){
    assert(k,'keeper part');
    assert.notEqual(k.material,live.material);
    assert.equal(k.geometry.type,live.geometry.type);
    assert.deepEqual(Object.keys(k.geometry.attributes),Object.keys(live.geometry.attributes));
    const a=programInputs(k.material),b=programInputs(live.material);delete a.json.uniforms;delete b.json.uniforms;
    if(a.json.opacity!==undefined){delete a.json.opacity;delete b.json.opacity;}
    delete a.json.map;delete b.json.map;delete a.json.textures;delete b.json.textures;delete a.json.images;delete b.json.images;
    assert.deepEqual(a,b,live.material.type+' resolves to the same program');
    k.material.addEventListener('dispose',()=>keptDisposals++);
  }
  assert.equal(!!kept.children.find(c=>c.userData.issue460Label)?.material.map,!!gauge.label?.material.map,'label keeps its map define');
  f.clearJumpGauge460(owner);
  assert.equal(f.findArrivalGauge(scene),null);
  assert.equal(keptDisposals,0,'the keeper survives every flight dispose');
});
