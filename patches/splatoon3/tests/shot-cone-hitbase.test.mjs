import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptSource} from '../adapter.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import {fixture} from './weapon-edgecases-fixture.mjs';
import {hurtboxHeight} from '../runtime/player-hurtbox.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function setup(){
 const f=await fixture(),{G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.actors=[];G.boss=null;G.netm=null;
 G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};G.physics=new f.Physics(G.level);
 const ps=G.projectiles=new f.Projectiles(G.scene);return{f,ps};
}

test('#607/#677 calibrated scalar deviation stays azimuth-independent through real emission',async()=>{
 const {f,ps}=await setup();
 // The old test encoded a Bernoulli inner/outer gate that has no source basis.
 // Gamma quantiles below test the explicitly labelled S2-derived calibration;
 // they do NOT claim measured S3 marginal/joint angular probabilities.
 for(const [kind,grounded,deg] of [['shooter',true,4.86],['shooter',false,11.66],['blaster',false,10]]){
  const a=f.make(kind);a.grounded=grounded;a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);
  const biases=kind==='shooter'?(grounded?[.01,.25]:[.4]):[.5];
  for(const bias of biases)for(const u of [.25,.5,1])for(const azimuth of [0,.125,.25,.375,.5,.75]){
   if(kind==='shooter')a.weaponRunner.s3Accuracy.stand=bias;
   const draws=[u,azimuth];let calls=0;
   f.setRandom(()=>{calls++;return draws.length?draws.shift():.5;});
   ps[kind==='shooter'?'fireShooter':'fireBlaster'](a,a.weapon,deg);const p=ps.list.at(-1),dir=p.vel.clone().normalize();
   const calibrated=deg*Math.pow(u,Math.log(bias)/Math.log(.5));
   near(Math.acos(Math.min(1,Math.max(-1,dir.z)))*180/Math.PI,calibrated);
   assert.equal(draws.length,0,'radius and azimuth are consumed exactly once');
   assert.equal(calls,kind==='shooter'?4:3,'seed/visual-size draws follow without an extra probability draw');
   near(p.vel.length(),a.weapon.projSpeed);assert.equal(p.wid,kind);ps.clear();
  }
 }
});

test('#607/#677 zero spread consumes no radial RNG; other families retain their separate envelopes',async()=>{
 const {f,ps}=await setup(),a=f.make('blaster');a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);
 let calls=0;f.setRandom(()=>{calls++;return .25;});ps.fireBlaster(a,a.weapon,0);
 const p=ps.list[0];near(p.vel.x,0);near(p.vel.y,0);near(p.vel.z,a.weapon.projSpeed);
 // One seed draw remains; the zero-spread branch does not invent spread draws.
 assert.equal(calls,1);
 const dir=new f.THREE.Vector3(0,0,1);const draws=[1,.25];f.setRandom(()=>draws.shift()??.5);
 ps._spread(dir,10);near(Math.acos(dir.z)*180/Math.PI,Math.atan(.55*Math.tan(10*Math.PI/180))*180/Math.PI);
});

test('#639/#640 authoritative capsule admission ignores render smoothing but follows actual position/form',async()=>{
 const {f,ps}=await setup(),a=f.make(),e=f.make();e.team=1;e.pos.set(0,0,2);f.G.actors=[e];
 // #430 owns body dimensions; place this smoothing probe above the actual hurtbox.
 const shotY=hurtboxHeight(e,f.PLAYER)+.35;
 const p=ps._new();Object.assign(p,{owner:a,team:0,size:.285,age:0});p.prev.set(0,shotY,0);p.pos.set(0,shotY,4);
 for(const form of ['kid','squid']){
  e.form=form;e.smoothY=0;const base=f.fidelityProjectileTargets(ps,p).length;
  for(const y of [-.7,-.45,.45,.7]){e.smoothY=y;assert.equal(f.fidelityProjectileTargets(ps,p).length,base,`${form} ${y}`);assert.equal(e.smoothY,y);}
 }
 e.form='kid';e.smoothY=0;assert.equal(f.fidelityProjectileTargets(ps,p).length,0);
 e.pos.y=.45;assert.equal(f.fidelityProjectileTargets(ps,p)[0],e,'real body movement still changes collision');
 e.remote=true;p.ghost=true;assert.equal(f.fidelityProjectileTargets(ps,p)[0],e,'same cosmetic chronology for ghosts');
});

test('#639/#640 finite Charger uses the same gameplay body base',async()=>{
 const outcomes=[];
 for(const [smoothY,bodyY] of [[0,0],[-.7,0],[.7,0],[0,.45]]){
  const {f,ps}=await setup(),a=f.make('charger'),e=f.make();e.team=1;e.pos.set(0,bodyY,2);e.smoothY=smoothY;f.G.actors=[e];
  const shotY=hurtboxHeight(e,f.PLAYER)+.35;
  a.character.root.position.y=shotY-1.05;a.aimPoint.set(0,shotY,100);a.aimDir.set(0,0,1);
  const hits=[];ps.applyHit=(_a,e,amount)=>hits.push(amount);ps.fireCharger(a,a.weapon,.5);
  for(let i=0;i<4;i++)ps.update(1/60);outcomes.push(hits);assert.equal(e.smoothY,smoothY);
 }
 assert.deepEqual(outcomes[1],outcomes[0]);assert.deepEqual(outcomes[2],outcomes[0]);assert.equal(outcomes[3].length,1,'real Charger body contact remains admitted');
});

test('#639/#640 actual Shooter HP is independent of smoothing, and world cover still wins',async()=>{
 const results=[];
 for(const [smoothY,y,wall] of [[0,0,false],[-.7,0,false],[.7,0,false],[0,.45,false],[.7,.45,true]]){
  const {f,ps}=await setup(),a=f.make(),e=f.make();e.team=1;e.invuln=0;e.hp=100;e.pos.set(0,y,2);e.smoothY=smoothY;f.G.actors=[e];
  const shotY=hurtboxHeight(e,f.PLAYER)+.35;
  a.character.root.position.y=shotY-1.05;a.aimPoint.set(0,shotY,100);a.aimDir.set(0,0,1);
  if(wall){const V=(...v)=>new f.THREE.Vector3(...v);f.G.level.blocks.push({solid:true,grate:false,center:V(0,1,1),half:V(2,2,.05),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[]});f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;};}
  ps.fireShooter(a,a.weapon,0);for(let i=0;i<3;i++)ps.update(1/60);results.push(e.hp);
 }
 assert.deepEqual(results.slice(0,3),[100,100,100]);assert.ok(results[3]<100);assert.equal(results[4],100);
});

test('#607/#677 source scalar fields and independent Splatling pitch are retained',async()=>{
 const {f}=await setup();
 for(const kind of ['shooter','blaster']){const w=f.profile.weaponsFidelityCompletion.weapons[kind].WeaponParam;assert.equal(Object.hasOwn(w,'PitchDegSwerve'),false);near(f.WEAPONS[kind].spreadGround,w.Stand_DegSwerve);near(f.WEAPONS[kind].spreadAir,w.Jump_DegSwerve);}
 near(f.profile.weaponsFidelityCompletion.weapons.splatling.WeaponParam.PitchDegSwerve,1.6);
});


test('#607/#677 fixed-clock shot launch traces agree at30/60/120Hz',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const {f,ps}=await setup(),a=f.make();a.aimPoint.set(0,1.05,100);a.intent.fire=true;f.setRandom(()=>.25);
  let tick=0;const rows=[],push=ps._push;ps._push=function(p){rows.push([tick,...p.vel.toArray(),p.damage,p.size]);return push.call(this,p);};
  const clock=new FixedClock();for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{tick++;f.G.time+=dt;a.weaponRunner.update(dt,{fire:true});});
  assert.equal(clock.ticks,60);assert.ok(rows.length>1);traces.push(rows);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('#607/#677 changed emitter anchors remain fail-closed',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 const shooter='  fireShooter(a, w, spreadDeg) {';
 const line='    this._spread(dir, spreadDeg ?? (a.grounded ? w.spreadGround : w.spreadAir));';
 const offset=raw.indexOf(line,raw.indexOf(shooter));
 assert.throws(()=>adaptSource('src/game/weapons.js',raw.slice(0,offset)+raw.slice(offset+line.length)),/conflict/);
 for(const anchor of [line,'    this._spread(dir, spreadDeg ?? 1.2);'])assert.throws(()=>adaptSource('src/game/weapons.js',raw+'\n'+anchor),/conflict/);
});


test('#607/#677 ghosts preserve transmitted launch vectors without applying spread again',async()=>{
 for(const kind of ['shooter','blaster']){
  const {f,ps}=await setup(),a=f.make(kind);a.grounded=false;a.aimPoint.set(0,1.05,100);f.setRandom(()=>.25);
  ps[kind==='shooter'?'fireShooter':'fireBlaster'](a,a.weapon,10);const p=ps.list[0];
  const packet=[0,0,0,p.type,p.wid,...p.pos.toArray(),...p.vel.toArray(),p.delay,p.life,p.straight,p.radius,p.size,p.grav,p.drag,p.trailEvery,p.head,p.vis,p.tail0,p.tailK,p.wob,p.wobF,p.nose,p.sats];
  const vel=p.vel.toArray();a.aimPoint.set(20,5,-20);a.grounded=true;ps._spread=()=>{throw Error('ghost must not resample spread');};
  ps.ghostProjectile(a,packet);const q=ps.list.at(-1);assert.deepEqual(q.vel.toArray(),vel);assert.equal(q.damage,0);assert.equal(q.ghost,true);
 }
});

test('current36-field recorder preserves scalar launch vectors through the full network composition',async()=>{
 const {fixture:composed}=await import('../../../scripts/weapons-fixture.mjs');
 for(const kind of ['shooter','blaster']){
  const f=await composed({site:new URL('../../../.cone-network-source',import.meta.url).pathname,fidelity:true,network:true});
  const a=f.make(kind);a.nid=7;a.grounded=false;a.aimPoint.set(0,1.05,100);
  f.context.Math.random=()=>.25;
  const nm=f.G.netm=new f.NetMatch({myId:7},{});
  f.projectiles[kind==='shooter'?'fireShooter':'fireBlaster'](a,a.weapon,10);
  const p=f.projectiles.list[0],velocity=Array.from(p.vel.toArray()),packet=nm.out.find(e=>e[1]==='p');
  assert.equal(packet.length,36);assert.equal(packet[4],kind);
  const peer=f.make(kind);peer.remote=true;peer.aimPoint.set(20,5,-20);peer.grounded=true;
  f.projectiles.list.length=0;let draws=0;f.context.Math.random=()=>{draws++;return .9;};
  f.projectiles.ghostProjectile(peer,packet);const q=f.projectiles.list[0];
  assert.ok(q?.ghost);assert.equal(q.damage,0);assert.equal(draws,1,'native ghost placeholder seed remains; no two-draw radial sample is added');
  assert.equal(q.seed,p.seed,'the recorder replaces the placeholder with the owner seed');
  assert.deepEqual(Array.from(q.vel.toArray()),velocity);
 }
});
