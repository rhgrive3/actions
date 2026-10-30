import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSprinklerSource} from './native-sprinkler-source-fixture.mjs';
import {objectDamageScale} from '../../splatoon3/runtime/sub-resistance.mjs';
const claim=e=>e?.[1]==='ac'&&e[5]?.phase==='nativeObjectHit';

test('native Sprinkler: actual Main producer reaches owner HP once; inflated amount and fresh replay never buy another source',async t=>{
 const x=await nativeSprinklerSource(t),out=[];let serial=1000000;
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.flatMap(e=>{
  if(!claim(e))return[e];const bad=structuredClone(e),again=structuredClone(e);bad[5].eventSeq=serial++;bad[5].damage+=1;again[5].eventSeq=serial++;
  return[bad,e,again];
 })));
 const hits=out.filter(r=>r.after<r.before);assert.equal(hits.length,1,'one native Main round, one real HP application');assert.ok(hits[0].event[5].eventSeq<1000000);
 assert.equal(x.target.s3DeviceHP,120-x.claims[0][5].damage);assert.equal(x.target.s3Destroyed,undefined);
 const prior=x.target.s3DeviceHP,raw=structuredClone(x.claims[0]);raw[raw.length-1]+=100000;raw[5].eventSeq+=100000;x.nm._play('peer',raw);assert.equal(x.target.s3DeviceHP,prior,'raw playback cannot mint a private owner receipt');
});

test('native Sprinkler: a transmitted Object Shredder flag cannot select a damage multiplier',async t=>{
 const x=await nativeSprinklerSource(t);for(const packet of x.packets)x.deliver(packet,rows=>rows.map(e=>{if(claim(e))e[5].objectShredder=true;return e;}));
 assert.equal(x.target.s3DeviceHP,120-x.claims[0][5].damage,'only the admitted Actor equipment controls source-table scaling');
});

for(const id of ['burst','bomb'])test(`native Sprinkler: real paid ${id} source reaches its HP consumer with native contact and bounded replay`,async t=>{
 const x=await nativeSprinklerSource(t,{kind:'sub',id,frames:240}),out=[];let serial=1000000;
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.flatMap(e=>{
  if(!claim(e))return[e];const bad=structuredClone(e),again=structuredClone(e);bad[5].eventSeq=serial++;bad[5].damage+=1;again[5].eventSeq=serial++;return[bad,e,again];
 })));
 assert.ok(x.target.s3DeviceHP<120,'actual receiver contact applies the native Sub damage');
 const applied=out.filter(r=>r.after<r.before);assert.ok(applied.every(r=>r.event[5].eventSeq<1000000),'invalid amount or fresh sequence does not spend a source');
 assert.ok(x.events.some(e=>e[1]==='b'||e[1]==='ac'&&e[5]?.phase==='spawn'),'native paid birth travels through actual sender tick');
});

function sourcePlacement(mode){let placed=false;return x=>{
 if(placed)return;const birth=x.nm.out.find(e=>e[1]==='p'&&e[2]===x.attacker.nid);if(!birth)return;
 const p=x.f.projectiles.makeCrabletCombatProbe(x.attacker,birth);assert.ok(p,'native packet restores the same source geometry');
 if(mode==='terminal')while(p.age+1e-9<p.life)x.f.projectiles.stepCrabletCombatProbe(p);
 else for(let i=0;i<3;i++)x.f.projectiles.stepCrabletCombatProbe(p);
 x.target.pos.copy(p.pos);if(mode==='terminal')x.target.pos.add(new x.f.THREE.Vector3(1.3,-.45,0));placed=true;
};}
const distant=x=>x.target.pos.set(500,1.05,3);
for(const id of ['s3-blaster-short','blaster'])test(`native Sprinkler: actual ${id} terminal burst includes the native device in its sealed area`,async t=>{
 const x=await nativeSprinklerSource(t,{id,frames:90,configure:distant,afterStep:sourcePlacement('terminal')});
 assert.equal(x.claims.length,1,'one real off-axis burst proposal');
 for(const p of x.packets)x.deliver(p);
 const amount=x.claims[0][5].damage*objectDamageScale(x.attacker,'sprinkler',x.claims[0][5].cause);
 assert.ok(Math.abs(x.target.s3DeviceHP-Math.max(0,120-amount))<1e-7,'native terminal band and source table reach owner HP');
 assert.ok(x.target.s3DeviceHP<120);
});

test('native Sprinkler: actual Splatana slash uses the private melee source and native area point',async t=>{
 const x=await nativeSprinklerSource(t,{id:'s3-saber-normal',frames:30,configure:x=>x.target.pos.set(0,1.15,1)});
 assert.equal(x.events.filter(e=>e[1]==='ev'&&e[2]==='weapon:melee').length,4);
 assert.ok(x.attacker.ink<100,'native Runner paid ink');
 for(const p of x.packets)x.deliver(p);
 assert.ok(x.target.s3DeviceHP<120,'actual melee native contact reaches the separate Sprinkler HP consumer');
});

test('native Sprinkler: actual paid Inkjet projectile contacts the native device',async t=>{
 const x=await nativeSprinklerSource(t,{kind:'special',id:'inkjet',frames:90,configure:distant,afterStep:sourcePlacement('direct')});
 assert.ok(x.events.some(e=>e[1]==='p'),'actual special projectile birth');
 for(const p of x.packets)x.deliver(p);
 assert.ok(x.target.s3DeviceHP<120,'the special projectile proof reads the stable private native target');
});

test('native Sprinkler: actual Wail lock and laser recognize its private target through blocked LOS',async t=>{
 const x=await nativeSprinklerSource(t,{kind:'special',id:'killerWail',frames:95,configure:x=>{
  x.target.pos.set(0,.1,20);x.owner.pos.set(0,0,20);x.owner.invuln=Infinity;x.f.G.physics.los=()=>false;
 }});
 assert.ok(x.events.some(e=>e[5]?.id==='killerWail'&&e[5]?.action==='target'),'actual owner locks a target');
 for(const p of x.packets)x.deliver(p);
 assert.ok(x.target.s3DeviceHP<120,'private native membership admits the real Wail source');
});

test('native Sprinkler: held Storm release and receiver cloud frames reach its HP consumer',async t=>{
 const x=await nativeSprinklerSource(t,{kind:'special',id:'storm',frames:180,fullActor:true,configure:x=>{
  x.f.G.match.playing=()=>true;x.target.pos.set(0,.08,6);x.attacker.aimPitch=-.6;x.attacker.aimDir.set(0,Math.sin(-.6),Math.cos(-.6));x.attacker.aimPoint.set(0,-10,20);
 },step:(x,i)=>{x.attacker.intent.fire=false;x.attacker.intent.sub=i===7;}});
 assert.equal(x.events.filter(e=>e[1]==='b'&&e[3]==='storm').length,1,'one real held release creates a canister');
 assert.ok(x.claims.length>30,'actual cloud emitted continuous contacts');
 // The source graph has finished producing its packets. Its local cloud is
 // removed before replay, so every observed cloud below is receiver-native.
 x.f.projectiles.clouds.splice(0);
 for(const p of x.packets)x.deliver(p,null,{advanceProjectiles:true});
 const amount=x.claims.reduce((n,e)=>n+e[5].damage*objectDamageScale(x.attacker,'sprinkler',e[5].cause),0);
 assert.ok(Math.abs(x.target.s3DeviceHP-Math.max(0,120-amount))<1e-7,'each native receiver cloud contact applies exactly its source amount');
 assert.ok(x.target.s3DeviceHP<120);
});

function delayedSource(x){
 const packet=x.packets.find(p=>p.e?.some(claim));assert.ok(packet);
 const rows=x.events.filter(e=>e[1]==='p'||e[1]==='ev'&&e[2]==='weapon:fire');assert.ok(rows.length);
 const later=structuredClone(x.packets.find(p=>p.u>packet.u)||packet);later.u=Math.max(later.u,packet.u+3);later.ts=Math.max(later.ts,packet.ts+.05);later.e=rows;
 return{packet,later};
}
test('native Sprinkler: an unchanged native target admits its original claim after delayed real birth',async t=>{
 const x=await nativeSprinklerSource(t),{packet,later}=delayedSource(x);
 x.deliver(packet,rows=>rows.filter(claim));assert.equal(x.target.s3DeviceHP,120,'claim alone has no native source');
 x.deliver(later);assert.equal(x.target.s3DeviceHP,120-x.claims[0][5].damage,'the same receipt settles after its older actual source arrives');
});

test('native Sprinkler: a claim received in flight cannot acquire the later sprinkling phase',async t=>{
 const x=await nativeSprinklerSource(t),{packet,later}=delayedSource(x);
 x.target.s3Mode='flight';x.deliver(packet,rows=>rows.filter(claim));assert.equal(x.target.s3DeviceHP,120);
 x.target.s3Mode='sprinkling';x.deliver(later);assert.equal(x.target.s3DeviceHP,120,'the original phase mismatch never becomes a waiting damage capability');
});

test('native Sprinkler: delayed source cannot redirect a pending claim into a moved target',async t=>{
 const x=await nativeSprinklerSource(t),{packet,later}=delayedSource(x),at=x.target.pos.clone();
 x.target.pos.x+=1; // Remain inside the wire-coordinate tolerance, outside the native round.
 x.deliver(packet,rows=>rows.filter(claim));assert.equal(x.target.s3DeviceHP,120);
 x.target.pos.copy(at);x.deliver(later);assert.equal(x.target.s3DeviceHP,120,'private pending target shape retains the first receiver position');
});

test('native Sprinkler: delayed old-birth claim cannot damage a real replacement device at the same position',async t=>{
 const x=await nativeSprinklerSource(t),{packet,later}=delayedSource(x),{f,owner,target}=x;
 x.deliver(packet,rows=>rows.filter(claim));assert.equal(target.s3DeviceHP,120);
 target.s3DeviceHP=0;target.s3Destroyed=true;f.projectiles.update(1/60);assert.ok(!f.projectiles.bombs.includes(target));
 owner.ink=100;owner.weaponRunner.reset();for(let i=0;i<4;i++)owner.weaponRunner.update(1/60,{sub:true,subReleased:false});
 for(let i=0;i<30&&!f.projectiles.bombs.some(b=>b.owner===owner);i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
 const next=f.projectiles.bombs.find(b=>b.owner===owner);assert.ok(next?.s3DeviceBirth);assert.notEqual(next.s3DeviceBirth.seq,target.s3DeviceBirth.seq);
 f.kitBombContact(f.SUB,next,{hit:true,point:x.at.clone(),normal:new f.THREE.Vector3(0,1,0)});
 x.deliver(later);assert.equal(next.s3DeviceHP,120,'real native replacement has its own immutable birth identity');
});

test('native Sprinkler: real admitted Object Shredder remains effective when a wire flag is false',async t=>{
 const x=await nativeSprinklerSource(t,{shredder:true});
 for(const p of x.packets)x.deliver(p,rows=>rows.map(e=>{if(claim(e))e[5].objectShredder=false;return e;}));
 assert.equal(x.target.s3DeviceHP,0,'real accepted Actor gear applies the source multiplier once');
});

async function orderedPendingPair(t,{firstClaim=true}={}){
 const x=await nativeSprinklerSource(t,{mainShots:2,mainShotSpacing:6,frames:24});
 assert.equal(x.claims.length,2);const birth=x.events.find(e=>e[1]==='p'),early=x.claims[0],late=x.claims[1];assert.ok(birth);
 const last=x.packets.findIndex(p=>p.e?.some(e=>e.at(-1)===late.at(-1)));assert.ok(last>=0);
 for(const p of x.packets.slice(0,last+1))x.deliver(p,rows=>rows.filter(e=>e.at(-1)!==birth.at(-1)&&(firstClaim||e.at(-1)!==early.at(-1))));
 assert.equal(x.target.s3DeviceHP,120-late[5].damage,'the later real source applies while the first birth is absent');
 const rest=x.packets.slice(last+1),packet=rows=>{assert.ok(rest.length,'actual later owner tick remains');return{...structuredClone(rest.shift()),e:structuredClone(rows)};};
 return{x,birth,early,late,packet};
}
test('native Sprinkler: an older private pending claim settles once after a newer application advances high-water',async t=>{
 const {x,birth,early,late,packet}=await orderedPendingPair(t);
 x.deliver(packet([birth]));assert.equal(x.target.s3DeviceHP,120-early[5].damage-late[5].damage,'the originally waiting native contact survives the newer application');
 const hp=x.target.s3DeviceHP;
 x.deliver(packet([birth]));x.deliver(packet([early]));
 assert.equal(x.target.s3DeviceHP,hp,'re-flush and a fresh envelope cannot spend the private pending receipt twice');
});
test('native Sprinkler: a new low-sequence claim cannot obtain pending privilege after a newer hit',async t=>{
 const {x,birth,early,late,packet}=await orderedPendingPair(t,{firstClaim:false});
 x.deliver(packet([early]));x.deliver(packet([birth]));
 assert.equal(x.target.s3DeviceHP,120-late[5].damage,'only a claim admitted before high-water advanced can wait for an older source');
});

test('native Sprinkler: a spent round cannot continue through the destroyed first device to a real later birth',async t=>{
 const x=await nativeSprinklerSource(t),{f,owner,target}=x;
 const hitPacket=x.packets.findIndex(p=>p.e?.some(claim));assert.ok(hitPacket>=0);target.s3DeviceHP=1;
 for(const p of x.packets.slice(0,hitPacket+1))x.deliver(p);
 assert.equal(target.s3DeviceHP,0);assert.equal(target.s3Destroyed,true);f.projectiles.update(1/60);
 owner.ink=100;owner.weaponRunner.reset();for(let i=0;i<4;i++)owner.weaponRunner.update(1/60,{sub:true,subReleased:false});
 for(let i=0;i<30&&!f.projectiles.bombs.some(b=>b.owner===owner);i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
 const next=f.projectiles.bombs.find(b=>b.owner===owner);assert.ok(next?.s3DeviceBirth);
 f.kitBombContact(f.SUB,next,{hit:true,point:x.at.clone().add(new f.THREE.Vector3(0,0,1)),normal:new f.THREE.Vector3(0,1,0)});
 const redirected=structuredClone(x.claims[0]);Object.assign(redirected[5],{eventSeq:redirected[5].eventSeq+1000,targetSeq:next.s3DeviceBirth.seq,x:next.pos.x,y:next.pos.y,z:next.pos.z});
 x.deliver(x.packets[hitPacket+1],()=>[redirected]);assert.equal(next.s3DeviceHP,120,'receiver checkpoint retains the actual first native barrier');
});
