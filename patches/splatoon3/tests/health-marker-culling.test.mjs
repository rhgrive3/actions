import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {buildHealthMarkers, healthHitAge} from '../runtime/combat-info.mjs';

globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
function scene() {
 const viewer = {team:0,alive:true,hp:100};
 const camera = new THREE.PerspectiveCamera(60,4/3,.1,100);
 camera.updateMatrixWorld();
 const actors = [viewer]; let calls = 0;
 const game = {match:{local:viewer,actors}};
 const G = {camera,time:0,teamHex:['#f80','#08f'],physics:{los(){calls++;return true;}}};
 const add = (x,z,team=1) => {
  const pos = new THREE.Vector3(x,0,z);
  const actor = {team,alive:true,hp:100,pos,form:'kid',anim:{form:'kid'},s3:{},character:{getHeadPosition(out){return out.copy(pos);}}};
  actors.push(actor);return actor;
 };
 return {game,G,viewer,add,draw:()=>buildHealthMarkers(game,G,{hp:100},THREE),calls:()=>calls};
}

test('health bars cull clipped enemies before LOS without changing visible bars',()=>{
 const s=scene(),front=s.add(0,-5),outside=s.add(100,-5),behind=s.add(0,5);
 s.draw();for(const a of [front,outside,behind])a.hp=70;s.G.time=.1;
 const rows=s.draw();assert.equal(rows.length,1);assert.equal(rows[0].hp,.7);
 assert.equal(s.calls(),1,'only the on-screen damaged enemy requires occlusion');
 assert.equal(healthHitAge(outside,.1),0);assert.equal(healthHitAge(behind,.1),0);
});

test('offscreen damage remains observed and expires at 30/60/120 Hz',()=>{
 for(const hz of [30,60,120]){
  const s=scene(),enemy=s.add(100,-5);s.draw();enemy.hp=65;s.G.time=1;s.draw();
  for(let i=1;i<hz*2;i++){s.G.time=1+i/hz;s.draw();}
  enemy.pos.x=0;s.G.time=3;assert.equal(s.draw().length,1);
  s.G.time=4;assert.equal(s.draw().length,0,'original three-second window expires');
 }
});

test('health marker rows survive visibility gaps and retain only scalar values',()=>{
 const s=scene(),ally=s.add(0,-5,0);s.draw();ally.hp=50;const first=s.draw()[0];
 for(let i=0;i<100;i++){
  ally.pos.x=100;assert.equal(s.draw().length,0);
  ally.pos.x=0;assert.strictEqual(s.draw()[0],first);
 }
 assert.equal(s.game._hudHealthPool.length,1);
 assert(Object.values(first).every(v=>typeof v==='number'||typeof v==='string'));
 assert.equal(s.calls(),0,'allies remain independent of enemy occlusion');
});

test('revealed enemies bypass LOS; invalid projected heads never query world',()=>{
 const s=scene(),enemy=s.add(0,-5);s.draw();enemy.hp=70;enemy.submerged=true;
 enemy.s3.revealedUntil={0:10};s.G.time=1;assert.equal(s.draw().length,1);
 assert.equal(s.calls(),0);
 enemy.submerged=false;enemy.s3.revealedUntil={};enemy.pos.x=NaN;
 assert.equal(s.draw().length,0);assert.equal(s.calls(),0);
});
