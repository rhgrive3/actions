import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {fixture as builtFixture} from '../../../scripts/weapons-fixture.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {adaptSource} from '../adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {adaptNetworkSource} from '../../network-replication/adapter.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const DT=1/60;
async function setup({baseline=false,ghost=false}={}){
 const adapt=(rel,code)=>{let s=adaptSource(rel,code);if(baseline&&rel==='src/game/weapons.js')s=s.replace('if (c.t <= c.dur + 1e-10) {','if (c.t < c.dur - 0.3) {').replace('if (c.t + 1e-10 >= c.dur) {','if (c.t >= c.dur) {');return adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,s))));};
 const site=process.env.INKWAVE_STORM_LIFETIME_SITE;
 const f=site&&!baseline?await builtFixture({site,fidelity:true,network:true}):await fixture({adapt});
 const install=f.installSubSpecialFidelity||(await import(pathToFileURL(path.join(site,'patches/splatoon3/runtime/sub-special-fidelity.mjs')).href)).installSubSpecialFidelity;install(f,f.profile);
 const {G,THREE}=f,owner=f.make('charger'),ps=G.projectiles=f.projectiles||new f.Projectiles(new THREE.Scene()); if(ghost) owner.remote=true;
 let frame=0,paint=0;const hits=[],ends=[];G.physics.los=()=>true;G.physics.raycast=(o,_d,_r,h)=>{h.hit=true;h.point.copy(o).setY(0);h.normal.set(0,1,0);return h;};G.paint.splat=()=>{paint++;return 0;};G.actors=[];
 ps._spawnCloud({owner,team:0,pos:new THREE.Vector3(),dir:new THREE.Vector3(),_netBorn:0,_netBornTick:0,_netSteps:1});const c=ps.clouds[0];c.ghost=ghost;if(ghost)c._netPeer={sim:0,tr:0,lastTs:100};
 const victim={team:1,alive:true,remote:false,pos:c.group.position.clone().add(new THREE.Vector3(0,-2,0)),damage(amount,attacker,source){hits.push({frame,amount,attacker,source});return false;}};G.actors=[victim];f.on('storm:end',()=>ends.push(frame));
 function step(){frame++;G.time+=DT;if(ghost)c._netPeer.sim=frame-1;ps._updateClouds(DT);}
 return {...f,ps,c,victim,owner,hits,ends,step,get paint(){return paint;},get frame(){return frame;}};
}
test('#563 removes the actual fade-gated early cutoff without extending the480F cloud',async()=>{
 const before=await setup({baseline:true});for(let i=0;i<482;i++)before.step();assert.ok(before.hits.at(-1).frame<480);assert.ok(before.hits.length<480);
 const f=await setup();for(let i=0;i<480;i++)f.step();assert.equal(f.hits.length,480);for(const frame of [461,462,479,480])assert.ok(f.hits.some(h=>h.frame===frame));assert.equal(f.ps.clouds.length,0);assert.deepEqual(f.ends,[480]);assert.ok(Math.abs(f.hits.reduce((n,h)=>n+h.amount,0)-192)<1e-9);f.step();assert.equal(f.hits.length,480);
 console.log(JSON.stringify({baselineLastDamageFrame:before.hits.at(-1).frame,baselineDamageCalls:before.hits.length,correctedDamageCalls:f.hits.length,endFrame:f.ends[0]}));
});
test('#563 final rain retains team/alive/remote/range/height/LOS eligibility',async()=>{
 for(const reject of ['team','dead','remote','outside','above','cover']){const f=await setup();for(let i=0;i<479;i++)f.step();const count=f.hits.length;
  if(reject==='team')f.victim.team=0;if(reject==='dead')f.victim.alive=false;if(reject==='remote')f.victim.remote=true;if(reject==='outside')f.victim.pos.x=11;if(reject==='above')f.victim.pos.y=f.c.group.position.y+1;if(reject==='cover')f.G.physics.los=()=>false;
  f.step();assert.equal(f.hits.length,count,reject);assert.equal(f.ps.clouds.length,0);
 }
});
test('#563 replayed cloud applies final tick to recipient only and never paints remotely',async()=>{
 const f=await setup({ghost:true});for(let i=0;i<480;i++)f.step();assert.equal(f.hits.length,480);assert.equal(f.paint,0);assert.deepEqual(f.ends,[480]);assert.equal(f.ps.clouds.length,0);
 const own=await setup();for(let i=0;i<480;i++)own.step();assert.ok(own.paint>0);assert.equal(own.hits.at(-1).source,'storm');assert.equal(own.hits.at(-1).attacker,own.owner);
});
test('#563 fixed-clock30/60/120/144Hz keep the same final tick and damage',async()=>{
 for(const hz of [30,60,120,144]){const f=await setup(),clock=new FixedClock();for(let i=0;i<hz*9;i++)clock.advance(1/hz,()=>f.step());assert.equal(f.hits.length,480);assert.deepEqual(f.ends,[480]);}
});
test('#563 source reference duration endpoints retain480/540/600 damaging ticks',async()=>{
 for(const frames of [480,540,600]){const f=await setup();f.c.dur=frames/60;for(let i=0;i<frames+2;i++)f.step();assert.equal(f.hits.length,frames);assert.deepEqual(f.ends,[frames]);assert.equal(f.ps.clouds.length,0);}
});
