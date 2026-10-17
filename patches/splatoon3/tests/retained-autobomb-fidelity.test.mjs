import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const STEP=1/60,near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:adaptBuildSource});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.match={playing:()=>true};
 G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};G.physics.raycast=(_o,_d,_l,h)=>{h.hit=false;return h;};
 const a=f.make('blaster');a.aimYaw=0;a.aimPitch=0;a.vel.set(0,0,0);
 const release=()=>{G.projectiles.throwBomb(a);const b=G.projectiles.bombs.at(-1);assert.equal(b.s3Resolved.spec.id,'autobomb');return b;};
 return{f,G,a,p:G.projectiles,release};
}

test('retained Autobomb launch consumes its own source Y clamp, axis inheritance and AP57 throw-speed tier',async()=>{
 const {f,G,a,p,release}=await world();
 for(const [ap,forward]of [[0,67.2],[57,100.8]]){
  a.s3.loadout=ap===57?Array.from({length:3},()=>({main:'subPower',subs:Array(3).fill('subPower')})):f.emptyLoadout();a.s3RefreshGear();a.vel.set(3,7,5);
  const b=release();near(b.vel.x,4.8,'source XRate=1.6');near(b.vel.z,forward+10,'source ZRate=2');near(b.vel.y,33.6,'source YRate=4 capped at .32/F');
  p.clear();a.vel.set(0,0,0);a.aimPitch=-1.05;const down=release();near(down.vel.y,-24,'source YWorldMin=-.4/F');p.clear();a.aimPitch=0;
 }
});

test('Autobomb wall/ceiling bounces never arm a fuse or scan until an actual floor landing',async()=>{
 const {f,G,p,release}=await world(),b=release(),V=f.THREE.Vector3;
 b.pos.set(0,100,0);
 let surface='wall';G.physics.segment=(_from,to,h)=>{h.hit=!!surface;if(h.hit){h.point.copy(to);h.normal.copy(surface==='wall'?new V(-1,0,0):surface==='ceiling'?new V(0,-1,0):new V(0,1,0));}return h;};
 b.vel.set(10,5,0);p._updateBombs(STEP);assert.equal(b.fuse,-1);assert.equal(b.s3Auto,undefined,'wall alone cannot scan');assert.ok(b.vel.x<0);
 surface='ceiling';b.vel.set(0,10,0);p._updateBombs(STEP);assert.equal(b.fuse,-1);assert.equal(b.s3Auto,undefined,'ceiling alone cannot scan');assert.ok(b.vel.y<0);
 surface=null;for(let i=0;i<75;i++)p._updateBombs(STEP);assert.ok(p.bombs.includes(b),'no spurious 60F airborne detonation');assert.equal(b.fuse,-1);
 surface='floor';p._updateBombs(STEP);assert.equal(b.s3Mode,'chasing');assert.ok(b.s3Auto,'floor starts the single scan origin');
});

test('retained Autobomb owner and ghost apply the same extracted airborne XZ resistance at 30/60/120 render Hz',async()=>{
 let expected;
 for(const hz of [30,60,120]){
  const {f,G,a,p,release}=await world(),b=release();b.pos.set(0,100,0);b.vel.set(3,0,60);
  const remote=f.make('blaster');remote.remote=true;
  p.ghostBomb(remote,'bomb',0,100,0,3,0,60,null,'autobomb',0);const ghost=p.bombs.at(-1);
  assert.equal(ghost.s3Resolved,undefined);assert.equal(ghost.s3GhostResolved.spec.id,'autobomb');
  const clock=new f.FixedClock();for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>{G.time+=dt;p._updateBombs(dt);});
  near(b.vel.z,60*Math.pow(1-.05866,60),'source per-frame resistance');near(ghost.vel.z,b.vel.z,'replica flight resistance');
  const actual=[...b.pos.toArray(),...b.vel.toArray()];if(expected)actual.forEach((v,i)=>near(v,expected[i],`render cadence coordinate ${i}`));else expected=actual;
  assert.equal(b.fuse,-1);assert.equal(ghost.s3Resolved,undefined,'flight cannot promote combat authority');
 }
});

test('a chasing Autobomb keeps supported floor clearance, then falls off a ledge and lands without a second scan',async()=>{
 const {f,G,a,p,release}=await world(),b=release(),V=f.THREE.Vector3;
 const target=f.make();target.team=1;target.pos.set(0,0,10);G.actors=[a,target];
 G.physics.segment=(from,to,h)=>{h.hit=from.y>=0&&to.y<0;if(h.hit){h.point.copy(from).lerp(to,from.y/(from.y-to.y));h.normal.set(0,1,0);}return h;};
 let supported=true;G.physics.raycast=(o,d,len,h)=>{h.hit=supported&&d.y<0&&o.y>=0&&o.y+d.y*len<=0;if(h.hit){h.point.set(o.x,0,o.z);h.normal.set(0,1,0);}return h;};
 b.pos.set(0,.001,0);b.vel.set(0,-1,0);p._updateBombs(STEP);const scan=b.s3Auto;assert.ok(scan);
 for(let i=0;i<50;i++)p._updateBombs(STEP);assert.ok(b.pos.z>0);near(b.pos.y,.21,'supported walking clearance');
 supported=false;const height=b.pos.y;p._updateBombs(STEP);assert.equal(scan.grounded,false);assert.ok(b.vel.y<0&&b.pos.y<height,'walked-off body has gravity');
 G.physics.segment=(_from,to,h)=>{h.hit=true;h.point.copy(to);h.normal.set(0,1,0);return h;};p._updateBombs(STEP);
 assert.ok(b.s3Auto===scan,'falling does not reacquire a different target or reset chase time');assert.equal(scan.grounded,true);near(b.vel.y,0,'landing removes downward velocity');
});

test('a live target inside the community ~0.3-line approach range arms the warning without borrowing the .65 death parameter',async()=>{
 const {f,G,a,p,release}=await world(),b=release(),target=f.make();target.team=1;target.pos.set(0,0,1.3);G.actors=[a,target];
 G.physics.segment=(from,to,h)=>{h.hit=from.y>=0&&to.y<0;if(h.hit){h.point.copy(from).lerp(to,from.y/(from.y-to.y));h.normal.set(0,1,0);}return h;};
 G.physics.raycast=(o,d,len,h)=>{h.hit=d.y<0&&o.y>=0&&o.y+d.y*len<=0;if(h.hit){h.point.set(o.x,0,o.z);h.normal.set(0,1,0);}return h;};
 b.pos.set(0,.001,0);b.vel.set(0,-1,0);p._updateBombs(STEP);
 for(let i=0;i<29;i++)p._updateBombs(STEP);assert.equal(b.fuse,-1,'BeforeRotateFrame is not bypassed');p._updateBombs(STEP);
 assert.equal(b.s3Auto.phase,'countdown');assert.ok(b.fuse>.9&&b.fuse<=1);near(b.pos.z,0,'already-near target does not require walking to the separate death threshold');
 assert.equal(b.s3Resolved.spec.deathTargetApproachDistance,.65);assert.equal(b.s3Resolved.spec.approachDistanceStatus,'community-measured-approximate');
});
