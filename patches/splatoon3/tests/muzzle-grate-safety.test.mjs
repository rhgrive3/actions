import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './weapon-edgecases-fixture.mjs';
import {realCharacter} from './real-character-fixture.mjs';
import {adaptSource} from '../adapter.mjs';

async function setup(kind='dualies'){
 const f=await fixture(),{G,THREE}=f,V=(...v)=>new THREE.Vector3(...v);
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.boss=null;G.netm=null;G.actors=[];
 G.level={blocks:[],faces:[],queryBlocks(_a,_b,_c,_d,out){out.length=0;this.blocks.forEach((_b,i)=>out.push(i));return out;}};
 G.physics=new f.Physics(G.level);const ps=G.projectiles=new f.Projectiles(G.scene),a=f.make(kind);a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);
 const box=(center,half,grate=false)=>{const b={id:G.level.blocks.length,solid:true,grate,center:V(...center),half:V(...half),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[]};G.level.blocks.push(b);return b;};
 return{f,G,V,ps,a,box};
}

test('#712 sight shares the shot grate mask while normal solid walls and open range remain',async()=>{
 for(const scene of ['grate-wall','wall','open']){
  const {f,G,V,ps,a,box}=await setup('charger');
  if(scene==='grate-wall')box([0,1,2],[2,2,.05],true);
  if(scene!=='open')box([0,1,5],[2,2,.05]);
  G.actors=[a];a.weaponRunner.charging=true;
  for(const charge of [0,.5,1]){
   a.weaponRunner.charge=charge;ps._updateBeams(0);
   const m=ps._muzzle(a,V()),dir=ps._aimFrom(a,m,V()),range=a.weapon.rangeMax;/* #922: the laser is the maximum range at every charge */
   const h=G.physics.raycast(m,dir,range,new f.Hit(),true),expected=h.hit?h.dist:range;
   assert.ok(Math.abs(ps.sights.get(a).scale.z-expected)<1e-9);
   if(scene==='grate-wall')assert.equal(G.physics.raycast(m,dir,range,new f.Hit()).dist,1.65,'object mask still sees the grate');
  }
 }
});

test('#712 a real Charger hits behind the grate, while physical Bomb collision still arms on it',async()=>{
 const {f,G,V,ps,a,box}=await setup('charger');box([0,1,2],[2,2,.05],true);box([0,1,5],[2,2,.05]);
 const target=f.make();target.team=1;target.hp=1000;target.invuln=0;target.pos.set(0,0,3);G.actors=[a,target];
 a.weaponRunner.charging=true;a.weaponRunner.charge=1;ps._updateBeams(0);assert.equal(ps.sights.get(a).scale.z,4.65);
 ps.fireCharger(a,a.weapon,1);for(let i=0;i<4;i++)ps.update(1/60);assert.ok(target.hp<1000);
 ps.throwBomb(a);const bomb=ps.bombs.at(-1);for(let i=0;i<4&&bomb.fuse<0;i++)ps._updateBombs(1/60);
 assert.ok(bomb.fuse>=0,'physical Bomb arms on grate surface');assert.ok(bomb.pos.z<2);
});

test('#727 each hand is independently guarded, with mirrored, converged and grate controls',async()=>{
 for(const side of [-1,1])for(const grate of [false,true]){
  const {f,V,ps,a,box}=await setup();const right=V(.6,1.05,.9),left=V(-.6,1.05,.9);
  a.character.getMuzzle=out=>out.copy(right);a.character.getMuzzleHand=out=>out.copy(left);
  box([side*.42,1.05,.63],[.035,.1,.02],grate);
  for(const hand of [0,1]){
   const raw=hand?left:right,out=ps._muzzleHand(a,hand,V()),blocked=(hand? -1:1)===side&&!grate;
   assert.deepEqual(Array.from(out.toArray()),blocked?[0,1.05,.3]:Array.from(raw.toArray()));
  }
  a.weaponRunner.s3Turret=true;a.character.getMuzzle=out=>out.set(0,1.05,.9);a.character.getMuzzleHand=a.character.getMuzzle;
  assert.deepEqual(ps._muzzleHand(a,0,V()).toArray(),ps._muzzleHand(a,1,V()).toArray());
 }
});

test('#727 fallback is checked over the full distance and invalid coordinates cannot become a birth',async()=>{
 const {V,ps,a,box}=await setup();a.character.getMuzzle=out=>out.set(0,1.05,.9);a.character.getMuzzleHand=a.character.getMuzzle;
 box([0,1.05,.28],[.1,.1,.01]);assert.deepEqual(Array.from(ps._muzzleHand(a,1,V()).toArray()),[0,1.05,0]);
 a.character.getMuzzle=out=>out.set(NaN,Infinity,NaN);a.character.getMuzzleHand=a.character.getMuzzle;
 assert.ok(ps._muzzleHand(a,1,V()).toArray().every(Number.isFinite));
});

test('#727 actual rig no longer births inside a small obstacle and paints its back face',async()=>{
 const {f,G,V,ps,a,box}=await setup(),rig=await realCharacter();
 const ch=new rig.Character({name:'muzzle safety',weapon:'dualies',style:{hair:0,skin:2,outfit:0,eyes:0}});ch.onEvent=null;
 try{
  for(let i=0;i<90;i++)ch.update(1/60,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:true,charge:0,ink:1,hp:1,vy:0});ch.root.updateMatrixWorld(true);
  a.character=ch;a.aimPoint.set(0,.868,100);const left=ch.getMuzzleHand(V(),1).clone();const center=left.clone();center.z-=.01;
  const b=box(center.toArray(),[.025,.025,.02]);b.faces=[0,0,0,0,0,0];G.level.faces=[{origin:center.clone(),u:V(1,0,0),v:V(0,1,0)}];
  assert(Math.hypot(Math.max(0,Math.abs(center.x)-b.half.x),Math.max(0,Math.abs(center.z)-b.half.z))>f.PLAYER.radius,'body stays clear');
  const paints=[];G.paint.splat=pos=>{paints.push(pos.clone());return 0;};ps.fireDualies(a,a.weapon,0,1);
  const p=ps.list[0];assert(p.start.distanceTo(left)>.1,'unsafe real left origin is rejected');assert.deepEqual(Array.from(p.start.toArray()),[0,1.05,.3]);
  ps.update(1/60);assert.equal(ps.list.length,0);assert(paints.length>0);assert(paints.every(p=>p.z<center.z-b.half.z),'paint remains on the body-facing side');
 }finally{ch.dispose();}
});

test('#727 open-space normal hand alternation and its native cadence are retained',async()=>{
 const {f,ps,a}=await setup();const hands=[],fire=ps.fireDualies;ps.fireDualies=function(actor,w,spread,hand){hands.push(hand);return fire.call(this,actor,w,spread,hand);};
 a.intent.fire=true;f.tick(a,20);assert.deepEqual(hands,[1,0,1,0]);assert.equal(ps.list.length,4);
});

test('#712 grate-mask source connection rejects missing or duplicated native anchors',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8'),anchor='        const hit = G.physics.raycast(m, dir, range, _hit);';
 for(const source of [raw.replace(anchor,''),raw+'\n'+anchor])assert.throws(()=>adaptSource('src/game/weapons.js',source),/conflict/);
});
