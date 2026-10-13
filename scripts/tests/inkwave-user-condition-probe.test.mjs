import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {captureUserCondition} from '../lib/inkwave-user-condition-probe.mjs';
function fixture(error=0){
 let target=null;const vector={toArray:()=>[1,2,3]},texture={uuid:'cloud',type:1,format:2,colorSpace:'',image:{width:16,height:8},version:1},rt={width:16,height:8,texture};
 const gl={IMPLEMENTATION_COLOR_READ_FORMAT:1,IMPLEMENTATION_COLOR_READ_TYPE:2,RGBA:3,FLOAT:4,HALF_FLOAT:5,UNSIGNED_BYTE:6,FRAMEBUFFER:7,FRAMEBUFFER_COMPLETE:8,getParameter:k=>k===1?3:4,checkFramebufferStatus:()=>8,readPixels:(x,y,w,h,f,t,b)=>b.set([x,y,1,1]),getError:()=>error};
 const renderer={getContext:()=>gl,getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,setRenderTarget:t=>{target=t;},getPixelRatio:()=>1.2};
 const NG={renderer,env:{_cloudRT:rt,_envRT:rt,_cloudMat:{uniforms:{uCov:{value:.46},uSeed:{value:3}}}},scene:{environment:texture,environmentIntensity:1},camera:{position:vector,quaternion:vector,matrixWorld:vector,projectionMatrix:vector},local:{pos:vector},game:{R:{render:()=>{},q:{ao:false}},settings:{quality:'high'},mobile:{touch:true,ios:true},rig:{yaw:0,pitch:0},theme:'day',palette:{id:'aqua-cherry'}}};
 const context=vm.createContext({NG,innerWidth:960,innerHeight:540,devicePixelRatio:2,__captureNativeCanvas:async mode=>({mode,png:'immutable-png',rawRGBA:'immutable-raw'})});
 return {run:()=>vm.runInContext('('+captureUserCondition.toString()+')(true)',context),target:()=>target};
}
test('user-condition callback recompiles in a fresh realm and records cloud texels with target restoration',async()=>{const f=fixture(),r=await f.run();assert.equal(f.target(),null);assert.equal(r.conditions.cloudTargets._cloudRT.samples.length,5);assert.equal(r.conditions.cloudTargets._envRT.samples[0].rgba[2],1);assert.equal(r.conditions.cloudErrors.length,0);assert.equal(r.conditions.photoCachedSourceKnown,false);assert.match(r.conditions.platform,/not physical Safari/);});
test('cloud read failure retains immutable canvas evidence, records error and restores target',async()=>{const f=fixture(1282),r=await f.run();assert.equal(f.target(),null);assert.equal(r.png,'immutable-png');assert.equal(r.rawRGBA,'immutable-raw');assert.equal(r.conditions.cloudTargets._cloudRT.readError,1282);assert.equal(r.conditions.cloudErrors.length,1);});
