import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {captureIdleGpuIdentity,verifyIdleGpuContext} from '../check-inkwave-idle-resources.mjs';

function fixture({extension=true}={}){
 const listeners=new Set(),queries=[];let queued=false,lost=false,current;
 const gl={VERSION:1,RENDERER:2,canvas:{
  addEventListener(type,fn){assert.equal(type,'webglcontextlost');listeners.add(fn);},
  removeEventListener(type,fn){assert.equal(type,'webglcontextlost');listeners.delete(fn);},
 },isContextLost:()=>lost,
 getExtension(name){assert(!queued,'extension must not synchronize queued draws');queries.push(name);return extension?{UNMASKED_RENDERER_WEBGL:3}:null;},
 getParameter(key){assert(!queued,'identity must not synchronize queued draws');queries.push(key);return key===1?'WebGL 2.0 fixture':key===3?'unmasked fixture':'masked fixture';}};
 current=gl;
 const context=vm.createContext({window:{},__G:{renderer:{getContext:()=>current}}});
 const run=fn=>vm.runInContext('('+fn.toString()+')()',context);
 return {run,queries,listeners,queue(){queued=true;},lose(notify=true){lost=true;if(notify)for(const fn of listeners)fn();},restore(){lost=false;},replace(){current={};}};
}
for(const extension of [true,false])test(`GPU identity survives queued draws without another synchronous query (extension ${extension})`,()=>{
 const f=fixture({extension}),gpu=f.run(captureIdleGpuIdentity);
 assert.equal(gpu.webgl,'WebGL 2.0 fixture');assert.equal(gpu.renderer,extension?'unmasked fixture':'masked fixture');
 assert.deepEqual(f.queries,['WEBGL_debug_renderer_info',1,extension?3:2]);
 f.queue();assert.equal(f.run(verifyIdleGpuContext),gpu);assert.equal(f.queries.length,3);assert.equal(f.listeners.size,0);
 assert.throws(()=>f.run(verifyIdleGpuContext),/not captured/);
});
for(const failure of ['lost','lost without event','restored','replaced'])test(`cached identity cannot admit a ${failure} context`,()=>{
 const f=fixture();f.run(captureIdleGpuIdentity);f.queue();
 if(failure==='replaced')f.replace();else{f.lose(failure!=='lost without event');if(failure==='restored')f.restore();}
 assert.throws(()=>f.run(verifyIdleGpuContext),/lost or replaced/);assert.equal(f.queries.length,3);assert.equal(f.listeners.size,0);
});
test('an already lost context fails before recording identity',()=>{
 const f=fixture();f.lose(false);assert.throws(()=>f.run(captureIdleGpuIdentity),/already lost/);assert.equal(f.queries.length,0);assert.equal(f.listeners.size,0);
});
test('main captures actual desktop identity before workload and verifies its lifetime before retirement',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8').split('async function main(){')[1];
 const capture=source.indexOf('page.evaluate(captureIdleGpuIdentity)'),audio=source.indexOf("phase='audio'"),work=source.indexOf('await runResultsWorkDiagnostic('),verify=source.indexOf('page.evaluate(verifyIdleGpuContext)'),retire=source.indexOf('await retireDesktopForCold(');
 assert(capture>=0&&capture<audio&&audio<work&&work<verify&&verify<retire);
 assert(!source.includes('getParameter('));
 assert.match(source.slice(work,verify),/publish\(\{status:'running',phase,result,resultsWorkProgress:resultsProgress.snapshot\(\)/);
});
