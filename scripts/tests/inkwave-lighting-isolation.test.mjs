import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';
import {collectLightingIsolation,compareLightingRepeat,probeLightingIsolation} from '../lib/inkwave-lighting-isolation.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIElEQVR4nGMU0bD5z4AEmBjQABMDAwPDmxtH4BKM6FoAutoFfzXTm3gAAAAASUVORK5CYII=';
const raw=Buffer.alloc(64,20);for(let i=3;i<64;i+=4)raw[i]=255;
const frame=(mode,coefficient)=>({mode,coefficient,png,rawRGBA:raw.toString('base64'),lightingState:{camera:[1,2,3],textureVersion:1}});
async function run(change=()=>{},failure={}){const saved=[],reports=[];let restored=false;const result=await collectLightingIsolation({capture:async(mode,c)=>{if(failure.capture===mode)throw Error('capture failure');const f=frame(mode,c);change(f);return f;},persist:async f=>{saved.push(f.mode);if(failure.persist===f.mode)throw Error('write failure');},restore:async()=>{restored=true;if(failure.restore)throw Error('restore failure');},save:async r=>reports.push(structuredClone(r))});return {result,saved,reports,restored};}
test('isolated sequence saves five frames and verifies three unchanged repeats',async()=>{const {result,saved,restored}=await run();assert.equal(result.causalComparisonAccepted,true);assert.equal(saved.length,5);assert.ok(restored);assert.equal(result.frames.filter(f=>f.repeatValidation).length,3);});
test('raw-only drift hidden by PNG serialization still fails and preserves later frames',async()=>{const {result,saved}=await run(f=>{if(f.mode==='restored-first'){const b=Buffer.from(raw);b[0]+=2;f.rawRGBA=b.toString('base64');}});assert.equal(result.causalComparisonAccepted,false);assert.equal(result.errors[0].comparison.rawChangedPixels,1);assert.equal(saved.length,5);});
test('texture version or camera change fails the causal gate',async()=>{for(const key of ['camera','textureVersion']){const {result}=await run(f=>{if(f.mode==='fill-035')f.lightingState[key]=2;});assert.equal(result.causalComparisonAccepted,false);assert.match(result.errors[0].error,/state changed/);}});
test('capture, persistence and restoration failures remain failed while restoration runs',async()=>{for(const failure of [{capture:'baseline-first'},{persist:'fill-035'},{restore:true}]){const {result,restored}=await run(()=>{},failure);assert.equal(result.causalComparisonAccepted,false);assert.ok(restored);assert.ok(result.errors.length);}});
test('raw alpha changes and dimensions fail strict repeat comparison',()=>{const a=frame('a',0),b=frame('b',0),r=Buffer.from(raw);r[3]--;b.rawRGBA=r.toString('base64');assert.throws(()=>compareLightingRepeat(a,b),/drifted/);b.rawRGBA='AA==';assert.throws(()=>compareLightingRepeat(a,b),/dimensions/);});
test('last intermediate report-write failure cannot publish a passing final verdict',async()=>{let n=0,last;const r=await collectLightingIsolation({capture:async(m,c)=>frame(m,c),persist:()=>{},restore:()=>{},save:report=>{if(++n===5)throw Error('fifth save failed');last=structuredClone(report);}});assert.equal(r.causalComparisonAccepted,false);assert.equal(last.status,'failed');assert.match(last.errors[0].error,/fifth save failed/);});
function browserFixture(mutate=false,opacityMutation=false,vectorMutation=false){
 const uniform={value:.125},matrix={toArray:()=>[1,0,0,1]},mat={uuid:'material',version:1,type:'MeshStandardMaterial',opacity:1,transparent:false,userData:{nativeShadeFill:uniform}},mesh={isMesh:true,uuid:'mesh',name:'floor',matrixWorld:matrix,material:mat};let renders=0;
 if(vectorMutation)mat.color={components:[1,1,1],toArray(){return this.components;}};
 const group={traverse:fn=>fn(mesh)},NG={renderer:{renderBufferDirect(){},shadowMap:{enabled:true,autoUpdate:true,needsUpdate:false}},camera:{matrixWorld:matrix,projectionMatrix:matrix},scene:{traverse:()=>{}},game:{settings:{quality:'high'},_builtQuality:'high',nativeWorld:{display:{group},metrics:{quality:'high',textureCount:1}},R:{render:()=>{if(++renders===5&&mutate)mat.version++;if(opacityMutation)mat.opacity=renders===3?.5:1;if(vectorMutation)mat.color.components[0]=renders===3?(vectorMutation==='infinity'?Infinity:NaN):1;}}}};
 const context=vm.createContext({NG,Map,Error});context.__captureNativeCanvas=async mode=>({mode,png,rawRGBA:'FCg8/xQoPP8UKDz/FCg8/xQoPP8AAAABFCg8/xQoPP8UKDz/FCg8/xQoPP8UKDz/FCg8/xQoPP8UKDz/FCg8/w==',capture:{width:4,height:4,orientation:'bottom-up',format:'RGBA8',state:{contextAttributes:{alpha:true,premultipliedAlpha:true},drawingBufferColorSpace:'srgb'}}});
 return {uniform,NG,mat,mesh,page:{evaluate:async(fn,arg)=>{context.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',context);}}};
}
test('actual browser callback recompiles in fresh realm, restores original nonzero uniform and detects final render mutation',async()=>{for(const mutation of [false,true]){const {page,uniform}=browserFixture(mutation),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lighting-realm-'));try{const r=await probeLightingIsolation(page,dir);assert.equal(r.causalComparisonAccepted,!mutation);assert.equal(uniform.value,.125);assert.equal(r.frames.length,5);assert.equal(fs.readdirSync(dir).filter(n=>n.endsWith('.rgba')).length,5);}finally{fs.rmSync(dir,{recursive:true});}}});
test('actual PNG write failure still attempts raw and retains inline failed bytes in failed report',async()=>{const {page,uniform}=browserFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lighting-write-'));try{const r=await probeLightingIsolation(page,dir,{writeFile:(p,b)=>{if(p.endsWith('fill-035.png'))throw Error('PNG disk failure');fs.writeFileSync(p,b);}});assert.equal(r.causalComparisonAccepted,false);assert.equal(uniform.value,.125);assert.ok(fs.existsSync(path.join(dir,'fill-035.rgba')));const saved=JSON.parse(fs.readFileSync(path.join(dir,'lighting-isolation.json'))),bad=saved.frames.find(f=>f.mode==='fill-035');assert.ok(bad.png&&bad.rawRGBA);assert.equal(saved.status,'failed');}finally{fs.rmSync(dir,{recursive:true});}});

test("temporary fill-only opacity change must invalidate causal acceptance",async()=>{const {page}=browserFixture(false,true),dir=fs.mkdtempSync(path.join(os.tmpdir(),"lighting-opacity-"));try{const r=await probeLightingIsolation(page,dir);assert.equal(r.causalComparisonAccepted,false);assert.ok(r.errors.some(e=>/state changed/.test(e.error)));}finally{fs.rmSync(dir,{recursive:true});}});

test("non-finite material vectors reject NaN and Infinity instead of JSON null equality",async()=>{for(const kind of ["nan","infinity"]){const {page}=browserFixture(false,false,kind),dir=fs.mkdtempSync(path.join(os.tmpdir(),"lighting-vector-"));try{const r=await probeLightingIsolation(page,dir);assert.equal(r.causalComparisonAccepted,false);assert.ok(r.errors.some(e=>/Non-finite material vector/.test(e.error)));}finally{fs.rmSync(dir,{recursive:true});}}});

const transitionFrame=(version=4,delta=2)=>{const before={shadowEnabled:true,shadowNeedsUpdate:false,meshes:[{uuid:'mesh',material:{uuid:'mat',version,transparent:true,side:2,forceSinglePass:false,opacity:1}}]};const after=structuredClone(before);after.meshes[0].material.version+=delta;return {renderObservations:[{material:'mat',object:'mesh',side:1,version:version+1,versionAfter:version+1,sideAfter:1},{material:'mat',object:'mesh',side:0,version:version+2,versionAfter:version+2,sideAfter:0}],lightingState:{before,after,afterCapture:structuredClone(after)}};};
test('pinned transparent two-pass transition retains exact counter evidence and previous continuity',async()=>{
 const {validateLightingStateTransition:validate}=await import('../lib/inkwave-lighting-isolation.mjs');
 const a=transitionFrame(),b=transitionFrame(6);a.lightingState.before.shadowNeedsUpdate=true;
 assert.equal(validate(a).transitions.length,2);assert.equal(validate(b,a).previousFrameContinuity,true);
 assert.equal(a.lightingState.before.meshes[0].material.version,4);
 const hidden=transitionFrame();hidden.renderObservations=[];assert.throws(()=>validate(hidden),/version transition/);
 const wrong=transitionFrame();wrong.renderObservations[1].object='other';assert.throws(()=>validate(wrong),/version transition/);
 for(const delta of [1,3,-2])assert.throws(()=>validate(transitionFrame(4,delta)),/version transition/);
 for(const [key,value] of [['transparent',false],['side',0],['forceSinglePass',true]]){const f=transitionFrame();for(const phase of Object.values(f.lightingState))phase.meshes[0].material[key]=value;assert.throws(()=>validate(f),/version transition/);}
});
test('transition validator rejects opacity, texture, shadow reset, capture mutation and counter discontinuity',async()=>{
 const {validateLightingStateTransition:validate}=await import('../lib/inkwave-lighting-isolation.mjs');
 for(const mutate of [f=>{f.lightingState.after.meshes[0].material.opacity=.5;},f=>{f.lightingState.after.meshes[0].material.map={version:2};},f=>{f.lightingState.after.shadowNeedsUpdate=true;},f=>{f.lightingState.afterCapture.meshes[0].material.version++;}]){const f=transitionFrame();mutate(f);assert.throws(()=>validate(f));}
 assert.throws(()=>validate(transitionFrame(8),transitionFrame(4)),/state changed/);
 const f=transitionFrame();f.lightingState.before.shadowNeedsUpdate=true;f.lightingState.before.shadowEnabled=false;f.lightingState.after.shadowEnabled=false;f.lightingState.afterCapture.shadowEnabled=false;assert.throws(()=>validate(f),/state changed/);
});
test('serialized draw observer forwards two passes and restores original method even on render failure',async()=>{
 for(const fail of [false,true]){
  const {page,uniform,NG,mat,mesh}=browserFixture();Object.assign(mat,{transparent:true,side:2,forceSinglePass:false});
  let calls=0;const original=function(...args){assert.equal(this,NG.renderer);assert.equal(args[3],mat);assert.equal(args[4],mesh);calls++;return 17;};NG.renderer.renderBufferDirect=original;
  NG.game.R.render=()=>{for(const side of [1,0]){mat.side=side;mat.version++;assert.equal(NG.renderer.renderBufferDirect(null,null,null,mat,mesh,null),17);}mat.side=2;if(fail)throw Error('render injected failure');};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lighting-observer-'));try{const r=await probeLightingIsolation(page,dir);assert.equal(r.causalComparisonAccepted,!fail);assert.equal(NG.renderer.renderBufferDirect,original);assert.equal(uniform.value,.125);assert.equal(calls,10);if(!fail)assert.equal(r.frames[0].renderObservations.length,2);}finally{fs.rmSync(dir,{recursive:true});}
 }
});
