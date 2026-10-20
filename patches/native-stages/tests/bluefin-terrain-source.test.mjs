import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.INKWAVE_TERRAIN_ASSETS,available=root&&fs.existsSync(path.join(root,'bluefin/manifest.json'));
test('Bluefin central source moss supports walking and paint on both sides at 30/60/120 Hz',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE}=f,data=readStage(root,'bluefin'),L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 assert.equal(data.manifest.sourceSha256,'e6effc27b375336108429c8c1fc7cd93dc5e8e1559b1b2e0cde6d98d65853527');
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.match.mode='turf';G.match.opts={};
 const down=new THREE.Vector3(0,-1,0),cases=[];
 for(const sign of [-1,1])for(const hz of [30,60,120]){
  const start=new THREE.Vector3(sign*12,3,sign*6),h=P.raycast(start.clone().add(new THREE.Vector3(0,.2,0)),down,.4);
  assert(h.hit&&Math.abs(h.point.y-3)<1e-6,'original central floor exists');
  assert.match(data.manifest.objects[data.objectIds[h.triangle]].name,/GroundGrassMoss/);assert(h.face>=0,'floor has an exact paint chart');
  G.paint.splat(h.point.clone().addScaledVector(h.normal,.03),.7,0,{instant:true,seed:.1});assert.equal(G.paint.sample(h.face,h.u,h.v),1);
  const a=f.make('shooter');a._integrate=f.Actor.prototype._integrate;a.spawnAt(start,0);a.intent.move.set(sign,0,0);
  let supports=0;for(let i=0;i<hz*.5;i++){G.time+=1/hz;a.update(1/hz);assert(a.alive&&a.grounded&&Math.abs(a.pos.y-3)<.01,'continuous central source support');supports++;}
  assert(a.pos.distanceTo(start)>1);cases.push({sign,hz,supports,start:start.toArray(),end:a.pos.toArray()});
 }
 console.log(JSON.stringify({id:'bluefin',centralMoss:cases,sourceTrianglesPreserved:true}));
});
