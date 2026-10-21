import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {enterRangeFromMenu} from '../lib/inkwave-range-menu-entry.mjs';
const source=fs.readFileSync(new URL('../check-inkwave-range.mjs',import.meta.url),'utf8');
test('range runner preserves 420s native admission and trusted route on each device',()=>{
 assert.match(source,/enterRangeFromMenu\(page,base\.replace/);
 assert.match(source,/touch:run\.touch,timeout:420000/);
 assert.doesNotMatch(source,/page\.goto\(base \+ '\?range&skipTitle',/);
 assert.match(source,/out\.entryFailure=\{consoleErrors:entryConsoleErrors/);
 assert.match(source,/shooterResident:a\?\._weaponBank\?\.authorized/);
 assert.match(source,/throw error;/);
 assert.doesNotMatch(source,/autoplay-policy|requireRecordedMainShot\s*=/);
});
test('shared helper honors existing range timeout and rejects denied admission',async()=>{
 for(const deny of [false,true]){
  const root={inert:false,parentNode:null,contains:e=>e===control,opacity:1},control={parentElement:root,disabled:false,opacity:1,closest:s=>s==='[data-nav]'?control:null};
  const window={__inkwave:{menus:{current:'main',_scr:{name:'main',el:root}}},__G:{match:null}},listeners=new Set(),timeouts=[];
  const document={querySelectorAll:()=>[control],addEventListener:(_,f)=>listeners.add(f),removeEventListener:(_,f)=>listeners.delete(f)};
  const run=(fn,arg)=>vm.runInNewContext('('+fn.toString()+')',{window,document,getComputedStyle:e=>({opacity:String(e.opacity)})})(arg);
  const page={goto:async()=>{},evaluate:async(fn,arg)=>run(fn,arg),waitForFunction:async(fn,arg,o)=>{timeouts.push(o.timeout);assert(run(fn,arg),'native range admission');},locator:selector=>({tap:async o=>{
   timeouts.push(o.timeout);for(const f of [...listeners])f({type:'click',isTrusted:true,target:{closest:s=>s===selector?{}:null}});
   if(selector.includes('"play"')){window.__inkwave.menus.current='mode';window.__inkwave.menus._scr.name='mode';}
   else if(!deny)window.__G.match={range:{},state:'playing'};
  }})};
  const promise=enterRangeFromMenu(page,'http://localhost',{touch:true,timeout:420000});
  if(deny)await assert.rejects(promise,/native range admission/);else assert.deepEqual((await promise).route,['main','mode','range']);
  assert(timeouts.length>=7);assert.equal(timeouts.at(-1),420000);assert(timeouts.every(t=>t>0&&t<=420000));
 }
});
test('all existing gameplay, isolation, profiler and error gates remain present',()=>{
 for(const token of ['st.targets !== 11','st.pads !== 14','st.weaponPads !== 7','Math.abs(out.checks.hit.dist - 10) > 0.6','Math.abs(p.area - 400) > 1e-6','picker.count !== 161','picker.unique !== 161','picker.bases !== 66','picker.variants !== 95','picker.second !== 65','picker.third !== 30','picker.catalog !== 142','iso.actors !== 8','perf.collected < 12','if (out.errors.length)','if (out.missing.length)'])assert(source.includes(token),token);
 assert.match(source,/profileRangeAcceptanceSnapshot, null, \{ timeout: 90000 \}/);
});
