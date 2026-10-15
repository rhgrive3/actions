import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout,abilityPoints,abilityAllowed,ABILITIES} from '../runtime/gear.mjs';
import {GEAR_WIRE_IDS,packOwnerGear,readAcceptedGear} from '../runtime/gear-loadout-network.mjs';
const json=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function world(id){
 // NetMatch uses performance.now(), not G.time, for its millisecond wire clock.
 let clockMs=0;
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>clockMs}});
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const a=f.make();Object.assign(a,{nid:1,owner:'owner',invuln:0});
 let packet;const session={myId:id,hostId:'owner',isHost:id==='owner',tr:{sendTo(){},broadcast:d=>{packet=json(d);}}};
 const nm=new f.NetMatch(session,{id:'gear-match'}),m={actors:[a],state:'playing',time:180,duration:180,playing:()=>true,canRespawn:()=>false};
 nm.bind(m);f.G.netm=nm;f.G.match=m;f.G.actors=[a];
 return{f,a,nm,m,send(){clockMs+=1000/60;f.G.time+=1/60;nm._sendTick();return json(packet);}};
}
function receive(w,p,from='owner',sample=true){w.nm.onMessage(from,json(p));if(sample){const peer=w.nm._peer(from);peer.tr=Math.max(peer.tr||0,p.ts);w.nm._sample(w.a,peer.tr,0);w.nm.applyRemote(w.a,1/60);}}
function equip(a,ap){a.s3.loadout=emptyLoadout();let n=ap;for(const p of a.s3.loadout)if(n>=10){p.main='runSpeed';n-=10;}for(const p of a.s3.loadout)for(let i=0;i<3&&n>=3;i++){p.subs[i]='runSpeed';n-=3;}assert.equal(n,0);a.s3RefreshGear();}
function adopt(w){w.nm.s.hostId='viewer';w.nm.s.isHost=true;w.nm.onLeave('owner',true);}
for(const ap of [0,3,10,30,57])test(`actual JSON preserves legal ${ap} AP through remote sampling and host adoption`,async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,ap);o.a.special=43.2;const p=o.send();receive(r,p);
 assert.deepEqual(json(r.a.s3.loadout),json(o.a.s3.loadout));near(r.a.s3.modifiers.runSpeed,o.a.s3.modifiers.runSpeed);assert.equal(r.a.special,Math.round(o.a.special));
 adopt(r);assert.equal(r.a.remote,false);assert.equal(r.a.isBot,true);assert.equal(r.a.owner,'viewer');assert.equal(abilityPoints(r.a.s3.loadout).runSpeed||0,ap);near(r.a.s3.modifiers.runSpeed,o.a.s3.modifiers.runSpeed);
 for(const hz of [30,60,120]){r.a.vel.set(0,0,0);r.a.intent.move.set(0,0,1);r.a.form='kid';r.a.grounded=true;for(let i=0;i<hz;i++)r.a._horizontal(1/hz,false,false);near(r.a.vel.z,r.f.PLAYER.runSpeed*o.a.s3.modifiers.runSpeed);}
});
test('adoption uses latest accepted equipment rather than delayed visual gear',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,3);receive(r,o.send());equip(o.a,30);receive(r,o.send(),'owner',false);
 assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,3);adopt(r);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,30);
});
test('fixed main-only slots and special charge preserve owner gauge without double scaling',async()=>{
 const o=await world('owner'),r=await world('viewer');o.a.s3.loadout=emptyLoadout();o.a.s3.loadout[0].main='tenacity';o.a.s3.loadout[1].main='specialCharge';o.a.s3.loadout[2].main='objectShredder';o.a.s3RefreshGear();o.a.special=72;
 receive(r,o.send());assert.equal(r.a.special,72);near(r.a.weapon.specialCost,o.a.weapon.specialCost);adopt(r);assert.equal(r.a.special,72);assert.equal(r.a.s3.loadout[0].main,'tenacity');assert.equal(r.a.s3.loadout[2].main,'objectShredder');
 const e1=r.f.make(),e2=r.f.make();e1.team=e2.team=1;r.f.G.actors=r.m.actors=[r.a,e1,e2];r.a.special=0;for(let i=0;i<60;i++)r.a.update(1/60);near(r.a.specialFrac(),3.24/r.f.WEAPONS.shooter.specialCost);
});
test('invalid slot, numeric multiplier, excess slots and stale identity never grant equipment',async()=>{
 for(const kind of ['headOnShoes','mainAsSub','multiplier','extraSlot','oldLife','oldSequence','oldMatch','wrongActor','foreignOwner']){
  const o=await world('owner'),r=await world('viewer');equip(o.a,57);const p=o.send(),g=p.gg[1];
  if(kind==='headOnShoes')g[5][2][1]=GEAR_WIRE_IDS.indexOf('tenacity');if(kind==='mainAsSub')g[5][0][2]=GEAR_WIRE_IDS.indexOf('tenacity');if(kind==='multiplier')g[5][0][1]=100;if(kind==='extraSlot')g[5][0].push('runSpeed');
  if(kind==='oldLife')g[3]++;if(kind==='oldSequence')g[4]++;if(kind==='oldMatch')g[1]='previous';if(kind==='wrongActor')g[2]=2;
  receive(r,p,kind==='foreignOwner'?'intruder':'owner');assert.equal(abilityPoints(r.a.s3.loadout).runSpeed||0,0,kind);
 }
});
test('duplicate and older actual owner snapshots cannot roll equipment back',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,3);const first=o.send();receive(r,first);equip(o.a,30);const second=o.send();receive(r,second);receive(r,first);receive(r,second);
 assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,30);
});

test('same-match roster rebind cannot replay an older gear revision',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,3);const first=o.send();receive(r,first);equip(o.a,30);receive(r,o.send());
 r.nm.bind(r.m);receive(r,first);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,30);
});


test('codec covers every registered ability and enforces each primary/secondary slot',()=>{
 assert.deepEqual(new Set(GEAR_WIRE_IDS),new Set(Object.keys(ABILITIES)));
 const a={nid:1,netLife:0,_adoptionSequence:1,s3:{loadout:emptyLoadout()}},nm={cfg:{id:'codec'},byNid:new Map([[1,a]])};
 const original=packOwnerGear(nm)[1];
 for(let piece=0;piece<3;piece++)for(let slot=0;slot<4;slot++)for(let id=0;id<GEAR_WIRE_IDS.length;id++){
  const row=json(original),ability=GEAR_WIRE_IDS[id];row[5][piece][slot+1]=id;
  if(piece===1&&ability==='abilityDoubler')row[5][piece][0]=1;
  const garment=row[5][piece][0]?'splatfestTee':undefined;
  const parsed=readAcceptedGear(row,nm,a,{life:0,sequence:1});
  assert.equal(!!parsed,abilityAllowed(ability,piece,slot,garment),`${ability} ${piece}/${slot}`);
  if(parsed)assert.ok(Object.values(abilityPoints(parsed.loadout)).every(n=>n<=57));
 }
});
test('new life equipment cannot be replaced by a re-enveloped old-life snapshot',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,57);const old=o.send();receive(r,old);
 o.a.spawnAt(new o.f.THREE.Vector3(0,0,0),0);equip(o.a,10);const fresh=o.send();receive(r,fresh);r.nm._peer('owner').tr=fresh.ts+1/60;r.nm._sample(r.a,fresh.ts+1/60,0);r.nm.applyRemote(r.a,1/60);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,10);
 old.ts=fresh.ts+1;old.u=fresh.u+60;receive(r,old);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,10);
});

test('legacy snapshots remain usable and received equipment owns immutable copies',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,30);const p=o.send();receive(r,p);const accepted=r.a.net.buf.at(-1).adoption.gear;
 assert.ok(Object.isFrozen(accepted)&&Object.isFrozen(accepted.loadout)&&Object.isFrozen(accepted.loadout[0].subs));
 p.gg[1][5][0][1]=0;assert.equal(abilityPoints(accepted.loadout).runSpeed,30);
 equip(o.a,57);const legacy=o.send();delete legacy.gg;receive(r,legacy);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,30);adopt(r);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,30);
});
test('a previous owner cannot replace equipment after host takeover',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,3);receive(r,o.send());adopt(r);equip(o.a,57);const stale=o.send();stale.ts+=100;stale.u+=6000;receive(r,stale,'owner',false);
 assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,3);assert.equal(r.a.owner,'viewer');
});

test('Splatfest Tee doubles legal subs while fixed primary identities remain slot-bound',async()=>{
 const o=await world('owner'),r=await world('viewer');o.a.s3.loadout=emptyLoadout();
 o.a.s3.loadout[0].main='tenacity';o.a.s3.loadout[1]={item:'splatfestTee',main:'abilityDoubler',subs:['runSpeed','runSpeed','runSpeed']};o.a.s3.loadout[2].main='objectShredder';o.a.s3RefreshGear();
 receive(r,o.send());adopt(r);assert.deepEqual(json(r.a.s3.loadout),json(o.a.s3.loadout));assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,18);
 const bad=o.send();bad.gg[1][5][1][0]=0;assert.equal(readAcceptedGear(bad.gg[1],o.nm,o.a,{life:bad.gg[1][3],sequence:bad.gg[1][4]}),null);
});
test('lower special cost preserves the owner gauge fraction, ready state and one-shot readiness events',async()=>{
 const o=await world('owner'),r=await world('viewer');let ownerReady=0,remoteReady=0;o.f.on('special:ready',()=>ownerReady++);r.f.on('special:ready',()=>remoteReady++);
 o.a.special=o.a.specialCost()*.9;receive(r,o.send());const before=o.a.specialCost();
 o.a.s3.loadout=emptyLoadout();o.a.s3.loadout.forEach(p=>{p.main='specialCharge';p.subs.fill('specialCharge')});o.a.s3RefreshGear();assert.ok(o.a.specialCost()<before);near(o.a.specialFrac(),.9);
 receive(r,o.send());assert.equal(r.a.special,Math.round(o.a.special));assert.equal(r.a.specialReady(),false);assert.equal(ownerReady,0);assert.equal(remoteReady,0);
 o.a.addTurf(10000);assert.equal(ownerReady,1);assert.equal(o.a.special,o.a.specialCost());const full=o.send();receive(r,full);receive(r,full);assert.equal(r.a.specialFrac(),1);assert.equal(r.a.specialReady(),true);assert.equal(remoteReady,0);
 adopt(r);assert.equal(r.a.specialReady(),true);r.a.addTurf(1);assert.equal(remoteReady,0);assert.ok(r.a.special<=r.a.specialCost());
});

test('host takeover immediately after respawn uses the new-life loadout before visual sampling',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,57);receive(r,o.send());
 o.a.spawnAt(new o.f.THREE.Vector3(0,0,0),0);equip(o.a,3);receive(r,o.send(),'owner',false);
 assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,57);adopt(r);assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,3);assert.equal(r.a.netLife,o.a.netLife);near(r.a.s3.modifiers.runSpeed,o.a.s3.modifiers.runSpeed);
});

test('fractional special-cost readiness survives integer native snapshots',async()=>{
 for(const ap of [3,10,30,57]){
  const o=await world('owner'),r=await world('viewer');o.a.s3.loadout=emptyLoadout();let n=ap;for(const p of o.a.s3.loadout)if(n>=10){p.main='specialCharge';n-=10;}for(const p of o.a.s3.loadout)for(let i=0;i<3&&n>=3;i++){p.subs[i]='specialCharge';n-=3;}o.a.s3RefreshGear();o.a.special=o.a.specialCost();
  receive(r,o.send());assert.equal(r.a.specialReady(),true,`remote AP${ap} cost${o.a.specialCost()} wire${r.a.special}`);adopt(r);assert.equal(r.a.specialReady(),true,`adopted AP${ap} gauge${r.a.special} cost${r.a.specialCost()} owner${o.a.specialCost()}`);
 }
});

test('near-full gauge never becomes ready solely because integer snapshots round upward',async()=>{
 for(const ap of [3,10,30,57]){
  const o=await world('owner'),r=await world('viewer');o.a.s3.loadout=emptyLoadout();let n=ap;for(const p of o.a.s3.loadout)if(n>=10){p.main='specialCharge';n-=10;}for(const p of o.a.s3.loadout)for(let i=0;i<3&&n>=3;i++){p.subs[i]='specialCharge';n-=3;}o.a.s3RefreshGear();o.a.special=o.a.specialCost()-.01;
  let ready=0;r.f.on('special:ready',()=>ready++);receive(r,o.send());assert.equal(r.a.specialReady(),false);adopt(r);assert.equal(r.a.specialReady(),false,`AP${ap}`);assert.ok(r.a.special<r.a.specialCost());assert.equal(ready,0);
 }
});
test('ready presentation and remote cost claims cannot manufacture a gameplay cost or far-away full gauge',async()=>{
 for(const kind of ['forgedCost','farFromFull']){
  const o=await world('owner'),r=await world('viewer');o.a.s3.loadout=emptyLoadout();o.a.s3.loadout[0].main='specialCharge';o.a.s3RefreshGear();o.a.special=10;const p=o.send();p.a[0][10]|=67108864;if(kind==='forgedCost')p.sc[1]=10;
  receive(r,p);adopt(r);assert.equal(r.a.specialReady(),false);near(r.a.weapon.specialCost,o.a.weapon.specialCost);assert.equal(r.a.special,10);
 }
});


test('first dead-owner snapshot retains accepted equipment when death precedes visual sampling',async()=>{
 const o=await world('owner'),r=await world('viewer');equip(o.a,57);o.a.splat(null,'water');const p=o.send();receive(r,p,'owner',false);
 const peer=r.nm._peer('owner');peer.tr=p.ts;r.nm._playEvents();assert.equal(r.a.alive,false);assert.equal(r.a.net.buf.length,0);adopt(r);
 assert.equal(abilityPoints(r.a.s3.loadout).runSpeed,57);assert.deepEqual(json(r.a.s3.loadout),json(o.a.s3.loadout));
});

test('gear snapshots advance an isolated deterministic wire clock',async()=>{
 const nativeNow=performance.now,o=await world('owner'),r=await world('viewer');
 const packets=[o.send(),o.send(),o.send()];
 assert.deepEqual(packets.map(p=>p.ts),[.017,.033,.05]);
 assert.equal(r.send().ts,.017);assert.equal(performance.now,nativeNow);
});
