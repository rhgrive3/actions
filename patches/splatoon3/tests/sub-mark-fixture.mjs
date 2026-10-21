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
 const nm=new f.NetMatch({myId:id,hostId:'a',isHost:id==='a',tr},{id:'mark-resistance'});f.G.match.actors=[o,v];f.G.match.removeActor=a=>{f.G.match.actors=f.G.match.actors.filter(x=>x!==a);f.G.actors=f.G.actors.filter(x=>x!==a);};nm.bind(f.G.match);f.G.netm=nm;f.G.actors=[o,v];
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 return{f,o,v,nm};
}

export {near,equip,world,peer};
