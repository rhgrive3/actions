import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const available=!!ROOT&&fs.existsSync(path.join(ROOT,'umami/manifest.json'));
test('Umami tower retains the entire source swept rider footprint and normal input boarding',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(ROOT,'umami')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};
 const S=f.nativeRankedStage(G),T=S.tower;
 assert.equal(T.supported,true,T.evidence||T.reason||'Umami needs a proved source tower route');assert.ok(T.path.length>2);
 const {nativeTowerClearance}=await import('../runtime/native-tower-clearance.mjs');
 const check=nativeTowerClearance(L,P.actorBody??PLAYER,T.halfSize);
 for(let i=0;i<T.path.length;i++)assert.ok(check.clear(T.path[i],T.path[Math.max(0,i-1)]),'full original source sweep segment '+i);
 for(const [team,spawn]of L.spawnPads.entries())for(const approach of T.boarding.approaches)assert.ok(G.nav.path(G.nav.nearest(spawn,1.2),approach.sourceNode,team,50000),'both opposing teams reach each real ground approach');
 const pad=T.path[T.centerIndex],approach=T.boarding.approaches[T.centerIndex];assert.ok(approach);
 L._addBlock({kind:'obox',center:[pad[0],pad[1]-.12,pad[2]],size:[T.halfSize*2,.24,T.halfSize*2],rotY:0,paint:false,hidden:true});const deckId=L.blocks.at(-1).id;
 L._addBlock({kind:'obox',center:[pad[0],pad[1]+.945,pad[2]],size:[.56,2.13,.56],rotY:0,paint:false,hidden:true});
 const proofs=[];
 for(const hz of [30,60,120]){
  const a=f.make('shooter');a._integrate=f.Actor.prototype._integrate;a.spawnAt(new THREE.Vector3(...approach.start),0);a._resolve(false,a.pos.y,false);assert.ok(a.grounded&&a.ground.hit,'actual ground approach');
  const direction=new THREE.Vector3(approach.end[0]-a.pos.x,0,approach.end[2]-a.pos.z).normalize();a.vel.set(0,0,0);let boarded=false;
  for(let i=0;i<hz;i++){a.intent.jump=i<hz*.4;a.intent.move.copy(direction);if(Math.hypot(a.pos.x-approach.end[0],a.pos.z-approach.end[2])<.15)a.intent.move.set(0,0,0);G.time+=1/hz;a.update(1/hz);if(a.grounded&&a.ground.hit&&a.ground.block===deckId){boarded=true;break;}}
  assert.ok(boarded,'real source ground input boards at '+hz+' Hz');proofs.push({hz,boarded});
 }
 console.log(JSON.stringify({umamiTower:{pathNodes:T.path.length,allSweptSegmentsClear:true,bothTeamsReachAllApproaches:true,halfSize:T.halfSize,localLift:T.localLift,inputBoarding:proofs,sourceClearance:T.sourceClearance}}));
});
