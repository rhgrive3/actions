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
test('serialized native setup advances intro then four live seconds and restores controlled RNG picker',async()=>{
 const {prepareUserConditionMatch}=await import('../lib/inkwave-user-condition-probe.mjs');
 for(const fail of [false,true]){
  const math=Object.create(Math),random=()=>.01;math.random=random;let ticks=0;
  const picker=function(){assert.equal(this,g);return {id:math.random()===.7?'aqua-cherry':'wrong'};};
  const g={debug:{freeze(){}},menus:{wipe:{cancel(){}}},_setSettings(){},_pickPalette:picker,match:{state:'intro',time:180},async startMatch(){this.palette=this._pickPalette();if(fail)throw Error('start failed');},_frame(){ticks++;if(this.match.state==='intro'){if(ticks===253)this.match.state='playing';}else this.match.time-=1/60;}};
  const context=vm.createContext({NG:{game:g,paint:{flush(){}}},Math:math});
  const run=()=>vm.runInContext('('+prepareUserConditionMatch.toString()+')()',context);
  if(fail)await assert.rejects(run,/start failed/);else{const r=await run();assert.equal(r.introFrames,253);assert.equal(r.liveFrames,240);assert.ok(Math.abs(r.timeAfter-176)<1e-6);assert.equal(ticks,493);}
  assert.equal(g._pickPalette,picker);assert.equal(math.random,random);
 }
});
test('native setup rejects paused time and failure to leave intro within bounded frames',async()=>{
 const {prepareUserConditionMatch}=await import('../lib/inkwave-user-condition-probe.mjs');
 for(const stuck of [true,false]){let n=0;const g={debug:{freeze(){}},menus:{wipe:{cancel(){}}},_setSettings(){},_pickPalette(){return {id:'aqua-cherry'};},match:{state:'intro',time:180},async startMatch(){this.palette=this._pickPalette();},_frame(){n++;if(!stuck)this.match.state='playing';}};const context=vm.createContext({NG:{game:g,paint:{flush(){}}}});await assert.rejects(()=>vm.runInContext('('+prepareUserConditionMatch.toString()+')()',context),stuck?/intro did not/:/time did not/);assert.ok(n<=600);}
});
