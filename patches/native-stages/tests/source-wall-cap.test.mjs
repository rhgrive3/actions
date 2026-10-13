import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
import {convertSource} from '../runtime/source-convert.mjs';

test('an attached source-wall squid stops at unowned upper ink and resumes on an owned upward lane',async()=>{
 // Unit-only source parser input. Runtime stages always keep their pinned mesh.
 const obj='o Fld_Test_Wall\nv -3 0 0\nv 3 0 0\nv 3 6 0\nv -3 6 0\nvn 0 0 -1\nvn 0 0 -1\nvn 0 0 -1\nvn 0 0 -1\nusemtl Wall\nf 1//1 3//3 2//2\nf 1//1 4//4 3//3\n';
 const data=convertSource({id:'wall-cap-unit',internal:'Vss_Test',bounds:{minX:-3,minZ:-3,maxX:3,maxZ:3},spawnPads:[[0,0,-2],[0,0,2]],spawnBarrier:.5},obj,'newmtl Wall\nKd 1 1 1\n',{});
 const f=await nativeFixture(),G=f.G,L=G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:256,maxDensity:4,cell:.25});
 const actor=f.make();actor.pos.set(0,1.3,-.44);actor.form='squid';actor.climbExit=0;actor.intent.move.set(0,0,1);
 const lower=G.physics.raycast(actor.pos.clone().add(new f.THREE.Vector3(0,.3,0)),new f.THREE.Vector3(0,0,1),1),upper=G.physics.raycast(actor.pos.clone().add(new f.THREE.Vector3(0,.85,0)),new f.THREE.Vector3(0,0,1),1);
 assert(lower.hit&&upper.hit&&lower.face>=0&&upper.face>=0);
 G.paint.splat(lower.point.clone().addScaledVector(lower.normal,.03),.32,0,{seed:.125,instant:true});
 assert.equal(G.paint.sample(lower.face,lower.u,lower.v),1);assert.equal(G.paint.sample(upper.face,upper.u,upper.v),0);
 actor._updateClimb(1/60,true);assert.equal(actor.climbing,true);assert.equal(actor.vel.y,0);assert.equal(actor.climbV,0);
 G.paint.splat(upper.point.clone().addScaledVector(upper.normal,.03),.8,0,{seed:.125,instant:true});
 actor._updateClimb(1/60,true);assert.equal(actor.climbing,true);assert(actor.vel.y>0,'owned upper lane permits actual upward swim');
 G.paint.splat(lower.point.clone().addScaledVector(lower.normal,.03),1.2,1,{seed:.125,instant:true});
 actor._updateClimb(1/60,true);assert.equal(actor.climbing,false,'enemy source-wall ink releases the attached squid');
});
