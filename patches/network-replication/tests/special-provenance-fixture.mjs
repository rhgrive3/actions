import {setup} from './contact-provenance-fixture.mjs';
export async function specialSetup(t){
 const x=await setup(t);x.remote.weapon={...x.remote.weapon,special:'krakenRoyale'};
 x.active=(ts=1000,at=100,extra={})=>x.tick(ts,at,{u:100+Math.round((ts-1000)*60),a:[x.f.packActor(x.remote,{f:8192|1|16})],...extra});
 x.sample=()=>{x.nm.update(1/60);x.nm.applyRemote(x.remote,1/60);};
 x.specialHit=(extra={})=>x.hit({w:'krakenRoyale',d:10,...extra});
 x.use=(ts=1000)=>[ts,'ev','special:use',{actor:{n:17},id:'krakenRoyale',pos:[0,2,0],dir:[0,0,1]}];
 return x;
}
