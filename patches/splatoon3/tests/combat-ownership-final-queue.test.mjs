import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {withShotBias} from '../runtime/weapon-accuracy.mjs';
import {advanceShooterNearestSlot} from '../runtime/shooter-nearest-paint.mjs';
import {ADDED_PAINT_MODEL,addedFamilySplash,collectBrellaSplashes} from '../runtime/added-family-paint.mjs';
test('public shot-bias callback can retain independent records through later shots and nested failure',()=>{
 const actor={weaponRunner:{s3ShotBias:{original:true}}},original=actor.weaponRunner.s3ShotBias;
 const a=withShotBias(actor,.2,.3,()=>actor.weaponRunner.s3ShotBias);
 const b=withShotBias(actor,.7,.8,()=>{assert.throws(()=>withShotBias(actor,.9,.1,()=>{throw Error('nested');}),/nested/);return actor.weaponRunner.s3ShotBias;});
 assert.notEqual(a,b);assert.deepEqual(a,{horizontal:.2,pitch:.3});assert.deepEqual(b,{horizontal:.7,pitch:.8});assert.equal(actor.weaponRunner.s3ShotBias,original);
});
test('nearest validation deliberately skips sparse slots and validates before advancing the published counter',()=>{
 const sparse=Array(3);sparse[2]=2;const r={s3ShooterNearestSlot:0};assert.equal(advanceShooterNearestSlot(r,{SplitNum:4,ForceSpawnNearestAddNumArray:sparse}),false);assert.equal(r.s3ShooterNearestSlot,1);
 let membershipReads=0;const force=[2];force.includes=function(slot){membershipReads++;assert.equal(r.s3ShooterNearestSlot,2);return Array.prototype.includes.call(this,slot);};assert.equal(advanceShooterNearestSlot(r,{SplitNum:4,ForceSpawnNearestAddNumArray:force}),true);assert.equal(membershipReads,1);
 const bad={SplitNum:4,ForceSpawnNearestAddNumArray:[5]};assert.throws(()=>advanceShooterNearestSlot(r,bad),RangeError);assert.equal(r.s3ShooterNearestSlot,2);
});
import {catalogSplashDropSpec,catalogSplashFirst} from '../runtime/catalog-splash-paint.mjs';
test('added-family splash spread eagerly reads enumerable extras before target source fields',()=>{
 const src=fs.readFileSync(new URL('../runtime/added-family-paint.mjs',import.meta.url),'utf8');const code=src.slice(src.indexOf('export function addedFamilySplash'),src.indexOf('export function brellaSplashPlan')).replace('export ','').replace('{ ...spawn, SpawnNearestLength:nearest, SpawnBetweenLength:spacing }','{ SplitNum:spawn.SplitNum,ForceSpawnNearestAddNumArray:spawn.ForceSpawnNearestAddNumArray,SpawnNearestLength:nearest,SpawnBetweenLength:spacing }');
 const candidate=new Function('finite','catalogSplashFirst','catalogSplashDropSpec','ADDED_PAINT_MODEL',code+';return addedFamilySplash;')((x,d)=>Number.isFinite(x)?x:d,catalogSplashFirst,catalogSplashDropSpec,ADDED_PAINT_MODEL);
 function run(fn){let reads=0;const spawn={DropInterval:3,NearestLen:1,SplitNum:1,SplashNumMax:1};Object.defineProperty(spawn,'extra',{enumerable:true,get(){reads++;spawn.SplashNumMax++;return 0;}});const result=fn({SplashSpawnParam:spawn,SplashPaintParam:{WidthHalf:1},MoveParam:{FreeGravity:.016}},'stringer',0);return {reads,count:result.count};}
 assert.deepEqual(run(addedFamilySplash),{reads:2,count:3});assert.deepEqual(run(candidate),{reads:1,count:2},'direct sparse reads change the actual helper result');
});
class V{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}clone(){return new V(this.x,this.y,this.z);}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}multiplyScalar(k){this.x*=k;this.y*=k;this.z*=k;return this;}distanceTo(v){return Math.hypot(v.x-this.x,v.y-this.y,v.z-this.z);}lerp(v,k){this.x+=(v.x-this.x)*k;this.y+=(v.y-this.y)*k;this.z+=(v.z-this.z)*k;return this;}}
test('Brella release receives fresh random-velocity snapshots and reads source edits between release callbacks',()=>{
 const source={SplashPaintWidthOneActive:1,SplashPaintWidthFullActive:1,SplashPaintDepthScaleOneActive:1,SplashPaintDepthScaleFullActive:1,RandomSpawnVelXMax:1};
 const volley={next:0,nodes:[],plan:{first:0,spacing:1,count:2,source}},node={volley,distance:0,ended:false,samples:new Map()};volley.nodes=[node];const seen=[];
 collectBrellaSplashes(node,{prev:new V(),age:1},new V(2,0,0),false,(_c,_r,spec)=>{seen.push(spec.randomVelocity);source.RandomSpawnVelXMax=2;});
 assert.equal(seen.length,2);assert.notEqual(seen[0],seen[1]);assert.equal(seen[0].x,60);assert.equal(seen[1].x,120);
});
