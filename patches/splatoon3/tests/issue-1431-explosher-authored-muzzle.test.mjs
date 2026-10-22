import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Real source-loaded pose and published Tidewater geometry; no WebGL or retail
// parity claim. The former muzzle is a controlled same-geometry source owner.
const formerMuzzle=JSON.parse(fs.readFileSync(new URL('./fixtures/quad-explosher-main-contracts.json',import.meta.url))).models['s3-slosher-washtub'].muzzle;
const extraExports="export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';\nexport { MAP_LAYOUTS } from './src/world/maps.js';\nexport { getWeaponDef } from './src/game/character-weapons.js';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';";
const plain=x=>JSON.parse(JSON.stringify(x));
async function world(old=false){
  const f=await sourceLoadedActorFixture({random:()=>.5,extraExports});
  f.installMainWeaponCatalogRuntime(f,f.G.s3Profile??JSON.parse((await import('node:fs')).readFileSync(new URL('../profile.json',import.meta.url))));
  if(!old)assert.equal(f.getWeaponDef('s3-slosher-washtub').muzzleLandmark?.name,'explosher-burner-lip','candidate adopts the actual authored landmark');
  else{const d=f.getWeaponDef('s3-slosher-washtub');d.muzzle.fromArray(formerMuzzle).multiplyScalar(d.modelScale||1);}
  return f;
}
async function run(f,{hz,pitch,wall}){
  const {G,THREE}=f;f.reset();G.time=0;
  G.level=new f.Level(f.MAP_LAYOUTS.tidewater);G.physics=new f.Physics(G.level);
  G.match={playing:()=>true,canRespawn:()=>false,state:'playing',opts:{range:true}};
  const a=await f.make(),ch=a.character;a.setWeapon('s3-slosher-washtub');ch.onEvent=null;
  a.pos.set(0,0,wall?-5.72:-20);a.aimYaw=a.yaw=0;a.aimPitch=pitch*Math.PI/180;
  a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1.05,80));
  const rows=[],paint=[],fx=[],created=[],contacts=[],ps=G.projectiles,acquire=ps._new,step=ps._step;
  G.paint={sample:()=>0,splat:(at,radius,team,options)=>{paint.push({at:Array.from(at.toArray()),radius,team,owner:options?.claimOwner===a});return 0;}};
  G.fx=new Proxy({muzzle:(at,dir)=>fx.push({at:Array.from(at.toArray()),dir:Array.from(dir.toArray())})},{get:(t,k)=>k in t?t[k]:()=>{}});
  const mouth=()=>new THREE.Vector3(0,.069+Math.sin(.48)*.05472,.249+Math.cos(.48)*.05472).multiplyScalar(ch.weapon.def.modelScale||1).applyMatrix4(ch.weapon.off.matrixWorld);
  ps._new=function(...args){const p=acquire.apply(this,args);created.push(p);return p;};
  ps._step=function(p,dt){const dead=step.call(this,p,dt),h=p.catalog?.lobes?.[0]?.hit;if(p.owner===a&&h?.hit)contacts.push({at:Array.from(h.point.toArray()),normal:Array.from(h.normal.toArray()),face:h.face});return dead;};
  const clock=new f.FixedClock();G.game={s3Clock:clock};let tick=0,instanceChecks=0,maxInstanceError=0;
  try{
    for(let frame=0;frame<hz*2;frame++){
      clock.advance(1/hz,dt=>{
        a.intent.fire=tick>=30&&tick<110;G.time+=dt;created.length=0;
        const pre=mouth(),preSocket=ch.getMuzzle(new THREE.Vector3()),fxStart=fx.length;
        a.update(dt);ch.root.updateMatrixWorld(true);
        const post=mouth(),postSocket=ch.getMuzzle(new THREE.Vector3());
        for(const p of created)if(p.owner===a&&p.catalog?.r.id==='s3-slosher-washtub')rows.push({tick,
          start:Array.from(p.start.toArray()),velocity:Array.from(p.vel.toArray()),damage:p.damage,
          preMouth:Array.from(pre.toArray()),postMouth:Array.from(post.toArray()),preSocket:Array.from(preSocket.toArray()),postSocket:Array.from(postSocket.toArray()),
          fx:fx.slice(fxStart),ink:a.ink,packet:plain(p.inkMeta),remote:!!p.owner.remote,hasPoseConnection:!!p._s3PoseBirthOffset,
          guard:{from:Array.from(a.pos.clone().add(new THREE.Vector3(0,1.05,0)).toArray()),los:G.physics.los(a.pos.clone().add(new THREE.Vector3(0,1.05,0)),p.start)}});
        ps.update(dt);tick++;
      });
      ps.syncVisuals?.(Math.min(1,clock.accumulator*60));
      // Read matrices written by the real native-shape draw owner. Explosher
      // does not own a history; age>0 balls correctly follow physical p.pos.
      for(const p of ps.list)if(p.owner===a&&p.s3Shape==='explosher'&&p.delay<=0){
        const m=new THREE.Matrix4(),at=new THREE.Vector3();let error=Infinity;
        for(let i=0;i<ps.blobs.count;i++){ps.blobs.getMatrixAt(i,m);at.setFromMatrixPosition(m);error=Math.min(error,at.distanceTo(p.pos));}
        assert.ok(error<2e-5,'actual native instance centre follows the physical sphere');instanceChecks++;maxInstanceError=Math.max(maxInstanceError,error);
        assert.equal(p._iwVisualHistory??null,null,'native Explosher owns no history');
      }
    }
    assert.equal(tick,120);assert.equal(rows.length,2,'actual first/steady Explosher admissions');
    assert.equal(ch.sourceMotion.status,'ready');assert.equal(ch.sourceMotion.active,true);
    assert.ok(instanceChecks>0||contacts.length>0,'an actual native instance or immediate terrain retirement is observed');
    for(const c of contacts){const face=G.level.faces[c.face];assert.ok(face,'real stage collision face');assert.ok(Math.abs(new THREE.Vector3(...c.at).sub(face.origin).dot(face.n))<1e-6);}
    assert.ok(paint.every(p=>p.at.every(Number.isFinite)&&p.radius>0&&p.team===a.team&&p.owner),'actual contact paint keeps finite source geometry and owner');
    return{rows,contacts,paint,instanceChecks,maxInstanceError:instanceChecks?maxInstanceError:null,ink:a.ink,source:{status:ch.sourceMotion.status,active:ch.sourceMotion.active}};
  }finally{ps._new=acquire;ps._step=step;f.reset();}
}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('#1431 authored Explosher lip owns actual source pose/socket/FX while camera velocity and authority survive on Tidewater',async()=>{
  const current=await world(),before=await world(true),proof=[];
  for(const pitch of [-45,40])for(const wall of [false,true]){
    let cadence;
    for(const hz of [30,60,120]){
      const condition={hz,pitch,wall},got=await run(current,condition),old=await run(before,condition);
      for(let i=0;i<got.rows.length;i++){
        const g=got.rows[i],b=old.rows[i];
        assert.ok(distance(g.preSocket,g.preMouth)<1e-8,'actual pre-emission socket is the authored lip');
        assert.ok(distance(g.postSocket,g.postMouth)<1e-8,'actual source final-pose socket is the authored lip');
        assert.deepEqual(g.velocity,b.velocity,'camera/sourced velocity is independent of this Slosher origin correction');
        assert.equal(g.damage,b.damage);assert.equal(g.ink,b.ink);assert.deepEqual(g.packet,b.packet);assert.equal(g.remote,false);
        assert.equal(g.tick,b.tick,'unchanged source cadence/admission');
        if(!wall){
          assert.ok(distance(g.start,g.preMouth)<1e-8,'unobstructed physical birth comes from the emission-time lip');
          assert.ok(distance(b.start,b.preMouth)>.1,'former native socket measurably misses the same geometry');
          assert.ok(g.fx.some(f=>distance(f.at,g.postMouth)<1e-8),'actual deferred FX request is at the final-pose lip');
        }else{
          assert.ok(g.guard.los,'the emission world itself recorded the existing central tower guard before fixture cleanup');
        }
      }
      const comparable={rows:got.rows,contacts:got.contacts,paint:got.paint};
      if(cadence)assert.deepEqual(comparable,cadence,'full stage birth/contact/paint traces agree across fixed render schedules');else cadence=comparable;
      proof.push({condition,births:got.rows.length,instanceChecks:got.instanceChecks,maxInstanceError:got.maxInstanceError,contacts:got.contacts.length,paint:got.paint.length,source:got.source,
        candidateBirths:got.rows,formerBirths:old.rows,candidateContacts:got.contacts,formerContacts:old.contacts,candidatePaint:got.paint,formerPaint:old.paint});
    }
  }
  assert.ok(proof.some(p=>p.instanceChecks>0),'at least one condition actually inspects native instance matrices');
  console.log(JSON.stringify({explosherAuthoredMuzzle:proof}));
});
