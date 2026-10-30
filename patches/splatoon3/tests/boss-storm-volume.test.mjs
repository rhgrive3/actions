import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {test} from 'node:test';
import {fixture,bossCode,rawBoss,weapons} from './helpers/boss-storm-native-fixture.mjs';import {bossRainVerticalOverlap as overlaps} from '../runtime/boss-storm-volume.mjs';import {adaptBossStormVolume} from '../boss-storm-volume-adapter.mjs';
const shape=(y,r=2,active=true)=>({active,r,pos:{x:0,y,z:0}});
test('existing ray slab is inclusive at both spherical-body boundaries without an Actor foot offset',()=>{
 for(const[y,r,on]of [[85.199,2,false],[85.2,2,true],[85.201,2,true],[101.2,2,true],[101.201,2,false]])assert.equal(overlaps([shape(y,r)],87.2,99.2),on);
});
test('current main far-Boss counterexample flips from0.4 to0; ordinary near Actor remains unchanged',()=>{
 const old=fixture({bossY:-1000,disableBossGuard:true}),next=fixture({bossY:-1000});old.p._updateClouds(1/60);next.p._updateClouds(1/60);assert.equal(old.bossTotal(),.4);assert.equal(next.bossTotal(),0);assert.equal(next.total(),old.total());
});
test('actual body, not floor anchor, controls eligibility; multiple shapes never multiply one cloud tick',()=>{
 const tall=fixture({bossY:-1000,hitShapes:[shape(90),shape(95)]});tall.p._updateClouds(1/60);assert.equal(tall.bossTotal(),.4);
 const rootOnly=fixture({bossY:90,hitShapes:[shape(-1000)]});rootOnly.p._updateClouds(1/60);assert.equal(rootOnly.bossTotal(),0);
});
test('unknown/empty/inactive/nonfinite geometry preserves legacy damage rather than inventing immunity',()=>{
 for(const shapes of [undefined,null,[],[shape(90,2,false)],[shape(NaN)],[shape(90,Infinity)],[{active:true,pos:null,r:2}],[shape(-1000),shape(NaN)],[shape(-1000),{}],[shape(-1000),null],[shape(-1000),{pos:{x:0,y:90,z:0},r:2}]]){
  if(shapes===undefined)continue;const f=fixture({bossY:-1000,hitShapes:shapes});f.p._updateClouds(1/60);assert.equal(f.bossTotal(),.4);
 }
 assert.equal(overlaps(null,87.2,99.2),null);assert.equal(overlaps([shape(90)],NaN,99.2),null);
 const missingModel=fixture({bossY:-1000});delete missingModel.G.boss.model;missingModel.p._updateClouds(1/60);assert.equal(missingModel.bossTotal(),.4);
});
test('30/60/120Hz valid Boss contact retains24HP/s and far body remainszero',()=>{
 for(const hz of [30,60,120]){const near=fixture({bossY:90}),far=fixture({bossY:-1000});for(let i=0;i<hz*2;i++){near.p._updateClouds(1/hz);far.p._updateClouds(1/hz);}assert(Math.abs(near.bossTotal()-48)<1e-9);assert.equal(far.bossTotal(),0);}
});
test('horizontal, visibility, dead, remote and adopted-cloud ownership contracts remain unchanged',()=>{
 for(const change of [f=>f.G.boss.pos.x=12.401,f=>f.G.boss.dead=true,f=>f.G.boss.visible=false]){const f=fixture({bossY:90});change(f);f.p._updateClouds(1/60);assert.equal(f.bossTotal(),0);}
 const remote=fixture({bossY:90,remoteOwner:true}),ghost=fixture({bossY:90,ghost:true,remoteOwner:true}),adopted=fixture({bossY:90,ghost:true,remoteOwner:false});for(const f of [remote,ghost,adopted])f.p._updateClouds(1/60);assert.equal(remote.bossTotal(),0);assert.equal(ghost.bossTotal(),0);assert.equal(adopted.bossTotal(),.4);
});
test('legacy five-argument calls and existing batch/flush body are preserved; no cover/S3 parity is asserted',()=>{
 const f=fixture({bossY:-1000});f.G.boss.rain(f.owner,0,0,10,.4);assert.equal(f.bossTotal(),.4);
 const before=rawBoss,after=bossCode;const a=before.indexOf('  _flushRain(dt)'),b=after.indexOf('  _flushRain(dt)');const endA=before.indexOf('\n  }',a)+4,endB=after.indexOf('\n  }',b)+4;assert.equal(after.slice(b,endB),before.slice(a,endA));
 const start=after.indexOf('  _flushRain(dt)'),end=after.indexOf('\n  }',start)+4;const Flush=vm.runInNewContext('class Flush{'+after.slice(start,end)+'};Flush');const calls=[];const obj={_rain:new Map([[f.owner,.8]]),_rainT:0,hit:(...args)=>calls.push(args)};Flush.prototype._flushRain.call(obj,1/60);assert.equal(calls.length,1);assert.equal(calls[0][0],f.owner);assert.equal(calls[0][1],.8);assert.equal(obj._rain.size,0);
 const covered=fixture({bossY:90,cover:true});covered.p._updateClouds(1/60);assert.equal(covered.total(),0);assert.equal(covered.bossTotal(),.4,'Boss cover remains intentionally outside this partial guard');
});

test('registered production owners are not silently reapplied and unrelated source is unchanged',()=>{assert.throws(()=>adaptBossStormVolume('src/game/weapons.js',weapons),/expected one/);assert.throws(()=>adaptBossStormVolume('src/boss/boss.js',bossCode),/expected one/);assert.equal(adaptBossStormVolume('styles/ui.css','UNCHANGED'),'UNCHANGED');});
