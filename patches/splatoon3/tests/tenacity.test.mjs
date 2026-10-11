import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {advanceTenacity} from '../runtime/tenacity.mjs';
import {emptyLoadout,abilityAllowed} from '../runtime/gear.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Tenacity is a head-only main and not stackable secondary AP',()=>{for(let p=0;p<3;p++)for(let s=0;s<4;s++)assert.equal(abilityAllowed('tenacity',p,s),p===0&&s===0);});
test('actual Actor Tenacity reflects current living deficit, SCU independence, no turf and 30/60/120 Hz',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true});
 for(const hz of [30,60,120])for(const scu of [false,true]){
  const a=f.make(),e1=f.make(),e2=f.make();e1.team=e2.team=1;f.G.actors=[a,e1,e2];f.G.match={state:'playing',playing:()=>true,actors:f.G.actors};
  a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='tenacity';if(scu)a.s3.loadout[1].main='specialCharge';a.s3RefreshGear();a.special=0;
  const turf=a.stats.turf;for(let i=0;i<hz;i++)a.update(1/hz);
  near(a.specialFrac(),3.24/f.WEAPONS.shooter.specialCost);assert.equal(a.stats.turf,turf);
  const before=a.special;e1.s3Disconnected=true;for(let i=0;i<hz;i++)a.update(1/hz);near(a.special,before);e1.s3Disconnected=false;e1.alive=false;for(let i=0;i<hz;i++)a.update(1/hz);near(a.special,before);
 }
});
test('Tenacity cannot refill active special, dead/remote actor, pause or completed match',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true});
 const a=f.make(),e1=f.make(),e2=f.make();e1.team=e2.team=1;f.G.actors=[a,e1,e2];const m=f.G.match={state:'playing',canRespawn:()=>false,playing(){return this.state==='playing';},actors:f.G.actors};
 a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='tenacity';a.s3RefreshGear();a.special=0;
 a.specialActive={id:'test'};near(advanceTenacity(a,1,f),0);a.specialActive=null;
 for(const [target,key,value]of [[a,'remote',true],[a,'alive',false],[m,'paused',true],[m,'attract',true],[m,'state','finish']]){const old=target[key];target[key]=value;a.update(1/60);near(a.special,0);target[key]=old;}
});

test('Tenacity owner gauge crosses real JSON snapshots without remote duplicate accrual',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true});
 const a=f.make(),b=f.make(),e1=f.make(),e2=f.make();
 Object.assign(a,{nid:1,owner:'owner',invuln:0});Object.assign(b,{nid:1,owner:'owner',invuln:0});e1.team=e2.team=1;
 a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='tenacity';a.s3RefreshGear();a.special=0;
 f.G.actors=[a,e1,e2];f.G.match={state:'playing',playing:()=>true,actors:f.G.actors};
 for(let i=0;i<60;i++)a.update(1/60);near(a.special,3.24);
 let packet;const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,tr:{broadcast:d=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'tenacity'});
 sender.bind({actors:[a],state:'playing',time:180});sender._sendTick();
 const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false},{id:'tenacity'});
 receiver.bind({actors:[b],state:'playing',time:180});receiver.onMessage('owner',packet);receiver._peer('owner').tr=packet.ts;receiver._sample(b,packet.ts,0);receiver.applyRemote(b,1/60);
 assert.equal(b.special,Math.round(a.special),'existing snapshot preserves integer gauge precision');assert.equal(b.specialCost(),a.specialCost());
 b.s3.loadout=emptyLoadout();b.s3.loadout[0].main='tenacity';b.s3RefreshGear();const before=b.special;
 f.G.actors=[b,e1,e2];f.G.match={state:'playing',playing:()=>true,actors:f.G.actors};
 assert.equal(b.remote,true);for(let i=0;i<60;i++)b.update(1/60);near(b.special,before);assert.equal(b.stats.turf,0);
});
