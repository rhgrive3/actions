import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {enterRangeFromMenu} from '../lib/inkwave-range-menu-entry.mjs';
function fixture({trusted=true,wrongMode=false,denyAudio=false}={}){
 const calls=[],listeners=new Set(),window={__inkwave:{menus:{current:'main'}},__G:{match:null}};
 const document={addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 const run=(fn,arg)=>vm.runInNewContext('('+fn.toString()+')',{window,document})(arg);
 const page={async goto(url){calls.push(['goto',url]);},async evaluate(fn,arg){return run(fn,arg);},async waitForFunction(fn,arg,opts){assert.equal(opts.timeout,240000);assert(run(fn,arg),'normal menu/admission condition');},locator(selector){return Object.fromEntries(['click','tap'].map(kind=>[kind,async opts=>{
  assert.equal(opts.timeout,240000);calls.push([kind,selector]);
  const event={type:'click',isTrusted:trusted,target:{closest:s=>s===selector?{}:null}};
  for(const fn of [...listeners])fn(event);
  if(selector.endsWith('"play"]'))window.__inkwave.menus.current=wrongMode?'setup':'mode';
  else {assert.equal(window.__inkwave.menus.current,'mode');if(!denyAudio)window.__G.match={range:{},state:'playing'};}
 }]))}};
 return {page,calls,listeners};
}
for(const touch of [false,true])test('range uses actual '+(touch?'touch':'click')+' menu route and records trusted input',async()=>{
 const f=fixture(),r=await enterRangeFromMenu(f.page,'http://127.0.0.1:1234',{touch});
 assert.deepEqual(f.calls,[['goto','http://127.0.0.1:1234/?skipTitle'],[touch?'tap':'click','.iw-ui [data-id="play"]'],[touch?'tap':'click','.iw-ui [data-id="mode-range"]']]);
 assert.deepEqual(r.route,['main','mode','range']);assert.equal(r.gestures.length,2);assert(r.gestures.every(x=>x.trusted));assert.equal(f.listeners.size,0);
});
test('untrusted input, wrong mode and denied admission remain failures',async()=>{
 for(const opts of [{trusted:false},{wrongMode:true},{denyAudio:true}]){let receipt;await assert.rejects(enterRangeFromMenu(fixture(opts).page,'http://127.0.0.1:1234',{onProgress:r=>{receipt=r;}}));assert(receipt);if(opts.denyAudio){assert.equal(receipt.gestures.length,2);assert.deepEqual(receipt.route,['main','mode']);}}
});
test('entry never bypasses production audio or match admission',()=>{
 const source=fs.readFileSync(new URL('../lib/inkwave-range-menu-entry.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/startMatch|prepareMatch\(|\.resume\(|\.init\(|AudioContext|ignoreHTTPSErrors|autoplay-policy/);
 assert.match(source,/window\.__G\?\.match\?\.range&&window\.__G\.match\.state==='playing'/);
});
