import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
// Native movement integration only. No full production composition or GPU.
const rows=[];
for(const hz of [30,60,120]){
 const context=vm.createContext({console,performance,crypto:globalThis.crypto,URL,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout,queueMicrotask,innerWidth:1280,innerHeight:720});
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file);
  const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});cache.set(file,mod);return mod;
 }
 function resolve(spec,from){if(spec==='three')return root+'/inkwave-public/vendor/three/build/three.module.js';let file=path.resolve(path.dirname(from),spec);if(file.startsWith(root+'/inkwave-public/patches/'))file=root+file.slice((root+'/inkwave-public').length);if(file.startsWith(root+'/src/'))file=root+'/inkwave-public'+file.slice(root.length);return file;}
 const mod=new vm.SourceTextModule(`export * from './inkwave-public/src/game/actor.js';export * from './inkwave-public/src/core/ctx.js';export * from './inkwave-public/src/config.js';export * from './inkwave-public/src/game/weapons.js';export * from './inkwave-public/src/game/physics.js';export {Level} from './inkwave-public/src/world/level.js';export * as THREE from 'three';export {installAllSpecials} from './patches/splatoon3/runtime/all-specials.mjs';`,{context,identifier:root+'/startup-fixture.mjs'});
 await mod.link((spec,from)=>load(resolve(spec,from.identifier)));await mod.evaluate();
 const api={...mod.namespace}, {G,Actor,Projectiles,Physics,Level,THREE}=api;
 G.scene=new THREE.Scene();G.time=0;G.mode='match';G.actors=[];G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
 G.match={mode:'turf',state:'playing',playing:()=>true,canRespawn:()=>false};G.paint={sample:()=>1,splat:()=>0};
 G.level=new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,0],[40,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]}]});G.physics=new Physics(G.level);G.projectiles=new Projectiles(G.scene);
 class Character{constructor(){this.root=new THREE.Group();}setVisible(){}setHurt(){}setWeapon(){}trigger(){}update(){} }
 api.installAllSpecials(api);
 const a=new Actor({team:0,name:'startup unit',weapon:'shooter',CharacterClass:Character});G.actors.push(a);
 a.weapon={...a.weapon,special:'krakenRoyale',specialCost:100};a.special=100;
 a.grounded=a.ground.hit=true;a.ground.face=0;a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,0,30);a.intent.move.set(0,0,1);a._startSpecial();
 for(let i=1;i<hz;i++){G.time=i/hz;a._updateSpecial(1/hz);assert.equal(a._s3AllSpecialState.phase,'startup');assert.equal(a.pos.z,0);assert.equal(a.intent.move.z,1);}
 G.time=1;a._updateSpecial(1/hz);assert.equal(a._s3AllSpecialState.phase,'active');assert.ok(a.pos.z>0);assert.equal(a.intent.move.z,1);
 rows.push({hz,phase:a._s3AllSpecialState.phase,startupSeconds:1,firstActivePosition:a.pos.toArray(),firstActiveVelocity:a.vel.toArray(),heldInputPreserved:a.intent.move.z===1});
}
console.log(JSON.stringify({scope:'Real raw public Actor/Physics/Level with installed all-specials; no full production adapter composition and no browser/GPU',rows},null,2));
