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

for(const mode of ['zones','tower','rainmaker','clams'])test(`${mode}: shipped ranked snapshots activate Last Ditch only after current-host restore`,async()=>{
 const o=await world('owner',mode),r=await world('viewer',mode);
 o.a.s3.loadout=emptyLoadout();o.a.s3.loadout[0].main='lastDitchEffort';o.a.s3RefreshGear();o.m.ranked.setCount(1,30);o.m.ranked.update(1/60);o.a.s3RefreshGear();assert.equal(o.a.s3.abilityPoints.inkSaverMain,18);
 let p;for(let i=0;i<4;i++)p=o.send();assert.ok(p.rk&&p.gg);
 r.nm.onMessage('owner',json(p));r.nm._peer('owner').tr=p.ts;r.nm._sample(r.a,p.ts,0);r.nm.applyRemote(r.a,1/60);r.a.s3RefreshGear();assert.equal(r.a.s3.abilityPoints.inkSaverMain,18);
 r.m.ranked.counts[1]=1;r.a.s3RefreshGear();assert.equal(r.a.s3.abilityPoints.inkSaverMain||0,0,'unrestored count mutation is not authoritative');r.m.ranked.counts[1]=30;
 r.nm.s.hostId='viewer';r.nm.s.isHost=true;r.nm.onLeave('owner',true);r.a.s3RefreshGear();assert.equal(r.a.s3.abilityPoints.inkSaverMain,18);
 const old=json(p);old.rk.state.counts[1]=0;old.rk.state.revision+=100;r.nm.onMessage('owner',old);assert.equal(r.m.ranked.counts[1],30);
});
