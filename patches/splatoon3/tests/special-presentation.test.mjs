import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let cached;
async function boot(){
  if(cached)return cached;
  const f=await fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
    extraExports:"export * from './patches/splatoon3/runtime/special-motion.mjs';export {throwVolley,trizookaSpecialWeapon} from './patches/splatoon3/runtime/kit-trizooka.mjs';"});
  f.G.scene=new f.THREE.Scene();f.G.settings={quality:'high'};f.G.mode='match';f.G.match.state='playing';
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return cached=f;
}
function rig(f,kind='shooter'){
  const a=new f.Actor({team:0,name:'special art',weapon:kind,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  a.grounded=a.ground.hit=true;a.character.actor=a;a.character.onEvent=null;
  f.G.actors.push(a);f.G.scene.add(a.character.root);
  const step=(dt=1/60)=>{f.G.time+=dt;a._finishFrame(dt);a.character.root.updateMatrixWorld(true);};
  for(let i=0;i<30;i++)step();
  return {a,ch:a.character,step,close(){a.character.dispose();f.G.actors=f.G.actors.filter(x=>x!==a);}};
}
function mapped(r,id,phase='charge'){r.a.weapon={...r.a.weapon,special:id};r.a.specialActive={id,phase,t:0};r.step();}
const model=(ch,name)=>ch.kid.getObjectByName('special:'+name);

test('production dedicated two-hand props follow extreme aim with fixed grips and a live muzzle',async()=>{
  const f=await boot();
  for(const kind of ['shooter','dualies','roller'])for(const id of ['trizooka','inkVac']){
    const r=rig(f,kind);try{
      mapped(r,id,id==='inkVac'?'inhale':'charge');
      for(const pitch of [-1.4,-.65,0,.7,1.4])for(const yaw of [-2,0,2]){
        r.a.aimDir.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));r.step();
        const snapshot=f.specialPresentationSnapshot(r.ch),g=model(r.ch,id);
        assert.equal(snapshot?.kind,id,'final installer draws the held prop');assert.ok(snapshot.heldVisible);
        assert.ok(snapshot.handError<1e-5,`both grips stay attached: ${kind}/${id}/${pitch}/${yaw}: ${snapshot.handError}`);
        assert.equal(r.ch.weapon.pivot.visible,false);if(r.ch.weapon.left)assert.equal(r.ch.weapon.left.pivot.visible,false);
        assert.ok(g.getWorldQuaternion(new f.THREE.Quaternion()).normalize().toArray().every(Number.isFinite));
        if(id==='trizooka'){
          const expected=g.localToWorld(g.userData.muzzle.clone()),actual=r.ch.getMuzzle(new f.THREE.Vector3());
          assert.ok(expected.distanceTo(actual)<1e-8);const aim=new f.THREE.Vector3();assert.equal(r.ch.getAimMuzzle(aim,pitch),true);assert.ok(aim.distanceTo(expected)<1e-8);
        }
      }
    }finally{r.close();}
  }
});

test('cancel, form, hidden root, weapon replacement and death retire dedicated presentation',async()=>{
  const f=await boot();for(const action of ['cancel','form','hidden','weapon','death']){
    const r=rig(f,'dualies');try{mapped(r,'trizooka');const old=r.ch.weapon;
      if(action==='cancel')r.a.specialActive=null;
      if(action==='form')r.ch.update(1/60,{form:'squid',grounded:true,speed:0});
      if(action==='hidden')r.ch.root.visible=false;
      if(action==='weapon')r.ch.setWeapon('shooter');
      if(action==='death')r.a.alive=false;
      if(action!=='form')r.step();assert.equal(f.specialPresentationSnapshot(r.ch)?.kind??null,null,action);
      assert.equal(old.pivot.visible,true,'restore exact original weapon visibility');assert.equal(old.left.pivot.visible,true);
    }finally{r.close();}
  }
});

test('procedural assets share geometry, own materials and use one cloud draw',async()=>{
  const f=await boot();for(const create of [f.createTrizooka,f.createInkVac,f.createVacPack,f.createStormDevice,f.createInkFist,f.createTacticooler,f.createBubblerHardware]){
    const a=create('#ff7711',f.THREE),b=create('#1166ff',f.THREE),seen=[];a.traverse(o=>{if(o.isMesh)seen.push(o);});
    const other=[];b.traverse(o=>{if(o.isMesh)other.push(o);});let count=0;
    assert.equal(seen.length,other.length);for(let i=0;i<seen.length;i++){assert.equal(seen[i].geometry,other[i].geometry);assert.notEqual(seen[i].material,other[i].material);seen[i].geometry.addEventListener('dispose',()=>count++);}
    f.disposeSpecialModel(a);assert.equal(count,0,'disposing one activation cannot invalidate the other');f.disposeSpecialModel(b);
  }
  const cloud=f.createStormCloud('#2244ee',f.THREE);assert.equal(cloud.children.length,1);assert.equal(cloud.children[0].isInstancedMesh,true);assert.equal(cloud.children[0].count,15);f.disposeSpecialModel(cloud);
});

test('local and remote paired fists follow visual phases without writing gameplay or network rows',async()=>{
  const f=await boot();for(const remote of [false,true]){
    const r=rig(f);try{r.a.remote=remote;mapped(r,'slam','hang');
      if(!remote)r.a._s3TripleSlamFists={origin:{x:0,y:0,z:0},centers:[{x:-2,y:0,z:4},{x:2,y:0,z:4}],remaining:null};
      const hp=r.a.hp,ink=r.a.ink,stats=JSON.stringify(r.a.stats);r.step();
      assert.equal(f.specialPresentationSnapshot(r.ch).fistsVisible,true);assert.equal(r.ch.weapon.pivot.visible,false);
      const fists=f.G.scene.getObjectByName('splashdown-paired-fists');assert.equal(fists.children.length,2);
      assert.equal(r.a.hp,hp);assert.equal(r.a.ink,ink);assert.equal(JSON.stringify(r.a.stats),stats);
      r.a.alive=false;r.step();assert.equal(f.specialPresentationSnapshot(r.ch).fistsVisible,false);
    }finally{r.close();}
  }
});

test('three cartridge slots follow sourced frame boundaries and remain inert on paused frames',async()=>{
  const f=await boot(),r=rig(f);try{
    mapped(r,'trizooka');const system=new f.Projectiles(f.G.scene);f.G.projectiles=system;
    f.throwVolley(system,r.a,f.trizookaSpecialWeapon());
    assert.equal(f.specialPresentationSnapshot(r.ch).ejects,0);
    r.step(29/60);assert.equal(f.specialPresentationSnapshot(r.ch).ejects,0,'not before 30F');
    r.step(1/60);assert.equal(f.specialPresentationSnapshot(r.ch).ejects,1,'one cartridge per three-lobe volley');
    const shells=f.G.scene.getObjectByName('trizooka-ejected-cartridges'),shellState=()=>shells.children.map(s=>[s.visible,...s.position.toArray(),...s.quaternion.toArray(),s.material.opacity]);
    const before=shellState(),time=f.G.time;r.step(0);
    assert.equal(f.G.time,time);assert.deepEqual(shellState(),before);assert.ok(f.specialPresentationSnapshot(r.ch).handError<1e-5);
    for(let j=0;j<8;j++){f.throwVolley(system,r.a,f.trizookaSpecialWeapon());r.step(30/60);assert.ok(f.specialPresentationSnapshot(r.ch).ejects<=3);}
    r.step(1.01);assert.equal(f.specialPresentationSnapshot(r.ch).ejects,0,'lifetime retires the last shell');
    system.clear();
  }finally{r.close();}
});

test('30/60/120 Hz keeps the dedicated grips and leaves special clocks with the actor',async()=>{
  const f=await boot();for(const hz of [30,60,120])for(const id of ['trizooka','inkVac']){
    const r=rig(f);try{mapped(r,id,id==='inkVac'?'inhale':'charge');const token=r.a.specialActive,clock=token.t;
      for(let j=0;j<hz;j++){r.a.aimDir.set(.3,Math.sin(j/hz*2)*.6,1).normalize();r.step(1/hz);assert.ok(f.specialPresentationSnapshot(r.ch).handError<1e-5);}
      assert.equal(r.a.specialActive,token);assert.equal(token.t,clock,'a visual update cannot spend a special clock');
    }finally{r.close();}
  }
});

test('accepted remote volleys produce one shell without network or damage authority; rejected packets stay inert',async()=>{
  const f=await boot(),owner=rig(f),peer=rig(f),previous=f.G.netm;
  const system=new f.Projectiles(f.G.scene);f.G.projectiles=system;
  try{
    mapped(owner,'trizooka');peer.a.remote=true;mapped(peer,'trizooka');owner.a.nid=7;
    const nm=new f.NetMatch({myId:'owner'},{});f.G.netm=nm;
    f.throwVolley(system,owner.a,f.trizookaSpecialWeapon());
    const packets=JSON.parse(JSON.stringify(nm.out.filter(e=>e[1]==='p'))),count=nm.out.length;
    assert.equal(packets.length,3);const hp=peer.a.hp,ink=peer.a.ink;
    for(const packet of packets)system.ghostProjectile(peer.a,packet);
    assert.equal(nm.out.length,count);for(const p of system.list.slice(-3)){assert.equal(p.ghost,true);assert.equal(p.damage,0);assert.equal(p.damageOwner,false);}
    peer.step(30/60);assert.equal(f.specialPresentationSnapshot(peer.ch).ejects,1);
    system.ghostProjectile(peer.a,[]);peer.step(1/60);assert.equal(f.specialPresentationSnapshot(peer.ch).ejects,1);
    assert.equal(peer.a.hp,hp);assert.equal(peer.a.ink,ink);
    peer.a.specialActive=null;peer.step();system.ghostProjectile(peer.a,packets[0]);peer.step();
    assert.equal(f.specialPresentationSnapshot(peer.ch).kind,null);assert.equal(model(peer.ch,'trizooka').visible,false);
  }finally{f.G.netm=previous;system.clear();owner.close();peer.close();}
});
