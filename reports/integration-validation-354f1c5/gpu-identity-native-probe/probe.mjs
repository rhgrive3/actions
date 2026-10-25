import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from '/workspace/actions/node_modules/playwright/index.mjs';
import {captureIdleGpuIdentity,verifyIdleGpuContext} from '/workspace/actions/scripts/check-inkwave-idle-resources.mjs';
const root='/workspace/actions',out='/workspace/inkwave-validation-354f1c5/gpu-identity-native-probe',checker=root+'/scripts/check-inkwave-idle-resources.mjs',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={status:'running',scope:'Checker function contract on an actual Chromium WebGL2 canvas. No game boot, Three workload, idle-resource acceptance, or hardware GPU performance claim.',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checkerSha256:sha(fs.readFileSync(checker)),captureFunctionSha256:sha(captureIdleGpuIdentity.toString()),verifyFunctionSha256:sha(verifyIdleGpuContext.toString())};
let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();const page=await browser.newPage({viewport:{width:320,height:200}});
 await page.setContent('<!doctype html><title>Actual WebGL2 identity contract</title><canvas width="32" height="32"></canvas>');
 report.setup=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');if(!gl)throw Error('Actual WebGL2 unavailable');
  const add=canvas.addEventListener.bind(canvas),remove=canvas.removeEventListener.bind(canvas);window.listenerLog={added:[],removed:[]};
  canvas.addEventListener=(type,fn,options)=>{if(type==='webglcontextlost')listenerLog.added.push(fn);return add(type,fn,options);};
  canvas.removeEventListener=(type,fn,options)=>{if(type==='webglcontextlost')listenerLog.removed.push(fn);return remove(type,fn,options);};
  window.__G={renderer:{getContext:()=>gl}};return{actualWebGL2:gl instanceof WebGL2RenderingContext,width:canvas.width,height:canvas.height,initiallyLost:gl.isContextLost()};
 });assert.equal(report.setup.actualWebGL2,true);assert.equal(report.setup.initiallyLost,false);
 report.capture=await page.evaluate(captureIdleGpuIdentity);assert.match(report.capture.webgl,/^WebGL 2\.0/);assert(report.capture.renderer);
 await page.evaluate(()=>{window.firstListener=__idleGpuIdentity.onLoss;});report.verify=await page.evaluate(verifyIdleGpuContext);assert.deepEqual(report.verify,report.capture);
 report.successCleanup=await page.evaluate(()=>({probeDeleted:!Object.hasOwn(window,'__idleGpuIdentity'),removed:listenerLog.removed.filter(fn=>fn===firstListener).length}));assert.deepEqual(report.successCleanup,{probeDeleted:true,removed:1});
 report.secondCapture=await page.evaluate(captureIdleGpuIdentity);assert.deepEqual(report.secondCapture,report.capture);
 report.loss=await page.evaluate(async()=>{
  const probe=__idleGpuIdentity,gl=probe.gl,ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('WEBGL_lose_context unavailable');window.lossListener=probe.onLoss;
  const event=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native context loss event missing')),15000);gl.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clearTimeout(timer);resolve({isTrusted:e.isTrusted,type:e.type});},{once:true});ext.loseContext();});
  return{event,lost:gl.isContextLost(),probeObservedLoss:probe.lost};
 });assert.equal(report.loss.event.isTrusted,true);assert.equal(report.loss.lost,true);assert.equal(report.loss.probeObservedLoss,true);
 try{await page.evaluate(verifyIdleGpuContext);throw Error('Verification incorrectly accepted a lost context');}catch(error){report.rejection=String(error);assert.match(report.rejection,/Idle GPU context lost or replaced during workload/);}
 report.lossCleanup=await page.evaluate(()=>({probeDeleted:!Object.hasOwn(window,'__idleGpuIdentity'),removed:listenerLog.removed.filter(fn=>fn===lossListener).length}));assert.deepEqual(report.lossCleanup,{probeDeleted:true,removed:1});
 report.status='passed';await page.screenshot({path:out+'/canvas.png'});
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}finally{fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser?.close();}
