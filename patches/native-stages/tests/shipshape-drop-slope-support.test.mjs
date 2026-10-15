import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const ready=!!root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));

test('original crane slope supports the actual foot above the source navigation centre without changing the surface',{skip:!ready},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,d=readStage(root,'shipshape');
 G.level=new f.NativeLevel(d);G.physics=new f.NativePhysics(G.level);G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
 // Exact nodes observed in the immutable production Chromium NavGraph.
 const upper={id:28642,x:-18.5,y:5.1798441621614515,z:63};
 const lower={id:28230,x:-18.5,y:1.1794999837875224,z:60};
 const digest=()=>crypto.createHash('sha256').update(Buffer.from(d.triangles.buffer)).update(Buffer.from(d.flags.buffer)).update(Buffer.from(d.mask.buffer)).digest('hex'),before=digest();
 const a=new f.Actor({team:0,slot:1,name:'original crane slope',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});G.actors=[a];a.spawnAt(new THREE.Vector3(upper.x,upper.y,upper.z),0);a.invuln=0;
 let capsuleChecks=0;for(let i=0;i<36;i++){G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);assert(G.physics.bodyFits(a.pos,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height,false,.003));capsuleChecks++;}
 const center=G.physics.raycast(new THREE.Vector3(upper.x,upper.y+.1,upper.z),new THREE.Vector3(0,-1,0),.3),foot=new a.ground.constructor();
 G.physics.groundProbe(a.pos.x,upper.y,a.pos.z,PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,foot,false);
 assert(a.alive&&a.grounded);assert(center.hit&&center.triangle>=0);assert(Math.abs(center.point.y-upper.y)<1e-6);assert(Math.abs(a.pos.y-upper.y)>.16);assert(Math.abs(a.pos.y-foot.y)<1e-6);
 assert.equal(f.nativeSourceFootSupported(G,a,upper),true,'the accepted physical support helper admits the actual supported slope');
 assert.equal(f.nativeSourceFootSupported(G,a,lower),false,'the lower destination does not support an actor still on the upper slope');
 assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);assert.equal(digest(),before);
 console.log('shipshape-drop-slope '+JSON.stringify({upper,lower,position:a.pos.toArray(),nodeCenterDifference:a.pos.y-upper.y,center:{point:center.point.toArray(),normal:center.normal.toArray(),triangle:center.triangle,face:center.face,object:G.level.manifest.objects[G.level.triangleWorld.objectIds[center.triangle]].name},foot:{y:foot.y,normal:foot.normal.toArray(),block:foot.block,face:foot.face},upperFootSupported:true,lowerFootSupported:false,capsuleChecks,sourceUnchanged:true,simulationStep:1/60,gearAP:Object.keys(a.s3.abilityPoints)}));
});
