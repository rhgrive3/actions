import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';

test('an active source Drop input owner releases stale lifecycle contexts without changing pose or velocity',async()=>{
 const f=await nativeFixture(),{G,THREE}=f;
 const edge={to:1,drop:{upper:[0,2,0],landing:[0,0,2],direction:[0,0,1]}},nodes=[{id:0,x:0,y:2,z:0,nb:[edge]},{id:1,x:0,y:0,z:2,nb:[]}],level={native:true,manifest:{sourceNavigation:{highDrops:true}}},nav={nodes},match={mode:'turf'};
 const a={alive:true,grounded:false,pos:new THREE.Vector3(0,1,0),vel:new THREE.Vector3(0,-1,2),intent:{move:new THREE.Vector3(9,0,8),fire:true,squid:true,jump:true,sub:true,special:true}},brain={a,path:[0,1],pi:1,noProg:1,goalTimer:5,repath:5};
 Object.assign(G,{level,nav,match});const owner=()=>({edge,path:brain.path,phase:'depart',seconds:0,level,nav,match,mode:'turf'});
 brain._nativeDrop=owner();assert.equal(f.updateNativeDrop(brain,G,1/60),true);assert.deepEqual(Array.from(a.intent.move.toArray()),[0,0,1],'the actual helper owns ordinary valid airborne departure input');
 const cases=[
  ['level',()=>{G.level={...level};},()=>{G.level=level;}],
  ['navigation',()=>{G.nav={...nav};},()=>{G.nav=nav;}],
  ['Match',()=>{G.match={...match};},()=>{G.match=match;}],
  ['mode',()=>{match.mode='clams';},()=>{match.mode='turf';}],
  ['death',()=>{a.alive=false;},()=>{a.alive=true;}],
  ['special',()=>{a.specialActive={id:'krakenRoyale'};},()=>{a.specialActive=null;}],
  ['superjump',()=>{a.superJumpState={phase:'flight'};},()=>{a.superJumpState=null;}],
  ['initial launch',()=>{a.s3={squidSpawn:{phase:'flight'}};},()=>{a.s3=null;}],
  ['opt out',()=>{level.manifest.sourceNavigation={};},()=>{level.manifest.sourceNavigation={highDrops:true};}],
  ['missing navigation',()=>{G.nav=null;},()=>{G.nav=nav;}],
 ];
 for(const [name,invalidate,restore]of cases){
  brain.path=[0,1];brain._nativeDrop=owner();a.intent.move.set(9,0,8);a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=true;
  const position=a.pos.toArray(),velocity=a.vel.toArray();invalidate();assert.equal(f.updateNativeDrop(brain,G,1/60),false,name);assert.equal(brain._nativeDrop,null,name+' clears the actual owner');assert.deepEqual(Array.from(a.intent.move.toArray()),[9,0,8]);assert(a.intent.fire&&a.intent.squid&&a.intent.jump&&a.intent.sub&&a.intent.special);assert.deepEqual(a.pos.toArray(),position);assert.deepEqual(a.vel.toArray(),velocity);restore();
 }
});
