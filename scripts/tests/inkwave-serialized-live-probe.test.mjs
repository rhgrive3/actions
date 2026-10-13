import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as T from '../../inkwave-public/vendor/three/build/three.module.js';
import {probeProjectileVisibility} from '../lib/inkwave-projectile-visibility-probe.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=';
const corruptPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGNMSUnRYqAAMFGiedSAUQNGDRhMBgAAr7sBdvhigRQAAAAASUVORK5CYII=';
const results=[];
for(const mode of ['success','undefined-closure','late-view-failure','exact-png-corruption']){
 const inject=mode!=='success';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-serialized-live-'));
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.15,100);camera.position.set(0,2,-5);camera.lookAt(0,1,0);camera.updateMatrixWorld();
 const geometry=new T.BoxGeometry(.2,.2,.2),material=new T.MeshBasicMaterial({color:0xff00ff}),mesh=new T.InstancedMesh(geometry,material,1),fringe=new T.InstancedMesh(geometry,material,1),blobs=new T.InstancedMesh(geometry,material,1);fringe.count=blobs.count=0;mesh.count=1;mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(0,1,1));scene.add(mesh,fringe,blobs);
 const actorRoot=new T.Group(),stage=new T.Group();scene.add(actorRoot,stage);actorRoot.add(new T.Mesh(geometry,material));stage.add(new T.Mesh(geometry,material));scene.updateMatrixWorld(true);
 class Hit{constructor(){this.hit=false;this.dist=0;this.point=new T.Vector3();this.normal=new T.Vector3(0,1,0);this.block=-1;this.face=-1;this.triangle=-1;}}
 const a={pos:new T.Vector3(0,0,0),aimDir:new T.Vector3(0,0,1),aimPoint:new T.Vector3(0,1,20),intent:{fire:false},alive:true,form:'kid',character:{root:actorRoot},weaponRunner:{cooldown:0,reset(){}},setWeapon(w){this.weapon=w;}};
 const system={list:[],blobs,clear(){this.list=[];},_draw(){},_muzzle(a,out){return out.copy(a.pos).add({x:0,y:1,z:.5});},_aimFrom(a,m,out){return out.copy(a.aimDir);},inkFlight:{worldHit:new Hit(),world(from,to,r,h){h.hit=false;return h;}},_step(p,dt){this.inkFlight.world(p.pos,p.pos.clone().addScaledVector(p.vel,dt),.2,new Hit());p.age+=dt;p.pos.addScaledVector(p.vel,dt);return false;}};
 let pixelValue=0;
 const gl={drawingBufferWidth:16,drawingBufferHeight:16,RGBA:1,UNSIGNED_BYTE:2,readPixels(x,y,w,h,f,t,out){for(let i=0;i<out.length;i+=4){out[i]=pixelValue;out[i+1]=0;out[i+2]=0;out[i+3]=255;}},getError(){return 0;}};
 const G={scene,camera,local:a,actors:[],time:0,level:{blocks:[]},projectiles:system,renderer:{domElement:{width:16,height:16,toDataURL(){return png;}},getContext(){return gl;}},fx:{clear(){},inkVolumes:{metrics:{active:3,culled:0,overflow:0},assets:new Map([['shooter',{patterns:[{frames:[[{mesh,fringe}]]}]}]])}}};
 const g=G.game={rig:{yaw:0,pitch:0},nativeWorld:{display:{group:stage}},match:{state:'playing',paused:false},frozen:false,_skipRender:false,input:{mouse:{left:false}},debug:{freeze(){g.frozen=true;},freezeBots(){},fire(on){g.input.mouse.left=on;}},R:{render(){pixelValue=mesh.visible?100:0;}},_frame(dt){G.time+=dt;a.intent.fire=g.input.mouse.left;if(a.intent.fire&&!system.list.length)system.list.push({owner:a,type:'shot',wid:a.weapon,_inkVolumeRecipe:'shooter',pos:new T.Vector3(0,1,1),start:new T.Vector3(0,1,0),vel:new T.Vector3(0,0,1),age:0,damage:10,seed:.4,size:.3,vis:.088,delay:0});for(const p of system.list)system._step(p,dt);}};
 let state={NG:G,window:{},__captureNativeCanvas:async captureMode=>({mode:captureMode,png:mode==='exact-png-corruption'?corruptPng:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGP8//+/FgMFgIkSzaMGjBowasBgMgAADaEDR3mgsLUAAAAASUVORK5CYII=',rawRGBA:Buffer.alloc(16*16*4,42).toString('base64'),glError:0,capture:{width:16,height:16,orientation:'bottom-up',format:'RGBA8',state:{contextAttributes:{alpha:true,premultipliedAlpha:true},drawingBufferColorSpace:'srgb'},maxChannelDifference:0}})},evaluations=0,injected=0;const callbacks=new Set(),freeReads=new Set();const intrinsics={JSON,Math,Object,Array,Number,String,Boolean,Map,Set,WeakMap,Error,Uint8Array,Infinity,undefined};
 const page={async evaluate(fn,arg){
   let source=fn.toString();callbacks.add(source);evaluations++;
   if(mode==='undefined-closure'&&source.includes('beforeRedrawMetrics')&&source.includes('const read=')){source=source.replace('g.R.render();const bytes=', 'g.R.render();cameraState();const bytes=');injected++;}
   if(mode==='late-view-failure'&&arg==='side'&&source.includes('beforeRedrawMetrics')){source=source.replace('g.R.render();const bytes=', "g.R.render();throw new Error('controlled late view failure');const bytes=");injected++;}
   // Recompile EVERY callback in its own new realm. Only browser/game globals
   // are supplied; no Node/module lexical names or helper closures are shared.
   const proxy=new Proxy({...state},{get(target,key,receiver){
     if(typeof key==='symbol')return Reflect.get(target,key,receiver);
     freeReads.add(key);
     if(key==='globalThis')return receiver;
     if(Object.hasOwn(target,key))return target[key];
     if(Object.hasOwn(intrinsics,key))return intrinsics[key];
     throw new ReferenceError(key+' is not defined');
   }});
   const context=vm.createContext(proxy);
   try{return await vm.runInContext('('+source+')',context)(arg);}
   finally{state={...context};}
 },async screenshot({path:file}){fs.writeFileSync(file,Buffer.from(png.split(',')[1],'base64'));}};
 try{
  const report=await probeProjectileVisibility(page,dir);
  assert.equal(report.cases.length,6);assert.equal(new Set(report.cases.map(c=>c.scenario+':'+c.weapon)).size,6);
  if(mode==='success'){
   assert.equal(report.cases.length,6);assert.equal(report.failures.length,0);assert.equal(report.visibilityEstablished,true);
   for(const c of report.cases){assert.equal(c.views.length,4);assert.equal(c.nativeReadback.cameraUnchanged,true);const native=c.views.find(v=>v.view==='native');assert.equal(native.nativeBeforeRedraw.changedPixels,256);assert.ok(fs.existsSync(path.join(dir,native.beforeRedrawImage)));assert.equal(fs.readFileSync(path.join(dir,native.beforeRedrawImage)).subarray(1,4).toString(),'PNG');if(c.weapon==='dualies'){assert.equal(c.occlusionDiagnostic.errors.length,0);assert.equal(c.occlusionDiagnostic.controls.length,4);for(const control of c.occlusionDiagnostic.controls)for(const key of ['onCapture','offCapture']){assert.equal(control[key].rawRGBA,undefined);assert.deepEqual(fs.readFileSync(path.join(dir,control[key].rawRGBAFile)),Buffer.alloc(16*16*4,42));}}}
  }else if(mode==='undefined-closure'){
   assert.equal(injected,6);assert.equal(report.visibilityEstablished,false);assert.equal(report.cases.filter(c=>c.status==='failed-diagnostic-case').length,6);assert.ok(report.cases.filter(c=>c.error).every(c=>/cameraState is not defined/.test(c.error)));assert.equal(fs.readdirSync(dir).filter(f=>f.endsWith('-native-before-redraw.png')).length,0);
  }
  if(mode==='late-view-failure'){assert.equal(injected,6);assert.equal(report.visibilityEstablished,false);assert.equal(report.forcedOrAlternateVisibilityEstablished,false);for(const c of report.cases){assert.match(c.error,/controlled late view failure/);assert.equal(c.status,'failed-diagnostic-case');assert.equal(c.statusBeforeDiagnosticFailure,'live-rounds');assert.equal(c.views.length,1);assert.equal(c.traceComplete,true);assert.ok(c.trace.length>0);assert.ok(fs.existsSync(path.join(dir,c.views[0].beforeRedrawImage)));}assert.equal(fs.readdirSync(dir).filter(f=>f.endsWith('-native-before-redraw.png')).length,6);}
  if(mode==='exact-png-corruption'){
    assert.equal(report.visibilityEstablished,false);assert.equal(report.forcedOrAlternateVisibilityEstablished,false);
    const failed=report.cases.filter(c=>c.weapon==='dualies');assert.equal(failed.length,2);
    for(const c of failed){assert.match(c.error,/Exact saved PNG differs/);const e=c.occlusionDiagnostic.captureFailure;assert.ok(e.exactPngValidation.expectedChannelMax[0]>1);assert.deepEqual(fs.readFileSync(path.join(dir,e.pngFile)),Buffer.from(corruptPng.split(',')[1],'base64'));assert.deepEqual(fs.readFileSync(path.join(dir,e.rawRGBAFile)),Buffer.alloc(16*16*4,42));assert.ok(fs.existsSync(path.join(dir,e.evidenceFile)));}
  }
  assert.equal(g.frozen,false);assert.equal(g._skipRender,false);assert.equal(g.input.mouse.left,false);assert.equal(state.__projectileProbe,undefined);assert.equal(state.__projectileCaseRestore,undefined);
  results.push({mode,injectedUndefinedClosure:mode==='undefined-closure',evaluations,distinctSerializedCallbacks:callbacks.size,freeGlobalReads:[...freeReads].sort(),cases:report.cases.length,failures:report.failures.length,nativeImages:fs.readdirSync(dir).filter(f=>f.endsWith('-native-before-redraw.png')).length,visibilityEstablished:report.visibilityEstablished});
 }finally{fs.rmSync(dir,{recursive:true});}
}
console.log(JSON.stringify({scope:'Actual probe callbacks serialized into independent fresh VM realms with real Three objects/minimal mocked renderer; no GPU acceptance.',results},null,2));
