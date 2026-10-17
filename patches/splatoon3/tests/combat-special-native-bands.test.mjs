import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export {objectDamageScale} from './patches/splatoon3/runtime/sub-resistance.mjs';
 export {bigBubblerDomes} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
`});
const near=(got,want,label)=>assert.ok(Math.abs(got-want)<1e-8,`${label}: ${got} != ${want}`);
function world(id){
 const {G}=f;G.projectiles.clear();G.actors=[];G.time=0;G.net=G.netm=null;G.mode='match';
 G.match={mode:'turf',state:'playing',time:180,playing:()=>true,canRespawn:()=>false};G.scene=new f.THREE.Scene();G.camera=new f.THREE.PerspectiveCamera();
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
  single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});G.physics=new f.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};
 const a=f.make(),victim=f.make();a.invuln=0;victim.team=1;victim.hp=1000;victim.invuln=0;victim.pos.set(0,0,8);
 a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.aimYaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,.7,30);a._prevIntent={};
 a._startSpecial();
 if(id==='ultraStamp'){a.intent.sub=true;a._updateSpecial(1/60);a.intent.sub=false;}
 else if(id==='crabTank')a.intent.sub=true;
 else a.intent.fire=true;
 let projectile;
 for(let n=0;n<120&&!projectile;n++){
  G.time+=1/60;a._updateSpecial(1/60);projectile=G.projectiles.list.find(p=>p.s3AllSpecial===id);
 }
 assert.ok(projectile,`${id} real input launches a native special projectile`);
 return {G,a,victim,p:projectile};
}
for(const [id,cause,probes]of [
 ['inkjet','Jetpack_BombCore',[[2.55,50],[2.5501,30],[3.5,30],[5,30],[5.001,0]]],
 ['tentaMissiles','MultiMissile_BombCore',[[1.1,150],[1.1001,50],[1.6,50],[2.1,50],[2.1001,30],[3.2,30],[4.25,30],[4.251,0]]],
 ['ultraStamp','UltraStamp_Throw_BombCore',[[3.6,220],[3.6001,60],[5.5,60],[8,60],[8.001,0]]],
 ['crabTank','Chariot_Cannon',[[0,30],[2.5,30],[4.8,30],[4.801,0]]],
])test(`${id} actual native explosion uses the source bands for actors and deployed objects`,()=>{
 const {G,victim,p}=world(id),at=new f.THREE.Vector3(0,.7,0),object={owner:victim,team:1,id:'waveBreaker',kind:'wave',activation:1,serial:1,
  pos:new f.THREE.Vector3(),hp:10000,dead:false,age:0,dur:100};
 G.projectiles._s3AllSpecialObjects=[object];
 for(const [distance,expected]of probes){
  victim.hp=1000;victim.pos.set(distance,0,0);object.hp=10000;object.pos.set(distance,.7,0);
  G.projectiles._blastBurst(p,at,null);
  near(1000-victim.hp,expected,`${id} actor at ${distance}`);
  near(10000-object.hp,expected*f.objectDamageScale(p,'waveBreaker',cause),`${id} device at ${distance}`);
 }
});
test('a native Inkjet outer blast spends the fixed 30 band at a real Bubbler interception',()=>{
 const {G,a,victim,p}=world('inkjet'),owner=f.make();owner.team=1;owner.pos.set(6.255,0,-3);
 owner.weapon={...owner.weapon,special:'bubbler',specialCost:100};owner.special=100;owner.aimYaw=0;owner._startSpecial();
 const dome=f.bigBubblerDomes().find(d=>d.owner===owner);assert.ok(dome);victim.pos.set(4.5,0,0);
 const at=new f.THREE.Vector3(0,.7,0),end=victim.pos.clone();end.y+=.7;
 const candidate=G.projectiles.kitBarrierCandidate({owner:a,team:0,size:0,damage:0},at,end);
 assert.ok(candidate&&candidate.distance>2.55&&candidate.distance<5,'actual shell entry is in the outer blast band');
 const hp=dome.hp,requests=[],base=G.projectiles.kitBarrierCandidate;
 G.projectiles.kitBarrierCandidate=function(probe,...args){if(probe.damage>0)requests.push(probe.damage);return base.call(this,probe,...args);};
 try{G.projectiles._blastBurst(p,at,null);}finally{G.projectiles.kitBarrierCandidate=base;}
 assert.ok(requests.length>0);assert.ok(requests.every(d=>d===30),'native explosion-defense context also steps before object scaling');
 assert.ok(dome.hp<hp,'actual Bubbler HP is spent');near(victim.hp,1000,'intercepting shell protects the actual actor');
});
test('ghost native special blasts retain no actor or object authority',()=>{
 const {G,victim,p}=world('inkjet'),at=new f.THREE.Vector3(0,.7,0);victim.pos.set(3.5,0,0);
 const object={owner:victim,team:1,id:'waveBreaker',kind:'wave',activation:1,serial:1,pos:new f.THREE.Vector3(3.5,.7,0),hp:10000,dead:false,age:0,dur:100};
 G.projectiles._s3AllSpecialObjects=[object];p.ghost=true;G.projectiles._blastBurst(p,at,null);
 near(victim.hp,1000,'ghost actor HP');near(object.hp,10000,'ghost device HP');
});
