import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function equip(a,ap,ability='subResistance'){a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout){if(ap>=10){p.main=ability;ap-=10;}}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]=ability;ap-=3;}a.s3RefreshGear();}
async function world(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {Transport} from './inkwave-public/src/net/transport.js'; export {pointSensorMark} from './patches/splatoon3/runtime/support-recon.mjs';"});f.G.match={playing:()=>true,state:'playing',time:180,duration:180};return f;}
async function peer(id,sub,ap){
 const f=await world();f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.scene ||= new f.THREE.Scene();f.G.camera ||= new f.THREE.PerspectiveCamera();
 const o=f.make('shooter'),v=f.make('shooter');Object.assign(o,{nid:1,owner:'a',team:0,remote:id!=='a',invuln:0});Object.assign(v,{nid:2,owner:'b',team:1,remote:id!=='b',invuln:0});equip(v,ap);o.weapon={...o.weapon,sub};o.pos.set(0,0,0);o.aimDir.set(0,0,1);v.pos.set(0,0,2);
 const tr=new f.Transport();tr.ws={readyState:1,bufferedAmount:0,send(){}};
 const nm=new f.NetMatch({myId:id,hostId:'a',isHost:id==='a',tr,_members:new Map([['a',{}],['b',{}],['c',{}]])},{id:'mark-resistance'});f.G.match.actors=[o,v];f.G.match.removeActor=a=>{f.G.match.actors=f.G.match.actors.filter(x=>x!==a);f.G.actors=f.G.actors.filter(x=>x!==a);};nm.bind(f.G.match);f.G.netm=nm;f.G.actors=[o,v];
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 return{id,f,o,v,nm};
}
// #1975 admits sub/support rows only from the owner's actual tick. Send the
// sender's real tick through its transport and play it on the receiver exactly
// as NetMatch does; returns the delivered packets.
function capture(a){
 const ws=a.nm.s.tr.ws,send=ws.send,raw=[];ws.send=s=>raw.push(s);
 try{a.nm._sendTick();}finally{ws.send=send;}
 return raw.filter(s=>s.startsWith('b|')).map(s=>JSON.parse(s.slice(2))).filter(p=>p.k==='t');
}
function deliver(b,from,packets,keep=()=>true){
 packets=JSON.parse(JSON.stringify(packets));
 for(const p of packets){if(p.e)p.e=p.e.filter(keep);b.nm.onMessage(from,p);const peer=b.nm.peers.get(from);for(const e of peer?.events.splice(0)||[])b.nm._play(from,e);}
 return packets;
}
function tickTo(a,b,keep=()=>true){return deliver(b,a.id,capture(a),keep);}
// Throw through the native WeaponRunner so the owner's tick carries its ink debit.
function nativeThrow(a){
 const p=a.f.G.projectiles,sub=a.o.weapon.sub,list=()=>sub==='pointSensor'?(p._s3SupportSensors||[]):(p._s3SubObjects||[]);
 const before=new Set(list());a.o.ink=100;a.o.intent.sub=true;a.o.weaponRunner.update(1/60,{sub:true,subReleased:false});a.o.intent.sub=false;
 for(let i=0;i<30&&!list().some(o=>!before.has(o));i++)a.o.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
 return list().find(o=>!before.has(o));
}
// Advance the receiver's own fixed-step world (its native contact owns marks).
function stepUntil(b,done,frames=60){for(let i=0;i<frames&&!done();i++){b.f.G.time+=1/60;b.f.G.projectiles.update(1/60);}return done();}

export {near,equip,world,peer,tickTo,stepUntil,nativeThrow,capture,deliver};
