import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Native catalogue events and real Actor/Physics/Projectiles. These are
// regression diagnostics, not measurements of retail footage or refresh rate.
async function setup(enabled=true){
  const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,
    extraExports:"export {applyCatalogueChoice,replaySplashdown} from './patches/splatoon3/runtime/catalogue.mjs'; export {observeSpecialReplay} from './patches/splatoon3/runtime/special-vfx.mjs';"});
  const {G,THREE}=f;
  G.scene=new THREE.Scene();G.mode='match';G.match.state='playing';
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
  G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);
  G.camera=new THREE.PerspectiveCamera(60,1,.1,200);G.camera.position.set(0,8,15);G.camera.lookAt(0,3,0);G.camera.updateMatrixWorld();
  const a=new f.Actor({team:0,name:'impact observer',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  G.actors=[a];G.scene.add(a.character.root);a.character.actor=a;a.spawnAt(new THREE.Vector3(),0);a.invuln=0;
  assert.ok(f.applyCatalogueChoice(a,{sub:'bomb',special:'tripleSplashdown'},f));
  const fx=G.fx=new f.installedRuntime.FX(G.scene,{quality:'low'});fx.setCollider(()=>null);fx.s3SpecialVfxEnabled=enabled;
  const d=fx.s3SpecialVfx,blasts=[],events=[],paint=[],chunks=[];
  const blast=d.inkBlast,chunk=d.chunks;
  d.inkBlast=function(pos,color,radius,options){blasts.push({time:G.time,pos:pos.toArray(),streaks:options.streaks});return blast.apply(this,arguments);};
  d.chunks=function(pos,n){chunks.push(n);return chunk.apply(this,arguments);};
  G.paint.splat=(pos,radius,team)=>{paint.push([pos.toArray(),radius,team]);return 0;};
  const off=f.on('all:special',e=>{if(e.id==='tripleSplashdown')events.push({action:e.action,index:e.index??-1,time:G.time,pos:e.pos});});
  const step=(dt,actor=true)=>{G.time+=dt;if(actor)a.update(dt);G.projectiles.update(dt);fx.update(dt,G.camera);};
  for(let i=0;i<30;i++)step(1/60);a.special=a.specialCost();
  const replay=f.observeSpecialReplay(f.installedRuntime,f.replaySplashdown);
  return {...f,a,fx,d,blasts,events,paint,chunks,step,
    replay:e=>replay(f.installedRuntime,{actor:a,id:'tripleSplashdown',activation:1,pos:[0,0,0],...e}),
    close(){off();a.character.dispose();G.projectiles.clear();fx.dispose();G.fx=null;G.actors=[];}};
}

test('body and both side blasts follow native impacts exactly once at 30/60/120Hz; FX preserves gameplay',async()=>{
  for(const hz of [30,60,120]){
    const results=[];
    for(const enabled of [false,true]){
      const f=await setup(enabled),{a,G}=f;
      try{
        a._startSpecial();for(let i=0;i<hz*2;i++)f.step(1/hz);
        const impacts=f.events.filter(e=>e.action==='impact');
        assert.deepEqual(impacts.map(e=>e.index),[-1,1,0],'native body, then independently updated pair');
        assert.ok(impacts[0].time<impacts[1].time);
        if(enabled){
          assert.equal(f.blasts.length,3);
          assert.deepEqual(f.blasts.map(b=>b.time),impacts.map(e=>e.time),'no inferred or delayed visual landing');
          for(let i=0;i<3;i++)assert.ok(f.blasts[i].pos.every((n,j)=>Math.abs(n-impacts[i].pos[j])<=.0051));
        }else assert.equal(f.blasts.length,0);
        assert.equal(f.d.errors,0);assert.equal(G.projectiles._catalogueFists.length,0);
        results.push(JSON.stringify({events:f.events,paint:f.paint,pos:a.pos.toArray(),hp:a.hp,special:a.special,active:a.specialActive}));
      }finally{f.close();}
    }
    assert.equal(results[0],results[1],hz+'Hz effects never change events, paint, position, HP or gauge');
  }
});

test('cancellation/clear has no landing blast and a new activation still lands normally',async()=>{
  const f=await setup();
  try{
    f.a._startSpecial();f.step(1/60);f.a.reset();f.G.projectiles.clear();f.fx.update(1/60,f.G.camera);
    assert.equal(f.blasts.length,0,'clearing live fists is not an impact');assert.equal(f.d.fists.size,0);
    f.a.spawnAt(new f.THREE.Vector3(),0);f.a.special=f.a.specialCost();f.a._startSpecial();
    for(let i=0;i<120;i++)f.step(1/60);
    assert.equal(f.blasts.length,3);assert.equal(f.d.errors,0);
  }finally{f.close();}
});

test('owner death keeps independent fists and produces only their two accepted impacts',async()=>{
  const f=await setup();
  try{
    f.a._startSpecial();f.step(1/60);f.a.splat(null,'test');
    for(let i=0;i<120;i++)f.step(1/60,false);
    assert.equal(f.a.alive,false);assert.deepEqual(f.events.filter(e=>e.action==='impact').map(e=>e.index),[1,0]);
    assert.equal(f.blasts.length,2);assert.ok(f.blasts.every(b=>b.streaks===24));assert.equal(f.d.errors,0);
  }finally{f.close();}
});

test('remote visual expiry waits for accepted impact; remote fistGone shatters without a landing blast',async()=>{
  const f=await setup();
  try{
    f.a.remote=true;
    assert.equal(f.replay({action:'activate',yaw:0}),true);f.step(1/60,false);
    assert.equal(f.replay({action:'fistGone',index:0}),true);f.step(1/60,false);
    assert.equal(f.blasts.length,0,'remote destroyed fist must not announce a ground impact');
    assert.ok(f.chunks.includes(14),'accepted remote destruction still shatters');
    for(let i=0;i<120;i++)f.step(1/60,false);
    assert.equal(f.G.projectiles._catalogueFists.length,0);assert.equal(f.blasts.length,0,'expiry alone cannot fabricate a remote impact');
    assert.equal(f.replay({action:'impact',index:1,pos:[6,0,0]}),true);
    assert.equal(f.blasts.length,1);assert.deepEqual(Array.from(f.blasts[0].pos),[6,0,0]);assert.equal(f.d.errors,0);
  }finally{f.close();}
});
