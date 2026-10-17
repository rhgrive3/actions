import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Actual catalogue action, native Actor/Character/Physics/Projectiles. These
// scene/pose assertions are logic diagnostics; the emitted WebGL check is separate.
async function setup(){
  const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,
    extraExports:"export {applyCatalogueChoice} from './patches/splatoon3/runtime/catalogue.mjs'; export {specialPresentationSnapshot,specialMotionAllowsFootPlant} from './patches/splatoon3/runtime/special-motion.mjs';"});
  const {G,THREE}=f;
  G.scene=new THREE.Scene();G.mode='match';G.match.state='playing';
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
  G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);
  const a=new f.Actor({team:0,name:'catalogue splashdown',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  G.actors=[a];G.scene.add(a.character.root);a.character.actor=a;a.spawnAt(new THREE.Vector3(),0);a.invuln=0;
  assert.ok(f.applyCatalogueChoice(a,{sub:'bomb',special:'tripleSplashdown'},f));
  const step=dt=>{G.time+=dt;a.update(dt);G.projectiles.update(dt);};
  for(let i=0;i<30;i++)step(1/60);a.special=a.specialCost();
  return {...f,a,step,close(){a.character.dispose();G.projectiles.clear();G.actors=[];}};
}

test('real catalogue activation owns hand models before an optional VFX update and through FX.clear',async()=>{
  const f=await setup(),{G,a}=f;
  try{
    assert.equal(G.fx,null);
    a._startSpecial();const fists=G.projectiles._catalogueFists.slice();
    assert.equal(fists.length,2);
    for(const fist of fists){
      assert.equal(fist.mesh.userData.specialKind,'slam');
      assert.ok(fist.mesh.getObjectByName('splashdown-fist'),'the attack owns a hand silhouette at birth');
      assert.equal(fist.mesh.parent,G.scene);
      fist.mesh.traverse(o=>assert.notEqual(o.geometry?.type,'BoxGeometry','no visible primitive collision box'));
      const energy=fist.mesh.userData.energy,geo=energy.geometry,count=geo.drawRange.count,override=new f.THREE.MeshNormalMaterial();
      G.scene.overrideMaterial=override;energy.onBeforeRender(null,G.scene,null,geo,override,null);
      assert.equal(geo.drawRange.count,0,'translucent energy cannot become a solid sphere in the normal pass');
      energy.onAfterRender(null,G.scene,null,geo,override,null);assert.equal(geo.drawRange.count,count);
      G.scene.overrideMaterial=null;override.dispose();
    }
    f.step(1/60);assert.ok(fists.every(x=>x.mesh.visible&&x.mesh.scale.y>0));
    const fx=G.fx=new f.installedRuntime.FX(G.scene,{quality:'low'});fx.setCollider(()=>null);
    fx.update(1/60);const director=fx.s3SpecialVfx;
    assert.equal(director.fists.size,2);
    for(const rec of director.fists.values())assert.equal(rec.model,undefined,'VFX must not duplicate attack-owned models');
    fx.clear();assert.ok(fists.every(x=>x.mesh?.parent===G.scene&&x.mesh.visible),'clearing optional effects does not erase attacks');
    fx.s3SpecialVfxEnabled=false;f.step(1/60);fx.update(1/60);
    assert.ok(fists.every(x=>x.mesh?.visible),'disabled effects keep the owned hand model');
    fx.dispose();G.fx=null;
  }finally{f.close();}
});

test('real tripleSplashdown age/drop lifecycle owns the unarmed pose and restores normal control at 30/60/120Hz',async()=>{
  const f=await setup(),{G,a,CHARACTER_CHANNELS:C}=f,ch=a.character;
  try{for(const hz of [30,60,120]){
    a.reset();a.spawnAt(new f.THREE.Vector3(),0);a.invuln=0;a.special=a.specialCost();
    a._startSpecial();let dropped=false,activeFrames=0;
    for(let i=0;i<hz*2;i++){
      f.step(1/hz);
      if(!a.specialActive)break;
      activeFrames++;
      const pose=f.specialMotionSnapshot(ch),art=f.specialPresentationSnapshot(ch);
      assert.equal(pose.kind,'tripleSplashdown');assert.notEqual(pose.phase,'native-unmapped');
      assert.equal(art.kind,'tripleSplashdown');assert.equal(ch.weapon.pivot.visible,false);
      assert.equal(ch.P[C.MODELR],0,'old weapon somersault does not override the unarmed body');
      assert.equal(f.specialMotionAllowsFootPlant(ch,true),false,'rising/dropping action owns foot contact');
      if(a.specialActive.phase==='drop'){dropped=true;assert.equal(pose.phase,'fall');}
    }
    assert.ok(activeFrames>0&&dropped,'native physics reaches the real drop');assert.equal(a.specialActive,null);
    assert.equal(ch.weapon.pivot.visible,true,'ordinary held weapon returns after landing');
    for(let i=0;i<hz;i++)f.step(1/hz);
    assert.equal(f.specialMotionSnapshot(ch).phase,null,'old leap/slam pose cannot resurrect after recovery');
    assert.equal(G.projectiles._catalogueFists.length,0);
  }}finally{f.close();}
});

test('independent fists stay visible after owner death through 86F and retire their owned materials once at 87F',async()=>{
  const f=await setup(),{G,a}=f;
  try{
    a._startSpecial();const fists=G.projectiles._catalogueFists.slice(),meshes=fists.map(x=>x.mesh),counts=new Map();
    for(const mesh of meshes)mesh.traverse(o=>{if(o.material){counts.set(o.material,0);o.material.addEventListener('dispose',()=>counts.set(o.material,counts.get(o.material)+1));}});
    a.splat(null,'test');assert.equal(a.alive,false);
    for(let i=0;i<86;i++){G.time+=1/60;G.projectiles.update(1/60);}
    assert.equal(G.projectiles._catalogueFists.length,2);assert.ok(meshes.every(m=>m.parent===G.scene&&m.visible));
    G.time+=1/60;G.projectiles.update(1/60);
    assert.equal(G.projectiles._catalogueFists.length,0);assert.ok(meshes.every(m=>m.parent===null));
    for(const count of counts.values())assert.equal(count,1);
    G.projectiles.clear();for(const count of counts.values())assert.equal(count,1);
  }finally{f.close();}
});
