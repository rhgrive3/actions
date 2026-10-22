import test from 'node:test';
import assert from 'node:assert/strict';
import {assertWiperFullFrame,assertWiperCoverageImage,assertWiperFlightCoverage} from '../lib/inkwave-wiper-flight-coverage.mjs';

const camera=()=>({fov:50,aspect:960/720,near:.05,far:250,zoom:1,filmOffset:0,view:null});
const fullFrame=()=>({viewport:[0,0,960,720],size:[960,720],scissorTest:false});
const counts={slashH:0,slashV:2};
const image=()=>({view:'front',camera:camera(),fullFrame:fullFrame(),occlusion:{schema:1,method:'opaque-scene-triangle-rays-v1',samplesPerInstance:12,consideredMeshes:1,transparentMeshes:0,meshes:[{instances:0,samples:0},{instances:2,samples:24}],blocked:[]},flightCoverage:{
  slashH:{instances:0,vertices:0},slashV:{instances:2,vertices:696,minDepth:12,maxNdc:.6,margin:.9}}});
class Value { constructor(){this.value=[];} toArray(){return this.value;} fromArray(a){this.value=[...a];return this;} }
const THREE={Vector2:Value,Vector4:Value};
function renderer(){const frame=fullFrame();return {...frame,target:null,
 getCurrentViewport(out){return out.fromArray(this.viewport);},getDrawingBufferSize(out){return out.fromArray(this.size);},
 getScissorTest(){return this.scissorTest;},getRenderTarget(){return this.target;}};}

test('strict pair accepts complete full-frame flight and retired receipts',()=>{
 assert.equal(assertWiperCoverageImage(image(),counts),true);
 const retired=image();retired.flightCoverage.slashV={instances:0,vertices:0};retired.occlusion.meshes[1]={instances:0,samples:0};
 assert.equal(assertWiperCoverageImage(retired,{slashH:0,slashV:0}),true);
});
for(const [name,mutate] of [
 ['missing coverage',im=>delete im.flightCoverage],['missing viewport proof',im=>delete im.fullFrame],
 ['scissor mask',im=>im.fullFrame.scissorTest=true],['viewport crop',im=>im.fullFrame.viewport=[1,0,959,720]],
 ['smaller framebuffer',im=>im.fullFrame.size=[480,360]],['camera crop',im=>im.camera.view={enabled:true}],
 ['camera zoom',im=>im.camera.zoom=2],['alternate FOV',im=>im.camera.fov=49],
 ['missing slab',im=>im.flightCoverage.slashV.instances=1],['zero vertices for live slabs',im=>im.flightCoverage.slashV.vertices=0],
 ['near fade',im=>im.flightCoverage.slashV.minDepth=1.59],['nonfinite depth',im=>im.flightCoverage.slashV.minDepth=NaN],
 ['image edge',im=>im.flightCoverage.slashV.maxNdc=.901],['relaxed margin',im=>im.flightCoverage.slashV.margin=.99],
 ['nonfinite NDC',im=>im.flightCoverage.slashV.maxNdc=NaN],['missing empty-mesh receipt',im=>delete im.flightCoverage.slashH]
])test('strict pair rejects '+name,()=>{const im=image();mutate(im);assert.throws(()=>assertWiperCoverageImage(im,counts),/coverage receipt/);});
test('actual framebuffer observer is read-only and rejects crop, mask, offscreen target and resize',()=>{
 const r=renderer(),c=camera(),before=JSON.stringify(r);
 assert.deepEqual(assertWiperFullFrame(THREE,r,c),fullFrame());assert.equal(JSON.stringify(r),before);
 for(const mutate of [r=>r.scissorTest=true,r=>r.viewport=[0,0,959,720],r=>r.size=[1920,1440],r=>r.target={}]){
  const r=renderer();mutate(r);assert.throws(()=>assertWiperFullFrame(THREE,r,c),/uncropped/);
 }
 const c2=camera();c2.view={enabled:true};assert.throws(()=>assertWiperFullFrame(THREE,renderer(),c2),/uncropped/);
});
test('missing mesh is not mistaken for retirement',()=>{
 assert.throws(()=>assertWiperFlightCoverage(null,null,null),/invalid flight mesh/);
 assert.throws(()=>assertWiperFlightCoverage(null,{count:-1},null),/invalid flight mesh/);
 assert.deepEqual(assertWiperFlightCoverage(null,{count:0},null),{instances:0,vertices:0});
});
