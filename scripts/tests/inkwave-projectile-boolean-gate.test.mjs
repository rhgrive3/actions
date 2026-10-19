import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const get=name=>{const start=source.indexOf('const '+name+' = () => {'),end=source.indexOf('\n    };',start);assert.ok(start>0&&end>start);return source.slice(start,end+7).replace('const '+name+' = ','').replace(/;$/,'');};
function native(state='playing'){
  const renderer={resource:{}};renderer.resource.owner=renderer;
  const match={state,attract:false,local:{isLocal:true},controller:{}};
  return {__inkwave:{match,debug:{}},__G:{mode:'match',match,projectiles:{},renderer}};
}
for(const name of ['admissionReady','playingReady']){
  const fn=get(name),old=fn.replace('return !!(','return ').replace('G.projectiles && G.renderer);','G.projectiles && G.renderer;');
  const run=(s,w)=>vm.runInNewContext('('+s+')()',{window:w});
  test(name+' returns primitive boolean with identical truth semantics',()=>{
    for(const state of ['intro','playing','finish']){
      const w=native(state),result=run(fn,w);assert.equal(typeof result,'boolean');assert.equal(result,!!run(old,w));
    }
    const w=native();assert.equal(run(old,w),w.__G.renderer,'negative control returns renderer graph');assert.equal(run(fn,w),true);
  });
  test(name+' fails closed for every missing native requirement',()=>{
    const mutations=[w=>{delete w.__G;},w=>{delete w.__inkwave;},w=>{w.__G.mode='menu';},w=>{w.__G.match={};},w=>{w.__inkwave.match.attract=true;},w=>{delete w.__inkwave.match.local;},w=>{w.__inkwave.match.local.isLocal=false;},w=>{delete w.__inkwave.match.controller;},w=>{delete w.__G.projectiles;},w=>{delete w.__G.renderer;}];
    if(name==='admissionReady')mutations.push(w=>{delete w.__inkwave.debug;});
    for(const change of mutations){const w=native();change(w);assert.equal(run(fn,w),false);assert.equal(run(fn,w),!!run(old,w));}
  });
}
test('phase observations are bounded and do not extend native admission budget',()=>{
  assert.equal((source.match(/const deadline = Date.now\(\) \+ NATIVE_BOOT_TIMEOUT_MS/g)||[]).length,1);
  assert.ok(source.includes('const NATIVE_BOOT_TIMEOUT_MS = 180000;'));
  for(const phase of ['menu','admission','intro','playing'])for(const event of ['begin','end'])assert.equal(source.split(`phaseMark('${phase}','${event}')`).length-1,1);
  assert.ok(source.includes("phase:'failure',event:'caught'"));
  assert.ok(source.includes('if (observed && Date.now() <= deadline) return;'));
  assert.ok(source.includes('Math.max(1, deadline - Date.now())'));
});
