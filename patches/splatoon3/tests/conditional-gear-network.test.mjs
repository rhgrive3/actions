import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
const json=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function world(id){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {Match} from './inkwave-public/src/game/match.js';"});
 f.profile.flow.threshold=1e6;
 f.G.level={...f.G.level,spawnPads:[new f.THREE.Vector3(),new f.THREE.Vector3()],blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const a=f.make();Object.assign(a,{nid:1,owner:'owner',invuln:0});
 let packet;const session={myId:id,hostId:'owner',isHost:id==='owner',tr:{sendTo(){},broadcast:d=>{packet=json(d);}}};
 const nm=new f.NetMatch(session,{id:'gear-match'}),m={actors:[a],state:'playing',time:180,duration:180,playing:()=>true,canRespawn:()=>false};
 nm.bind(m);f.G.netm=nm;f.G.match=m;f.G.actors=[a];
 return{f,a,nm,m,send(){f.G.time+=1/60;nm._sendTick();return json(packet);}};
}
function receive(w,p,from='owner',sample=true){w.nm.onMessage(from,json(p));if(sample){const peer=w.nm._peer(from);peer.tr=Math.max(peer.tr||0,p.ts);w.nm._sample(w.a,peer.tr,0);w.nm.applyRemote(w.a,1/60);}}
function adopt(w){w.nm.s.hostId='viewer';w.nm.s.isHost=true;w.nm.onLeave('owner',true);}
function head(w,id){w.a.s3.loadout=emptyLoadout();w.a.s3.loadout[0].main=id;w.a.s3RefreshGear();}
function enemy(w){const a=w.f.make();a.team=1;a.invuln=0;return a;}
function advance(w,seconds,hz=60){for(let i=0;i<Math.round(seconds*hz);i++){const dt=1/hz;w.f.G.time+=dt;w.nm.update(dt);if(!w.m.paused){w.m.time-=dt;if(w.a.remote)w.nm.applyRemote(w.a,dt);else w.a.update(dt);}}}
function comeback(w){w.a.splat(enemy(w));w.a.respawn();}
for(const hz of [30,60,120])test(`Comeback JSON handoff ages once at ${hz}Hz, including waiting and pause`,async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);near(o.a.s3.conditionalGear.comeback,20);advance(o,8,hz);r.m.time=o.m.time;receive(r,o.send());
 near(r.a.s3.conditionalGear.comeback,12);advance(r,2,hz);adopt(r);near(r.a.s3.conditionalGear.comeback,10);assert.ok(r.a.s3.modifiers.runSpeed>1);
 advance(r,5,hz);near(r.a.s3.conditionalGear.comeback,5);r.m.paused=true;advance(r,5,hz);near(r.a.s3.conditionalGear.comeback,5);r.m.paused=false;advance(r,5,hz);near(r.a.s3.conditionalGear.comeback,0);near(r.a.s3.modifiers.runSpeed,1);
});
test('Opening transfers real earned extensions as a deadline, never restarts a window',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'openingGambit');enemy(o).splat(o.a);enemy(o).splat(o.a);assert.equal(o.a.s3.conditionalGear.openingCredits,2);near(o.a.s3.conditionalGear.openingEnd,60);
 advance(o,50);r.m.time=o.m.time;const p=o.send();receive(r,p);near(r.a.s3.conditionalGear.openingEnd,60);advance(r,2);adopt(r);near(r.a.s3.conditionalGear.openingEnd,60);advance(r,8);near(r.a.s3.modifiers.runSpeed,1);
 p.ts+=100;p.u+=6000;receive(r,p,'owner',false);near(r.a.s3.modifiers.runSpeed,1);
});
test('malformed, stale, foreign and over-limit clock claims cannot grant a buff',async()=>{
 for(const kind of ['tooLong','wrongLife','oldSequence','foreignOwner','wrongMatch','noGear','aliveEnemyDeath','nan']){
  const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);const p=o.send(),c=p.gc[1];
  if(kind==='tooLong')c[6]=20.001;if(kind==='wrongLife')c[3]++;if(kind==='oldSequence')c[4]--;if(kind==='wrongMatch')c[1]='other';if(kind==='noGear')delete p.gg;if(kind==='aliveEnemyDeath')c[7]=true;if(kind==='nan')c[6]=null;
  receive(r,p,kind==='foreignOwner'?'intruder':'owner');adopt(r);near(r.a.s3.conditionalGear?.comeback||0,0);
 }
});
test('repeated new revisions cannot refill the same-life Comeback clock',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,8);r.m.time=o.m.time;receive(r,o.send());advance(r,4);
 const p=o.send();p.gc[1][6]=20;receive(r,p);adopt(r);near(r.a.s3.conditionalGear.comeback,8);
});

test('dead-owner takeover retains enemy-death eligibility and excludes environmental deaths',async()=>{
 for(const cause of ['weapon','water']){
  const o=await world('owner'),r=await world('viewer');head(o,'comeback');o.a.splat(cause==='weapon'?enemy(o):null,cause);const p=o.send();receive(r,p);r.nm._playEvents();assert.equal(r.a.alive,false);adopt(r);r.a.respawn();near(r.a.s3.conditionalGear.comeback,cause==='weapon'?20:0);
 }
});
test('a new hostile respawn can start20 seconds but old-life clocks cannot replace it',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,10);r.m.time=o.m.time;const old=o.send();receive(r,old);
 comeback(o);const fresh=o.send();receive(r,fresh);r.nm._peer('owner').tr=fresh.ts+1/60;r.nm._sample(r.a,fresh.ts+1/60,0);r.nm.applyRemote(r.a,1/60);near(r.a.s3.conditionalGear.comeback,20);
 old.ts=fresh.ts+10;old.u=fresh.u+600;receive(r,old);adopt(r);near(r.a.s3.conditionalGear.comeback,20);
});
test('Opening extensions survive death and the new life without re-awarding the initial window',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'openingGambit');enemy(o).splat(o.a);advance(o,35);o.a.splat(enemy(o));o.a.respawn();r.m.time=o.m.time;
 receive(r,o.send());adopt(r);near(r.a.s3.conditionalGear.openingEnd,45);assert.equal(r.a.s3.conditionalGear.openingCredits,1);advance(r,10);near(r.a.s3.modifiers.runSpeed,1);
});
test('clock offset, pause and same-match rebind cannot extend already accepted remaining time',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,8);r.m.time=o.m.time+2;const first=o.send();receive(r,first);near(r.a.s3.conditionalGear.comeback,12);
 r.m.paused=true;advance(r,5);receive(r,o.send());near(r.a.s3.conditionalGear.comeback,12);r.m.paused=false;advance(r,3);r.nm.bind(r.m);receive(r,first);adopt(r);near(r.a.s3.conditionalGear.comeback,9);
});
test('Opening transport rejects impossible step budgets and grants each new claimed step once',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'openingGambit');advance(o,20);r.m.time=o.m.time;receive(r,o.send());
 let p=o.send();p.gc[1][9]=100;receive(r,p);near(r.a.s3.conditionalGear.openingEnd,30);
 enemy(o).splat(o.a);p=o.send();receive(r,p);near(r.a.s3.conditionalGear.openingEnd,45);receive(r,p);near(r.a.s3.conditionalGear.openingEnd,45);
 advance(r,5);p=o.send();p.gc[1][9]=30;receive(r,p);adopt(r);near(r.a.s3.conditionalGear.openingEnd,45);
});

test('host clock rollback cannot extend transferred Opening or Comeback',async()=>{
 for(const id of ['openingGambit','comeback']){
  const o=await world('owner'),r=await world('viewer');head(o,id);if(id==='comeback')comeback(o);advance(o,10);r.m.time=o.m.time;receive(r,o.send());
  advance(r,3);r.nm._hostClock(['playing',180]);adopt(r);
  const left=id==='comeback'?7:17;advance(r,left);near(r.a.s3.modifiers.runSpeed,1);
 }
});
test('paused network updates do not age accepted conditions',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,10);r.m.time=o.m.time;receive(r,o.send());
 r.m.paused=true;advance(r,20);adopt(r);near(r.a.s3.conditionalGear.comeback,10);r.m.paused=false;advance(r,10);near(r.a.s3.conditionalGear.comeback,0);
});

test('first observed dead-owner snapshot retains gear and eligibility before visual sampling',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');o.a.splat(enemy(o));const p=o.send();receive(r,p,'owner',false);
 const peer=r.nm._peer('owner');peer.tr=p.ts;r.nm._playEvents();assert.equal(r.a.alive,false);adopt(r);r.a.respawn();assert.equal(r.a.s3.loadout[0].main,'comeback');near(r.a.s3.conditionalGear.comeback,20);
});

test('a new match object cannot reuse a prior conditional receipt even with the same room id',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);receive(r,o.send());
 const next={...r.m,time:180},session=r.nm.s,cfg=r.nm.cfg;r.nm.dispose();r.nm=new r.f.NetMatch(session,cfg);r.nm.bind(next);r.f.G.match=next;r.m=next;assert.equal(r.nm.match,next);r.a.s3RefreshGear();adopt(r);near(r.a.s3.conditionalGear.comeback,0);
});

test('a missing or rejected newer sidecar cannot freeze a previously accepted Comeback clock',async()=>{
 for(const malformed of [false,true]){
  const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,8);r.m.time=o.m.time;receive(r,o.send());advance(r,4);
  const p=o.send();if(malformed)p.gc[1][6]=100;else delete p.gc;receive(r,p);advance(r,4);adopt(r);near(r.a.s3.conditionalGear.comeback,4);
 }
});
test('new-life snapshots without a valid clock cannot inherit an old-life Comeback buff',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,8);r.m.time=o.m.time;receive(r,o.send());
 o.a.splat(null,'water');o.a.respawn();const p=o.send();delete p.gc;receive(r,p);adopt(r);near(r.a.s3.conditionalGear.comeback,0);
});

for(const hz of [30,60,120])test(`actual Match actor loop ages remote Comeback once at ${hz}Hz`,async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'comeback');comeback(o);advance(o,8,hz);r.m.time=o.m.time;receive(r,o.send());
 let ownerUpdates=0;const update=r.a.update;r.a.update=function(dt){ownerUpdates++;return update.call(this,dt);};r.m.stateT=0;
 for(let i=0;i<2*hz;i++){const dt=1/hz;r.f.G.time+=dt;r.nm.update(dt);r.f.Match.prototype.update.call(r.m,dt);}
 assert.equal(ownerUpdates,0,'native Match chooses remote playback instead of Actor.update');near(r.a.s3.conditionalGear.comeback,10);
 adopt(r);r.a.bot=null;
 for(let i=0;i<2*hz;i++){const dt=1/hz;r.f.G.time+=dt;r.nm.update(dt);r.f.Match.prototype.update.call(r.m,dt);}
 assert.equal(ownerUpdates,2*hz);near(r.a.s3.conditionalGear.comeback,8);
});
test('Opening missing-sidecar, equipment changes, new life and rebind cannot revive an expired transferred window',async()=>{
 const o=await world('owner'),r=await world('viewer');head(o,'openingGambit');advance(o,25);r.m.time=o.m.time;receive(r,o.send());advance(r,3);
 let p=o.send();delete p.gc;receive(r,p);assert.ok(r.a.s3.modifiers.runSpeed>1);advance(r,2);near(r.a.s3.modifiers.runSpeed,1);
 head(o,'none');p=o.send();receive(r,p);assert.equal(r.a.s3.loadout[0].main,'none');head(o,'openingGambit');p=o.send();delete p.gc;receive(r,p);near(r.a.s3.modifiers.runSpeed,1);
 o.a.splat(null,'water');o.a.respawn();p=o.send();delete p.gc;receive(r,p);r.nm.bind(r.m);adopt(r);advance(r,1);near(r.a.s3.modifiers.runSpeed,1);
});

test('unconfigured conditional helper is inactive until runtime installation configures it',async()=>{
 const {openingRemaining}=await import('../runtime/conditional-gear-network.mjs?unconfigured-contract');
 assert.equal(openingRemaining({openingEnd:null},{duration:180,time:180}),0);
 const o=await world('owner');head(o,'openingGambit');assert.ok(o.a.s3.modifiers.runSpeed>1,'full installer configures conditional helpers before Actor refresh');
});

test('negotiated compressed paint preserves real conditional gear clocks through JSON and host takeover',async()=>{
 const o=await world('owner'),r=await world('viewer'),q=[];
 for(const w of [o,r]){
  w.f.context.crypto=globalThis.crypto;
  w.nm.s._members=new Map([['owner','Owner'],['viewer','Viewer']]);
  w.nm.s.tr.sendTo=(to,d)=>{q.push([w.nm.s.myId,to,json(d)]);return true;};
 }
 o.send();r.send();let budget=30;while(q.length){assert.ok(budget-->0);const[from,to,d]=q.shift();(to==='owner'?o:r).nm.onMessage(from,d);}
 head(o,'comeback');comeback(o);advance(o,8);r.m.time=o.m.time;
 for(let i=0;i<24;i++)o.nm.recSplat(new o.f.THREE.Vector3(i*.02,0,0),.3,0,{seed:.31,kind:'drop',face:0,claimOwner:o.a});
 const packet=o.send();assert.ok(packet.pe,'real _sendTick uses negotiated codec');assert.ok(packet.gg[1]);assert.ok(packet.gc[1]);assert.equal(packet.e,undefined);
 receive(r,packet);near(r.a.s3.conditionalGear.comeback,12);assert.equal(r.a.s3.loadout[0].main,'comeback');
 advance(r,2);adopt(r);near(r.a.s3.conditionalGear.comeback,10);assert.ok(r.a.s3.modifiers.runSpeed>1);
 advance(r,10);near(r.a.s3.conditionalGear.comeback,0);near(r.a.s3.modifiers.runSpeed,1);
});
