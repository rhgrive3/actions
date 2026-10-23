import test from 'node:test';
import assert from 'node:assert/strict';
import {intervalCoverage,summarizeStartupTrace}from'../lib/inkwave-startup-trace-summary.mjs';

test('trace interval coverage unions nested, repeated and intersecting work',()=>{
 assert.equal(intervalCoverage([[0,10],[2,8],[0,10],[8,12],[20,25]]),17);
 assert.equal(intervalCoverage([[NaN,5],[2,2],[9,1]]),0);
});
test('startup trace clips to the declared navigation phase and binds process/thread metadata',()=>{
 const trace={traceEvents:[
  {ph:'M',pid:1,tid:2,name:'process_name',args:{name:'Renderer'}},
  {ph:'M',pid:1,tid:2,name:'thread_name',args:{name:'CrRendererMain'}},
  {ph:'X',pid:1,tid:2,name:'RunTask',cat:'toplevel',ts:10000000,dur:4000},
  {ph:'X',pid:1,tid:2,name:'RunTask',cat:'toplevel',ts:10001000,dur:1000},
  {ph:'X',pid:1,tid:2,name:'RunTask',cat:'toplevel',ts:10006000,dur:9000},
  {ph:'X',pid:1,tid:2,name:'ParseHTML',cat:'blink',ts:10007000,dur:1000},
  {ph:'X',pid:1,tid:2,name:'Unrelated',cat:'blink',ts:9000000,dur:1000},
 ]};
 const result=summarizeStartupTrace(trace,10,{responseEnd:2,domInteractive:10});
 assert.equal(result.durationMs,8);
 assert.equal(result.topRecords[0].name,'RunTask');assert.equal(result.topRecords[0].coveredMs,6);
 assert.equal(result.topRecords[0].process,'Renderer');assert.equal(result.topRecords[0].thread,'CrRendererMain');
 assert.equal(result.topRecords.length,2);assert.equal(result.topRecords[1].coveredMs,1);
 assert.match(result.interpretation,/not CPU samples/);
});
test('unbound or reversed trace navigation clocks fail instead of fabricating timings',()=>{
 assert.throws(()=>summarizeStartupTrace({},undefined,{responseEnd:1,domInteractive:2}),/binding/);
 assert.throws(()=>summarizeStartupTrace({},10,{responseEnd:2,domInteractive:1}),/backwards/);
});
test('source trace records retain the concrete script URL and clipped duration',()=>{
 const trace={traceEvents:[
  {ph:'X',pid:1,tid:2,name:'EvaluateScript',ts:10000000,dur:10000,args:{data:{url:'http://localhost/_versions/fixed/runtime/install.mjs'}}},
  {ph:'X',pid:1,tid:2,name:'FunctionCall',ts:10004000,dur:1000,args:{data:{scriptName:'http://localhost/_versions/fixed/src/main.js'}}},
 ]};
 const result=summarizeStartupTrace(trace,10,{responseEnd:2,domInteractive:8});
 assert.equal(result.topSources[0].url,'http://localhost/_versions/fixed/runtime/install.mjs');
 assert.equal(result.topSources[0].coveredMs,6);
 assert.equal(result.topSources[1].coveredMs,1);
});
