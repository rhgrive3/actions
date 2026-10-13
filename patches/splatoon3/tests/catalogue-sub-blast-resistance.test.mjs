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
for(const sub of ['fizzy','torpedo','inkMine'])for(const ap of [0,57])test(`${sub} actual projectile/deployable blast applies ${ap}AP source family`,async()=>{const {f,o,v}=await world();o.weapon={...o.weapon,sub};equip(v,ap);const hits=[],damage=v.damage;v.damage=function(n,a,w){hits.push([n,w]);return damage.call(this,n,a,w);};const hp=v.hp,p=f.G.projectiles.throwBomb(o);p.pos.set(0,.7,2);p.prev.copy(p.pos);p.vel.set(0,0,0);if(sub==='inkMine'){p.phase='deployed';p.activeAt=0;p.expireAt=Infinity;}else if(sub==='fizzy'){p.age=p.fuse+.01;p.popLimit=1;}else{p.pos.z=0;p.prev.copy(p.pos);p.vel.z=60;}advance(f);assert.equal(hits.length,1);assert.equal(hits[0][1],sub);assert.ok(hits[0][0]>0&&hits[0][0]<=CATALOGUE_SUB_HIT_MAX[sub]);close(hp-v.hp,expected(hits[0][0],ap,sub!=='inkMine'));});
