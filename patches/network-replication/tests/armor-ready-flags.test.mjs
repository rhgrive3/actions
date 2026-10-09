import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../../local-quality/adapter.mjs';import {adaptNetworkSource} from '../adapter.mjs';import {adaptRange} from '../../practice-range/adapter.mjs';
import {SPAWN_ARMOR_FLAG} from '../../splatoon3/runtime/respawn-lifecycle.mjs';
const READY=67108864;
const compose=(rel,code)=>{for(const adapt of [adaptSource,adaptTouchLayout,adaptReliability,adaptQualitySource,adaptNetworkSource,adaptRange])code=adapt(rel,code);return code;};
async function world(legacy=false){const adapt=(rel,source)=>{const code=compose(rel,source);return legacy&&rel==='src/net/netmatch.js'?code.replace('specialReady: 67108864','specialReady: 8388608'):code;};return fixture({adapt,adaptRuntime:adapt});}
function roundtrip(f,armor,ready){
 const a=f.make('shooter'),b=f.make('shooter');Object.assign(a,{nid:1,owner:'owner',invuln:0});Object.assign(b,{nid:1,owner:'owner',invuln:0});
 a.special=ready?a.specialCost():0;a.s3.spawnArmorManaged=armor;a.s3.spawnArmor=armor?{remaining:1,breakRemaining:null,hp:30}:null;
 let packet;const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,tr:{broadcast:d=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'flags'});sender.bind({actors:[a],state:'playing',time:180});sender._sendTick();
 const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false},{id:'flags'});receiver.bind({actors:[b],state:'playing',time:180});receiver.onMessage('owner',packet);receiver._peer('owner').tr=packet.ts;receiver._sample(b,packet.ts,0);receiver.applyRemote(b,1/60);
 return{a,b,packet};
}
test('old bit23 assignment conflates Armor-only and Ready-only actual snapshots',async()=>{const f=await world(true),armor=roundtrip(f,true,false),ready=roundtrip(f,false,true);assert.equal(armor.packet.a[0][10],ready.packet.a[0][10]);assert.equal(armor.a.specialReady(),false);assert.equal(armor.b.specialReady(),true);assert.equal(ready.a.s3.spawnArmorManaged,false);assert.equal(ready.b.s3.spawnArmorRemote,true);});
for(const [armor,ready]of[[false,false],[true,false],[false,true],[true,true]])test(`actual packet independently carries Armor=${armor} Ready=${ready}`,async()=>{
 const f=await world();assert.equal(f.NET_FLAGS.specialReady,READY);assert.equal(SPAWN_ARMOR_FLAG,8388608);assert.equal(READY&(SPAWN_ARMOR_FLAG|16777216|33554432),0);
 const {a,b,packet}=roundtrip(f,armor,ready),flags=packet.a[0][10];assert.equal(!!(flags&SPAWN_ARMOR_FLAG),armor);assert.equal(!!(flags&READY),ready);assert.equal(b.s3.spawnArmorRemote,armor);assert.equal(b.specialReady(),ready);assert.equal(a.specialReady(),ready);assert.equal(packet.sc[a.nid],a.specialCost());assert.equal(packet.a[0].length,24,'Super Jump clock, special count and adoption slots precede optional presentation');
});
