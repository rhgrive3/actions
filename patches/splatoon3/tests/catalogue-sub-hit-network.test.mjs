import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
import {LOW_SUB_RESISTANCE_CURVE,subResistanceBand} from '../runtime/sub-resistance.mjs';
import {CATALOGUE_SUB_HIT_MAX,isHitPayloadValid} from '../../reliability/net-hit-payload-adapter.mjs';
function equip(a,ap){a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout)if(ap>=10){p.main='subResistance';ap-=10;}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]='subResistance';ap-=3;}a.s3RefreshGear();}
function close(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
const expected=(n,ap,low)=>Math.floor(n*gearCurve(ap,1,.75,low?.6:.5)*10+1e-9)/10;
async function world(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.match={state:'playing',playing:()=>true};f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);const o=f.make(),v=f.make();o.team=0;v.team=1;v.invuln=0;o.pos.set(0,0,-4);v.pos.set(0,0,2);o.aimDir.set(0,0,1);o.weapon={...o.weapon,sub:'burst'};f.G.actors=[o,v];return {f,o,v};}
function throwBurst(f,o){const p=f.G.projectiles.throwBomb(o);p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,60);return p;}
function advance(f,fps=60){for(let i=0;i<10;i++){f.G.time+=1/fps;f.G.projectiles.update(1/fps);}}
for(const [w,n]of Object.entries(CATALOGUE_SUB_HIT_MAX))for(const ap of [0,57])test(`${w} JSON bounded raw hit reaches victim ${ap}AP once`,async()=>{const {f,o,v}=await world();Object.assign(o,{nid:1,owner:'attacker',netLife:0});Object.assign(v,{nid:2,owner:'victim',netLife:0});equip(v,ap);equip(o,57);let packet;const tx=new f.NetMatch({myId:'attacker',hostId:'attacker',isHost:true,tr:{sendTo:(_id,p)=>{packet=JSON.parse(JSON.stringify(p));}}},{id:'catalogue-sub'});tx.bind({actors:[o,v],state:'playing',time:180});tx.sendHit(o,v,n,w);assert.equal(packet.d,n);let ack;const rx=new f.NetMatch({myId:'victim',hostId:'attacker',isHost:false,tr:{sendTo:(_id,p)=>{ack=JSON.parse(JSON.stringify(p));}}},{id:'catalogue-sub'});rx.bind({actors:[o,v],state:'playing',time:180});f.G.netm=rx;const hp=v.hp;rx.onMessage('foreign',packet);rx.onMessage('attacker',{...packet,d:n+.1});assert.equal(v.hp,hp);rx.onMessage('attacker',packet);close(hp-v.hp,expected(n,ap,['burst','fizzy'].includes(w)));close(ack.d,expected(n,ap,['burst','fizzy'].includes(w)));const after=v.hp;rx.onMessage('attacker',packet);assert.equal(v.hp,after);});
