import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const DT=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function setup(underwater=60){
 const f=await fixture({fidelity:true,network:true}),a=f.make('charger'),r=a.weaponRunner;
 // #291 is explicitly an own-ink Squid keep. The production CPU paint fixture
 // begins with an unpainted floor, which never marks a Squid as submerged and
 // therefore cannot admit the pinned keep state. Paint actual turf rather than
 // forging a stored-charge flag or skipping the real Actor._surface probe.
 const owned = f.G.paint.splat(new f.THREE.Vector3(a.pos.x,a.pos.y+.07,a.pos.z),3,a.team,{seed:.5});
 assert.ok(owned>0,'precondition: a real own-ink patch exists beneath the Charger');
 f.G.actors=[a];a.intent.fire=true;
 const step=()=>{f.G.time+=DT;a.update(DT);f.projectiles._updateBeams(DT);f.projectiles.syncSights();};
 for(let i=0;i<80;i++)step();assert.equal(r.charging,true);
 a.intent.squid=true;for(let i=0;i<underwater;i++)step();assert.ok(r.s3Stored);
 assert.equal(a.form,'squid');return {f,a,r,step};
}
for(const underwater of [1,30,60])test(`#291 ${underwater}F underwater cannot spend the31F resurfacing clock`,async()=>{
 const {f,a,r,step}=await setup(underwater);a.intent.squid=false;
 for(let frame=1;frame<=31;frame++){
  step();assert.equal(f.fires.length,0,`no shot during held frame${frame}`);
  if(frame<31){assert.ok(r.s3Stored,`frame${frame}: still gated`);assert.equal(r.charging,false);}
  else{assert.equal(r.s3Stored,null);assert.equal(r.charging,true);near(r.charge,1);}
 }
 a.lastFire=0;const paid=a.ink;a.intent.fire=false;step();assert.equal(f.fires.length,0,'normal1F release gap retained');
 step();assert.equal(f.fires.length,1);near(a.ink,paid);f.projectiles.clear();
});
test('#291 laser starts at25F independently of31F fire readiness, including render sync',async()=>{
 const {f,a,r,step}=await setup(60);a.intent.squid=false;
 for(let frame=1;frame<=31;frame++){
  step();const visible=!!f.projectiles.sights.get(a)?.visible;
  assert.equal(visible,frame>=25,`laser at frame${frame}`);
  if(frame>=25&&frame<31)assert.equal(r.charging,false,'warning is not a firing-state restore');
 }
 f.projectiles.clear();
});
test('#291 release/repress and fireBuffer cannot turn a blocked keep into an early full shot',async()=>{
 for(const releaseAt of [1,5,24,30]){
  const {f,a,r,step}=await setup(60);a.intent.squid=false;
  for(let frame=1;frame<releaseAt;frame++)step();
  a.fireBuffer=1;a.intent.fire=false;step();assert.equal(r.s3Stored,null);
  assert.equal(r.charge,0);assert.equal(f.fires.length,0);
  a.intent.fire=true;for(let i=0;i<5;i++)step();assert.ok(r.charge<1,'only a fresh partial charge may begin');
  assert.equal(f.fires.length,0);f.projectiles.clear();
 }
});

test('#291 release at31F enters the existing1F release owner without a second debit',async()=>{
 const {f,a,r,step}=await setup(60);a.intent.squid=false;
 for(let i=0;i<30;i++)step();a.intent.fire=false;a.fireBuffer=1;a.lastFire=0;
 const paid=a.ink;step();assert.equal(r.s3Stored,null);assert.equal(r.s3ReleaseHold,true);assert.equal(f.fires.length,0);
 step();assert.equal(f.fires.length,1);assert.equal(f.fires[0].charge,1);near(a.ink,paid);f.projectiles.clear();
});
test('#291 re-submerge resets both surface clocks but retains the75F keep owner',async()=>{
 const {f,a,r,step}=await setup(30);a.intent.squid=false;
 for(let i=0;i<27;i++)step();assert.equal(f.projectiles.sights.get(a).visible,true);
 a.intent.squid=true;step();assert.equal(f.projectiles.sights.get(a).visible,false);near(r.s3Stored.remaining,74/60);
 for(let i=0;i<40;i++)step();a.intent.squid=false;
 for(let frame=1;frame<=31;frame++){
  step();assert.equal(!!f.projectiles.sights.get(a)?.visible,frame>=25);
  assert.equal(r.charging,frame>=31);assert.equal(f.fires.length,0);
 }
 f.projectiles.clear();
});
test('#291 native network packet carries the25F warning without granting owner fire authority',async()=>{
 const {f,a,r,step}=await setup(60);a.nid=1;a.intent.squid=false;let packet;
 a.owner='owner';
 const remote=f.make('charger');remote.nid=1;remote.owner='owner';
 const members=new Map([['host','Host'],['owner','Owner'],['viewer','Viewer']]);
 const sender=new f.NetMatch({myId:'owner',hostId:'host',isHost:false,_members:members,
  tr:{broadcast:m=>{packet=JSON.parse(JSON.stringify(m));},sendTo(){}}},{id:'issue-291-resurface-clock',map:'map',difficulty:'normal'});
 const receiver=new f.NetMatch({myId:'viewer',hostId:'host',isHost:false,_members:members,
  tr:{broadcast(){},sendTo(){}}},{id:'issue-291-resurface-clock',map:'map',difficulty:'normal'});
 sender.bind({actors:[a],state:'playing',time:180});
 receiver.bind({actors:[remote],state:'playing',time:180});
 try{
  for(let frame=1;frame<=31;frame++){
   step();sender._sendTick();
   // This fixture can run several simulated frames inside one timer quantum.
   // Keep each production-shaped owner packet on a distinct simulated tick.
   packet.ts=1000+frame*DT;
   const flags=packet.a[0][10];assert.equal(!!(flags&f.NET_FLAGS.charging),frame>=25,`packet frame${frame}`);
   receiver.onMessage('owner',packet);
   const peer=receiver._peer('owner');peer.tr=packet.ts;
   receiver._sample(remote,packet.ts,0);receiver.applyRemote(remote,DT);
   assert.equal(remote.weaponRunner.charging,frame>=25,`remote presentation follows owner warning at frame${frame}`);
   if(frame<31)assert.equal(r.charging,false,'local release authority remains gated');
  }
  assert.equal(f.fires.length,0);
 } finally {receiver.dispose();sender.dispose();f.projectiles.clear();}
});
