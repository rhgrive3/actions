import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {captureSubAttachment,syncSubAttachment} from '../runtime/sub-surface-attachment.mjs';
const block=()=>({id:0,center:new THREE.Vector3(2,3,4),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]});
test('attachment directions reuse private scratch without changing position identity, dynamic transforms or normalization',()=>{
 const b=block(),G={level:{blocks:[b]}},object={pos:new THREE.Vector3(3,4,5),yaw:.7},pos=object.pos,normal=new THREE.Vector3(0,1,0),tangent=new THREE.Vector3(1,0,0),bitangent=new THREE.Vector3(0,0,1),frame={normal,tangent,bitangent};
 const a=captureSubAttachment(G,object,0,frame);let clones=0;object.pos.clone=function(){clones++;return THREE.Vector3.prototype.clone.call(this);};
 for(let i=0;i<120;i++){const angle=i*.01;b.center.set(i*.1,3,4);b.axes[0].set(Math.cos(angle),0,-Math.sin(angle));b.axes[2].set(Math.sin(angle),0,Math.cos(angle));assert.equal(syncSubAttachment(G,object,a,frame),true);assert.equal(object.pos,pos);const expected=b.center.clone().add(b.axes[0]).add(b.axes[1]).add(b.axes[2]);assert.ok(object.pos.distanceTo(expected)<1e-12);assert.equal(frame.normal,normal);assert.ok(Math.abs(frame.tangent.length()-1)<1e-12);}
 assert.equal(clones,1);G.level.blocks[0]=block();assert.equal(syncSubAttachment(G,object,a,frame),false);
});
test('finite vector validation reads all original coordinates before rejecting and preserves frame key order',()=>{
 const b=block(),G={level:{blocks:[b]}},object={pos:new THREE.Vector3(),yaw:0},a=captureSubAttachment(G,object,0),reads=[];
 const invalid={isVector3:true,get x(){reads.push('x');return NaN;},get y(){reads.push('y');return 1;},get z(){reads.push('z');return 2;}};
 a.normal=[0,1,0];assert.equal(syncSubAttachment(G,object,a,{normal:invalid}),true);assert.deepEqual(reads,['x','y','z']);
 const keys=[];const frame={};for(const key of ['normal','tangent','bitangent']){a[key]=[0,1,0];Object.defineProperty(frame,key,{get(){keys.push(key);return new THREE.Vector3(0,1,0);}});}syncSubAttachment(G,object,a,frame);assert.deepEqual(keys,['normal','normal','tangent','tangent','bitangent','bitangent']);
});
test('recursive same-attachment direction callbacks do not overwrite the active scratch vector',()=>{
 const b=block(),G={level:{blocks:[b]}},object={pos:new THREE.Vector3(3,4,5),yaw:Math.PI/2},a=captureSubAttachment(G,object,0);let reenter=false,clones=0;
 class CallbackVector extends THREE.Vector3{addScaledVector(v,n){if(reenter){reenter=false;const heading=a.heading;a.heading=[0,0,1];syncSubAttachment(G,object,a);a.heading=heading;}return super.addScaledVector(v,n);}}
 object.pos.clone=()=>{clones++;return new CallbackVector().copy(object.pos);};syncSubAttachment(G,object,a);reenter=true;syncSubAttachment(G,object,a);assert.ok(Math.abs(object.yaw-Math.PI/2)<1e-12);assert.equal(clones,2);
 const second={...a,heading:[0,0,1]};syncSubAttachment(G,object,second);assert.equal(clones,3);assert.equal(object.yaw,0);
});
