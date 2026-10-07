import {catalogTurfFinishProbe,validateCatalogTurfFinish} from '../../../scripts/check-inkwave-motion-catalog.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {adaptSource} from '../adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {fixture as actors} from './source-fixture.mjs';
const root=new URL('../../../',import.meta.url).pathname,site=process.env.INKWAVE_TURF_FINISH_SITE;
async function fixture(){const base=site?path.resolve(site):path.join(root,'inkwave-public'),mods=new Map(),context=vm.createContext({console,performance});
 function load(file){if(mods.has(file))return mods.get(file);let code=fs.readFileSync(file,'utf8');if(!site&&file.startsWith(base+'/')){const rel=path.relative(base,file);code=adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))));}const m=new vm.SourceTextModule(code,{context,identifier:file});mods.set(file,m);return m;}
 const entry=new vm.SourceTextModule("export * from './src/core/ctx.js'; export * from './src/game/match.js'; export * from './src/net/netmatch.js'; export * from './src/game/weapons.js'; export * as THREE from 'three';",{context,identifier:path.join(base,'fixture.mjs')});
 await entry.link((s,m)=>{let file=s==='three'?path.join(base,'vendor/three/build/three.module.js'):path.resolve(path.dirname(m.identifier),s);if(!site&&file.startsWith(base+'/patches/'))file=path.join(root,path.relative(base,file));if(!site&&file.startsWith(path.join(root,'src')+'/'))file=path.join(base,path.relative(root,file));return load(file);});await entry.evaluate();
 const api={...entry.namespace},G=api.G;let coverage=[.51,.49],calls=0,reads=0;G.paint={coverage(){reads++;return coverage;},splat(){calls++;coverage[0]=.4;coverage[1]=.6;return 1;}};G.actors=[];G.teamColors=[new api.THREE.Color('orange'),new api.THREE.Color('blue')];G.physics={raycast(_o,_d,_r,hit){hit.hit=true;hit.point.set(0,0,0);hit.normal.set(0,1,0);return hit;}};
 const m=new api.Match({duration:1/120});m.setState('playing');G.match=m;
 return {...api,m,setCoverage(c){coverage=c;},get coverage(){return coverage;},get calls(){return calls;},get reads(){return reads;},finish(){m.update(1/60);assert.equal(m.state,'finish');},judge(){for(let i=0;i<160;i++)m.update(1/60);return m.result;}};
}
const plain=v=>JSON.parse(JSON.stringify(v));
test('#410 deadline captures before synchronous state listeners and delayed judge ignores subsequent paint',async()=>{
 const f=await fixture();f.on('match:state',({state})=>{if(state==='finish')f.G.paint.splat();});f.finish();assert.deepEqual(plain(f.m.s3FinishCoverage),[.51,.49]);assert.deepEqual(f.coverage,[.4,.6]);const result=f.judge();assert.deepEqual(plain(result),{coverage:[.51,.49],winner:0});assert.equal(f.reads,1);assert.ok(Object.isFrozen(f.m.s3FinishCoverage));result.coverage[0]=0;assert.equal(f.m.s3FinishCoverage[0],.51);
});
test('#410 actual bomb explosion and actual cloud rain still run but cannot flip the frozen result',async()=>{
 const f=await fixture(),ps=new f.Projectiles(new f.THREE.Scene()),owner={addTurf(){}};f.finish();ps._explodeBomb({owner,team:1,pos:new f.THREE.Vector3()});assert.equal(f.calls,6);ps._spawnCloud({owner,team:1,pos:new f.THREE.Vector3(),dir:new f.THREE.Vector3(0,0,1)});for(let i=0;i<90;i++)ps._updateClouds(1/60);assert.ok(f.calls>6);assert.deepEqual(f.coverage,[.4,.6]);assert.deepEqual(plain(f.judge()),{coverage:[.51,.49],winner:0});ps.clear();
});
test('#410 duplicate finish keeps one snapshot; actual new playing cycle captures fresh coverage',async()=>{
 const f=await fixture();f.finish();f.setCoverage([.2,.8]);f.m.setState('finish');assert.equal(f.reads,1);assert.deepEqual(plain(f.judge().coverage),[.51,.49]);f.m.result=null;f.m.time=1/120;f.m.setState('intro');assert.equal(f.m.s3FinishCoverage??null,null);f.m.setState('playing');f.finish();assert.deepEqual(plain(f.judge()),{coverage:[.2,.8],winner:1});assert.equal(f.reads,2);
});
test('#410 host packet contains frozen coverage and native follower accepts host rather than local paint',async()=>{
 const host=await fixture();let packet;host.G.netm={sendResult:result=>host.NetMatch.prototype.sendResult.call({isHost:true,match:host.m,_sendNow:d=>{packet=d;}},result)};host.finish();host.G.paint.splat();host.judge();assert.deepEqual(plain(packet.cov),[.51,.49]);
 const follower=await fixture();follower.m.follower=true;follower.setCoverage([.1,.9]);follower.m.setState('finish');assert.equal(follower.reads,0);follower.NetMatch.prototype._result.call({isHost:false,match:follower.m,byNid:new Map()},packet);assert.deepEqual(plain(follower.m.result),{coverage:[.51,.49],winner:0});assert.equal(follower.m.state,'judge');assert.equal(follower.m.s3FinishCoverage??null,null);
});
test('#410 neutralization clears current/previous sub together so no release edge is manufactured',async()=>{
 const f=await fixture(),a=await actors(),local=a.make('shooter');local.intent.fire=local.intent.sub=local.intent.jump=local.intent.special=true;local._prevIntent.fire=local._prevIntent.sub=local._prevIntent.jump=local._prevIntent.special=true;local.fireBuffer=.16;local.jumpBuffer=.1;local.intent.move.set(1,0,0);local.weaponRunner.aimingSub=true;let throws=0;a.G.projectiles.throwBomb=()=>throws++;f.m.local=local;f.finish();assert.equal(local.intent.move.length(),0);assert.equal(local.fireBuffer,0);assert.equal(local.jumpBuffer,0);for(const key of ['fire','sub','jump','special','squid']){assert.equal(local.intent[key],false);assert.equal(local._prevIntent[key],false);}a.tick(local);assert.equal(throws,0);assert.equal(a.shots.length,0);
});
test('#410 Boss result path bypasses Turf coverage and preserves native result delivery',async()=>{
 const f=await fixture(),expected={mode:'boss',winner:1,coverage:[0,1]};f.m.bossMode={result:()=>expected};f.m.setState('finish');f.m._judge();assert.equal(f.m.result,expected);assert.equal(f.reads,0);assert.equal(f.m.s3FinishCoverage??null,null);
});

test('#410 fixed-step deadline and Alpha tie are stable across 30/60/120/144Hz render partitions',async()=>{
 for(const hz of [30,60,120,144]){const f=await fixture(),clock=new FixedClock();f.setCoverage([.5,.5]);f.m.time=.045;for(let frame=0;frame<hz*3;frame++)clock.advance(1/hz,dt=>{f.m.update(dt);if(f.m.state==='finish')f.G.paint.splat();});assert.deepEqual(plain(f.m.result),{coverage:[.5,.5],winner:0});assert.equal(f.reads,1);assert.ok(f.calls>0);}
});

test('catalog Match entry executes native finish/judge and rejects an uncaptured negative control',async()=>{
 const f=await fixture(),paint=f.G.paint,net=f.G.netm;
 validateCatalogTurfFinish(catalogTurfFinishProbe(f.Match,f.G));assert.equal(f.G.paint,paint);assert.equal(f.G.netm,net);
 class Uncaptured extends f.Match { setState(state){this.state=state;} }
 assert.throws(()=>validateCatalogTurfFinish(catalogTurfFinishProbe(Uncaptured,f.G)),/native Turf finish/);
 assert.equal(f.G.paint,paint);assert.equal(f.G.netm,net);
});
