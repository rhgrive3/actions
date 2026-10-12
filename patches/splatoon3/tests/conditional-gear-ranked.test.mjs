import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {abilityPoints,emptyLoadout} from '../runtime/gear.mjs';
const json=x=>JSON.parse(JSON.stringify(x));
async function world(id,mode){
 const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:`
 export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
 export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';`});
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,G:f.G,structuredClone});
 const a=f.make();Object.assign(a,{nid:1,owner:'owner',slot:0,invuln:0});
 const ranked=new f.RankedEngine(mode,{id:'gear-ranked',zones:[{center:[0,0,0],size:[8,8]}],clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]}});
 const m={actors:[a],local:a,follower:id!=='owner',mode,ranked,rankedGains:[0,0],rankedBarrierHits:[],state:'playing',duration:300,time:300,playing:()=>true,canRespawn:()=>false,setState(state){this.state=state;}};
 let packet;const session={myId:id,hostId:'owner',isHost:id==='owner',_members:new Set(['owner','viewer']),tr:{sendTo(){},broadcast:p=>{packet=json(p);}}};
 const nm=new f.NetMatch(session,{id:'ranked-gear',mode});nm.bind(m);f.G.netm=nm;f.G.match=m;f.G.actors=[a];a.update(0);
 return {f,a,m,nm,send(){f.G.time+=1/60;nm._sendTick();return json(packet);}};
}

function advance(w,seconds){for(let i=0;i<seconds*60;i++){w.f.G.time+=1/60;w.nm.update(1/60);if(!w.m.paused){w.m.time-=1/60;if(w.a.remote)w.nm.applyRemote(w.a,1/60);else w.a.update(1/60);}}}
for(const mode of ['zones','tower','rainmaker','clams'])test(`${mode}: remaining Comeback clock is preserved through actual ranked host migration`,async()=>{
 const o=await world('owner',mode),r=await world('viewer',mode);
 o.f.G.level.spawnPads=[new o.f.THREE.Vector3(),new o.f.THREE.Vector3()];o.a.s3.loadout=emptyLoadout();o.a.s3.loadout[0].main='comeback';o.a.s3RefreshGear();
 const enemy=o.f.make();enemy.team=1;o.a.invuln=0;o.a.splat(enemy);o.a.respawn();advance(o,8);o.m.ranked.time=o.m.time;
 let p;for(let i=0;i<4;i++)p=o.send();assert.ok(p.rk&&p.gg&&p.gc);
 r.m.time=o.m.time;r.nm.onMessage('owner',json(p));r.nm._peer('owner').tr=p.ts;r.nm._sample(r.a,p.ts,0);r.nm.applyRemote(r.a,1/60);advance(r,2);
 r.nm.s.hostId='viewer';r.nm.s.isHost=true;r.nm.onLeave('owner',true);assert.ok(Math.abs(r.a.s3.conditionalGear.comeback-10)<1e-8);
 r.m.paused=true;advance(r,3);r.m.paused=false;advance(r,10);assert.equal(r.a.s3.conditionalGear.comeback,0);assert.equal(r.a.s3.modifiers.runSpeed,1);
});
