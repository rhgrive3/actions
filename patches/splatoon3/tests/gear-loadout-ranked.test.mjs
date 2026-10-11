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
 f.context.structuredClone=structuredClone;f.installRanked({...f.installedRuntime,G:f.G,structuredClone});
 const a=f.make();Object.assign(a,{nid:1,owner:'owner',slot:0,invuln:0});
 const ranked=new f.RankedEngine(mode,{id:'gear-ranked',zones:[{center:[0,0,0],size:[8,8]}],clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]}});
 const m={actors:[a],local:a,follower:id!=='owner',mode,ranked,rankedGains:[0,0],rankedBarrierHits:[],state:'playing',duration:300,time:300,playing:()=>true,canRespawn:()=>false,setState(state){this.state=state;}};
 let packet;const session={myId:id,hostId:'owner',isHost:id==='owner',_members:new Set(['owner','viewer']),tr:{sendTo(){},broadcast:p=>{packet=json(p);}}};
 const nm=new f.NetMatch(session,{id:'ranked-gear',mode});nm.bind(m);f.G.netm=nm;f.G.match=m;f.G.actors=[a];a.update(0);
 return {f,a,m,nm,send(){f.G.time+=1/60;nm._sendTick();return json(packet);}};
}
for(const mode of ['zones','tower','rainmaker','clams'])test(`${mode}: ranked objective snapshots and gear survive real owner-to-host takeover`,async()=>{
 const o=await world('owner',mode),r=await world('viewer',mode);
 o.a.s3.loadout=emptyLoadout();for(const p of o.a.s3.loadout){p.main='runSpeed';p.subs.fill('runSpeed');}o.a.s3RefreshGear();o.a.special=43;
 o.m.ranked.setCount(0,55);o.m.ranked.setCount(1,72);
 let p;for(let i=0;i<4;i++)p=o.send();assert.ok(p.rk&&p.gg,'both objective and fixed-gear sidecars are in the actual wire');
 r.nm.onMessage('owner',json(p));r.nm._peer('owner').tr=p.ts;r.nm._sample(r.a,p.ts,0);r.nm.applyRemote(r.a,1/60);
 assert.deepEqual(json(r.m.ranked.counts),[55,72]);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,57);
 r.nm.s.hostId='viewer';r.nm.s.isHost=true;r.nm.onLeave('owner',true);
 assert.equal(r.a.owner,'viewer');assert.equal(r.a.remote,false);assert.equal(r.m.follower,false);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,57);assert.equal(r.a.special,43);
 assert.deepEqual(json(r.m.ranked.counts),[55,72]);r.a.intent.move.set(0,0,1);r.a.vel.set(0,0,0);r.a.grounded=true;for(let i=0;i<120;i++)r.a._horizontal(1/60,false,false);
 assert.ok(Math.abs(r.a.vel.z-r.f.PLAYER.runSpeed*o.a.s3.modifiers.runSpeed)<1e-8);
 const old=json(p);old.ts+=100;old.u+=6000;r.nm.onMessage('owner',old);assert.equal(r.a.owner,'viewer');assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,57);
});
