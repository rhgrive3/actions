import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from './source-fixture.mjs';
import {adaptSource} from '../adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {adaptNetworkSource} from '../../network-replication/adapter.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';

const site=process.env.INKWAVE_BOMB_FUSE_SITE;
const compose=(rel,s)=>adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,s)))));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function world(ghost=false,{baseline=false}={}){
 const read=rel=>fs.readFileSync(path.join(site,rel),'utf8');
 const adapt=baseline?(rel,s)=>compose(rel,s).replace('if (b.fuse >= 0 && fuseContact)', 'if (b.fuse >= 0)'):site?(rel)=>read(rel):compose;
 const f=await fixture({adapt,adaptRuntime:site&&!baseline?(rel)=>read(rel):(_r,s)=>s});
 f.installSubSpecialFidelity(f,f.profile);
 const {G,THREE}=f,V=(...v)=>new THREE.Vector3(...v);
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.boss=null;G.actors=[];G.audio=null;G.fx=null;G.netm=null;
 G.level={blocks:[],faces:[],queryBlocks(_a,_b,_c,_d,out){out.length=0;this.blocks.forEach((_b,i)=>out.push(i));return out;}};
 G.physics=new f.Physics(G.level);
 const box=(c,h)=>G.level.blocks.push({id:G.level.blocks.length,solid:true,grate:false,center:V(...c),half:V(...h),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[]});
 box([0,-.5,0],[2,.5,2]);
 const ps=G.projectiles=new f.Projectiles(G.scene),a=f.make();ps.throwBomb(a);const b=ps.bombs[0];
 b.pos.set(0,.21,0);b.vel.set(0,0,0);b.fuse=.4;b.s3FuseNormal=V(0,1,0);b.beepT=.2;
 let exploded=0,released=0,tick=0;const release=ps._releaseBomb;ps._releaseBomb=function(x){released++;return release.call(this,x);};ps._explodeBomb=()=>exploded++;
 if(ghost){b.ghost=true;b._netPeer={sim:-1,tr:0,lastTs:0};b._netBornTick=0;b._netBorn=0;b._netSteps=0;}
 const step=()=>{if(ghost)b._netPeer.sim=tick;ps._updateBombs(STEP);tick++;};
 return{...f,ps,b,box,step,V,result:()=>({exploded,released})};
}

for(const ghost of [false,true])for(const hz of [30,60,120])test(`#723 ${ghost?'ghost':'owner'} ${hz}Hz contact, flight pause and resumed remaining fuse`,async()=>{
 const w=await world(ghost),clock=new FixedClock();
 for(let i=0;i<hz/10;i++)clock.advance(1/hz,w.step);
 near(w.b.fuse,.3);const remaining=w.b.fuse,beep=w.b.beepT;
 w.b.pos.set(10,100,0);w.b.vel.set(0,0,0);
 for(let i=0;i<hz/2;i++)clock.advance(1/hz,w.step);
 near(w.b.fuse,remaining);near(w.b.beepT,beep);assert.equal(w.result().exploded,0);
 w.b.pos.set(0,.21,0);w.b.vel.set(0,0,0);
 for(let i=0;i<17;i++)w.step();assert.equal(w.result().exploded,0);near(w.b.fuse,STEP);
 w.step();assert.deepEqual(w.result(),{exploded:1,released:1});assert.equal(w.ps.bombs.length,0);
});

test('first floor/wall contact arms once; separation pauses instead of resetting the fuse',async()=>{
 for(const wall of [false,true]){
  const w=await world();if(wall)w.box([1,2,0],[.1,2,2]);
  w.b.fuse=-1;delete w.b.s3FuseNormal;
  if(wall){w.b.pos.set(.89,2,0);w.b.vel.set(3,0,0);}else{w.b.pos.set(0,.01,0);w.b.vel.set(0,-1,0);}
  w.step();near(w.b.fuse,1-STEP);assert.ok(w.b.s3FuseNormal);
  w.b.pos.set(10,100,0);w.b.vel.set(0,0,0);w.step();near(w.b.fuse,1-STEP);
  w.b.pos.set(0,.01,0);w.b.vel.set(0,-1,0);w.step();near(w.b.fuse,1-2*STEP);
 }
});

test('unarmed free flight and frozen peer advance no fuse; water still releases',async()=>{
 const w=await world(true);w.b.fuse=-1;delete w.b.s3FuseNormal;w.b.pos.set(10,100,0);w.b.vel.set(0,0,0);
 w.step();near(w.b.fuse,-1);const age=w.b.age,pos=w.b.pos.clone();
 for(let i=0;i<30;i++)w.ps._updateBombs(STEP);near(w.b.age,age);near(w.b.pos.distanceTo(pos),0);
 w.b.pos.y=w.PLAYER.waterY-2;w.step();assert.deepEqual(w.result(),{exploded:0,released:1});
});

test('old unconditional fuse is an executable negative control on the same native method',async()=>{
 const w=await world(false,{baseline:true});w.b.pos.set(10,100,0);w.b.vel.set(0,0,0);
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
 assert.match(raw,/if \(b.fuse >= 0\) \{\s+b.fuse -= dt;/);
 // Remove only the new gate in private source; keep real empty-space Physics.
 for(let i=0;i<24;i++)w.step();assert.equal(w.result().exploded,1);
});

test('a real ledge exit pauses and uninterrupted floor support spends exactly 60 ticks',async()=>{
 const ledge=await world();ledge.b.pos.set(1.99,.21,0);ledge.b.vel.set(2,0,0);
 for(let i=0;i<20;i++)ledge.step();near(ledge.b.fuse,.4);assert.equal(ledge.result().exploded,0);
 const floor=await world();floor.b.fuse=1;
 for(let i=0;i<59;i++)floor.step();near(floor.b.fuse,STEP);assert.equal(floor.result().exploded,0);
 floor.step();assert.deepEqual(floor.result(),{exploded:1,released:1});
});

test('ghost catch-up consumes owner contact ticks once, independent of recipient dt',async()=>{
 for(const dt of [1/30,1/60,1/120]){
  const w=await world(true);w.b._netPeer.sim=11;w.ps._updateBombs(dt);near(w.b.fuse,.2);assert.equal(w.b._netSteps,12);
  w.b.pos.set(10,100,0);w.b.vel.set(0,0,0);w.b._netPeer.sim=41;w.ps._updateBombs(dt);near(w.b.fuse,.2);assert.equal(w.b._netSteps,42);
  w.b.pos.set(0,.21,0);w.b.vel.set(0,0,0);w.b._netPeer.sim=53;w.ps._updateBombs(dt);assert.deepEqual(w.result(),{exploded:1,released:1});
 }
});
