import test from 'node:test';
import assert from 'node:assert/strict';
import {specialNativeProducer} from './special-native-producer-fixture.mjs';

async function setup(t){
 return specialNativeProducer(t,'splattercolorScreen',{frames:30,targetZ:500,configure:x=>{
  x.attacker.aimYaw=0;x.attacker.aimPitch=-.5;x.attacker.aimDir.set(0,Math.sin(-.5),Math.cos(-.5));x.attacker.aimPoint.set(0,-3,5);
  x.f.G.physics.segment=(a,b,h)=>{h.hit=false;if(a.y>=0&&b.y<0){const u=a.y/(a.y-b.y);h.hit=true;h.point.copy(a).lerp(b,u);h.normal.set(0,1,0);h.dist=a.distanceTo(h.point);}return h;};
 },step:(x,i)=>{x.attacker.intent.sub=i===0;}});
}
function step(x,n=1){for(let i=0;i<n;i++){x.f.G.time+=1/60;x.f.projectiles.update(1/60);}}
function screen(x){return x.f.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='screen');}
test('Screen native paid birth must fly and collide before its receiver-owned local debuff',async t=>{
 const x=await setup(t);let first;
 for(const packet of x.packets.slice(0,-1)){x.deliver(packet);if(!first&&screen(x)){first=screen(x);assert.equal(first.phase,'flight','new native birth cannot start armed');}}
 const sheet=screen(x);assert.ok(sheet);const born=sheet.pos.clone();let frames=0;
 while(frames<120&&sheet.phase==='flight'){step(x);frames++;}
 assert.ok(frames>0&&frames<120,'real receiver integration reaches the floor');assert.equal(sheet.phase,'active');assert.ok(sheet.pos.distanceTo(born)>.1);
 const before=sheet.pos.clone(),move=structuredClone(x.events.find(e=>e[5]?.action==='deploy'));
 move[0]=x.packets.at(-1).ts-.001;move[move.length-2]=x.packets.at(-1).u-1;move[5]={...move[5],action:'move',pos:[500,0,500],target:[500,0,501],tick:999};
 const packet=structuredClone(x.packets.at(-1));packet.e=[move];x.deliver(packet);step(x);
 assert.ok(sheet.pos.distanceTo(before)<1,'wire movement cannot teleport the admitted flight');assert.equal(x.owner.s3?.splattercolorUntil>x.f.G.time,false);
 x.owner.pos.copy(sheet.pos);step(x);assert.ok(x.owner.s3.splattercolorUntil>x.f.G.time,'only actual local sheet contact applies the native debuff');
});
for(const attack of ['unpaid','far','speed','second-object'])test(`Screen rejects ${attack} native-envelope forgery before local contact`,async t=>{
 const x=await setup(t);
 for(const packet of x.packets){
  x.deliver(packet,rows=>rows.flatMap(e=>{
   if(attack==='unpaid'&&e[1]==='ev'&&e[2]==='special:use')return[];
   if(!['deploy','screen'].includes(e[5]?.action))return[e];
   if(attack==='far'){e[5].pos=[500,0,500];e[5].target=[500,0,501];}
   if(attack==='speed'){e[5].vx*=1.2;e[5].vy*=1.2;e[5].vz*=1.2;}
   if(attack==='second-object')e[5].object=2;
   return[e];
  }));
 }
 assert.equal(screen(x),undefined,'invalid birth has no receiver-owned damaging/debuff sheet');step(x,120);
 assert.equal(x.owner.s3?.splattercolorUntil>x.f.G.time,false);
});
