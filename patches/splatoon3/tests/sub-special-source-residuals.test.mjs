import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const DT=1/60;
const near=(a,b,msg='')=>assert.ok(Math.abs(a-b)<1e-7,`${msg}: ${a} != ${b}`);
async function setup(sub='curling',hold=0){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {G,THREE}=f; G.camera={position:new THREE.Vector3(0,0,0)};
 G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const a=f.make('roller'); a.weapon={...a.weapon,sub}; a.weaponRunner.reset();
 a.pos.set(0,1000,0); a.vel.set(0,0,0); a.aimPitch=0; a.aimYaw=0;
 a.weaponRunner.s3SubHold=hold;
 a.weaponRunner.s3Release={id:sub,__hold:hold,__charge:hold};
 const marks=[];G.paint.splat=(p,r)=>{marks.push({p:p.clone(),r});return 1;};
 let turf=0;a.addTurf=n=>turf+=n;
 const ps=G.projectiles;
 return {...f,a,ps,marks,get turf(){return turf;},throw(){ps.throwBomb(a);return ps.bombs.at(-1);},step(){G.time+=DT;ps._updateBombs(DT);}};
}
test('Curling release and preview consume own launch Y and inherited vertical tuple',async()=>{
 const f=await setup();let b=f.throw();near(b.vel.y,7.2,'SpawnSpeedY 0.12/F');near(b.vel.z,24);
 f.a.vel.y=2;b=f.throw();near(b.vel.y,11.2,'YPlusRate 2');
 f.a.vel.y=20;b=f.throw();near(b.vel.y,16.8,'YMax 0.16/F');
 f.a.vel.y=-20;b=f.throw();near(b.vel.y,7.2,'YMinusRate zero');
 f.a.vel.y=0; f.a.aimPitch=.3;f.ps.updateArc(f.a,true);b=f.throw();
 const v=b.vel.clone(), p=b.pos.clone();
 for(let i=0;i<2;i++){v.y-=57.6*DT;p.addScaledVector(v,DT);}
 const arc=f.ps.arcGeo.attributes.position;near(arc.getX(1),p.x);assert.ok(Math.abs(arc.getY(1)-p.y)<1e-4);near(arc.getZ(1),p.z);
});
test('Curling airborne release clock expires at charge-dependent lifetime under every render cadence',async()=>{
 for(const hz of [30,60,120])for(const hold of [0,1]){
  const f=await setup('curling',hold),b=f.throw(), clock=new f.FixedClock();
  const life=210-120*hold;let frame=0,explosion=-1;
  f.ps._explodeBomb=()=>{explosion=frame;};
  for(let i=0;i<hz*4;i++)clock.advance(1/hz,()=>{frame++;f.step();});
  assert.ok(explosion>=life && explosion<=life+1,`${hz} Hz charge ${hold}: ${explosion}`);
  assert.equal(b.s3Mode,'flight');assert.equal(f.ps.bombs.length,0);
 }
});
test('kit explosion keeps one kit paint owner and one turf credit in full installer',async()=>{
 for(const [sub,hold,count,radius] of [['suction',0,16,5],['curling',0,13,2.133],['curling',1,13,5]]){
  const f=await setup(sub,hold),b=f.throw();f.ps._explodeBomb(b);
  assert.equal(f.marks.length,count,sub);near(f.marks[0].r,radius);near(f.turf,count);
 }
 const control=await setup('bomb');control.ps._explodeBomb(control.throw());assert.equal(control.marks.length,16);
 const ghost=await setup('suction'),b=ghost.throw();b.ghost=true;ghost.ps._explodeBomb(b);assert.equal(ghost.marks.length,0);near(ghost.turf,0);
});
test('Curling replay consumes airborne fuse without gaining paint authority',async()=>{
 const f=await setup(),b=f.throw();b.ghost=true;b.s3GhostResolved=b.s3Resolved;delete b.s3Resolved;
 const old=b.vel.clone();f.step();near(b.vel.z,old.z);near(b.fuse,3.5-DT);
 f.ps._explodeBomb(b);assert.equal(f.marks.length,0);near(f.turf,0);
});
test('kit launch context restores after native failure, preserving Storm and subsequent sub calls',async()=>{
 const f=await setup();f.a.pos=null;assert.throws(()=>f.ps.throwBomb(f.a));assert.equal(f.ps.s3KitThrowResolved,undefined);
 f.a.pos=new f.THREE.Vector3();f.a.vel.set(0,0,0);
 const direct=f.ps.throwVelocity(f.a,67.2,new f.THREE.Vector3());near(direct.y,14.4,'no stale Curling scope');
});
