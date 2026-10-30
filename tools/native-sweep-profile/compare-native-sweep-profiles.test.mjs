import test from 'node:test';
import assert from 'node:assert/strict';
import {compareNativeSweepProfiles} from './compare-native-sweep-profiles.mjs';
function pair(){
 const source={schema:1,sourceHead:'a'.repeat(40),mode:'source',manifestContentHash:'d'.repeat(64),buildRevision:'e'.repeat(64),sourceInputHash:'f'.repeat(64),runtimeBoundToSelectedBytes:true,runtimeExpectedSHA256:'b'.repeat(64),runtimeOriginalSHA256:'b'.repeat(64),dt:1/60,steps:120,seeds:[0x17571671,0x32501],cacheMeaning:'scratch only',instrumentation:'QA',scope:'synthetic fixture',observationScope:'projected fields',rows:[]};
 for(const scenario of ['flat','wall','moving'])for(const weapon of ['shooter','s3-blaster-short'])for(const seed of source.seeds){
  const counters=Object.fromEntries(['catalogue','level','sourceQueries','queryCountDelta','sourceHits','totalHits','misses','queryBoxCalls','bvhNodeVisits','candidateTriangles','triangleTests','dynamicOBBCalls','sourceOptionsReused','sourceOutputReused','bvhStackReused','errors'].map(k=>[k,0]));
  counters.level=1;counters.misses=1;
  source.rows.push({scenario,weapon,seed,counters,hitRate:0,observerParity:true,behaviorSHA256:'c'.repeat(64)});
 }
 const emitted=JSON.parse(JSON.stringify(source));emitted.mode='emitted';emitted.manifestContentHash='d'.repeat(64);return [source,emitted];
}
test('complete equal source/emitted observations pass without a performance claim',()=>{assert.equal(compareNativeSweepProfiles(...pair()).performanceClaim,false);});
for(const [name,mutate] of [
 ['counter mismatch',p=>p[1].rows[0].counters.bvhNodeVisits++],
 ['different behavior',p=>p[1].rows[0].behaviorSHA256='f'.repeat(64)],
 ['wrong source head',p=>p[1].sourceHead='e'.repeat(40)],
 ['missing manifest',p=>p[1].manifestContentHash=null],
 ['duplicate scenarios both modes',p=>{for(const x of p)x.rows[1]=x.rows[0];}],
 ['missing required counter both modes',p=>{for(const x of p)delete x.rows[0].counters.sourceQueries;}],
 ['wrong dt both modes',p=>{for(const x of p)x.dt=1/30;}],
 ['observer parity false',p=>{for(const x of p)x.rows[0].observerParity=false;}],
 ['runtime expected-byte mismatch',p=>p[1].runtimeOriginalSHA256='1'.repeat(64)],
 ['64 revision mistaken for gitsha',p=>{for(const x of p)x.buildRevision=x.sourceHead;}],
 ['fabricated hit rate',p=>{for(const x of p)x.rows[0].hitRate=1;}],
])test(name+' fails closed',()=>{const p=pair();mutate(p);assert.throws(()=>compareNativeSweepProfiles(...p));});
