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
test('BombL curve is hash-bound to 11.3.0 and cause bands are explicit',()=>{const bytes=fs.readFileSync(new URL('../reference/gear-params-1130.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e');assert.deepEqual(LOW_SUB_RESISTANCE_CURVE,[...JSON.parse(bytes).DamageRt_BombL].reverse());for(const w of ['burst','fizzy','torpedo','torpedo-splash'])assert.equal(subResistanceBand(w),'low');assert.equal(subResistanceBand('inkMine'),'high');assert.equal(subResistanceBand('weapon'),null);for(const [w,n]of Object.entries(CATALOGUE_SUB_HIT_MAX)){assert.equal(isHitPayloadValid({w,d:n}),true);assert.equal(isHitPayloadValid({w,d:n+.1}),false);assert.equal(isHitPayloadValid({w:w+'-forged',d:n}),false);}});
for(const [w,n]of Object.entries(CATALOGUE_SUB_HIT_MAX))for(const ap of [0,10,57])test(`${w} actual Actor ${ap}AP victim uses its source family once`,async()=>{const {o,v}=await world();equip(v,ap);equip(o,57);const hp=v.hp;v.damage(n,o,w);close(hp-v.hp,expected(n,ap,w!=='inkMine'));});
