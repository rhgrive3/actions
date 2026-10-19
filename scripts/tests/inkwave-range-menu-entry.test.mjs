import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {enterRangeFromMenu,rangeMenuControlReady} from '../lib/inkwave-range-menu-entry.mjs';
function fixture({trusted=true,wrongMode=false,denyAudio=false}={}){
 const calls=[],listeners=new Set(),root={inert:false,parentNode:null,contains:e=>e===control,opacity:1},control={parentElement:root,disabled:false,opacity:1,closest:s=>s==='[data-nav]'?control:null};
 const window={__inkwave:{menus:{current:'main',_scr:{name:'main',el:root}}},__G:{match:null}};
 const document={querySelectorAll:()=>[control],addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 const run=(fn,arg)=>vm.runInNewContext('('+fn.toString()+')',{window,document,getComputedStyle:e=>({opacity:String(e.opacity)})})(arg);
 const page={async goto(url){calls.push(['goto',url]);},async evaluate(fn,arg){return run(fn,arg);},async waitForFunction(fn,arg,opts){assert(opts.timeout>0&&opts.timeout<=240000);assert(run(fn,arg),'normal menu/admission condition');},locator(selector){return Object.fromEntries(['click','tap'].map(kind=>[kind,async opts=>{
  assert(opts.timeout>0&&opts.timeout<=240000);calls.push([kind,selector]);
  const event={type:'click',isTrusted:trusted,target:{closest:s=>s===selector?{}:null}};
  for(const fn of [...listeners])fn(event);
  if(selector.endsWith('"play"]')){window.__inkwave.menus.current=wrongMode?'setup':'mode';window.__inkwave.menus._scr.name=window.__inkwave.menus.current;}
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
function controlFixture({current='mode',screen='mode',inert=false,opacity=1,parentOpacity=1,duplicate=false,outside=false,disabled=false,leaving=false}={}){
 const root={inert,parentNode:null,opacity:parentOpacity,contains:()=>!outside};
 const control={disabled,opacity,parentElement:root,closest:s=>s==='[data-nav]'?control:leaving?root:null};
 const window={__inkwave:{menus:{current,_scr:{name:screen,el:root}}}};
 const document={querySelectorAll:()=>duplicate?[control,control]:[control]};
 const getComputedStyle=e=>({opacity:String(e.opacity)});
 const run=fn=>vm.runInNewContext('('+fn.toString()+')',{window,document,getComputedStyle})({selector:'.target',menu:'mode'});
 return {run,window,root,control,getComputedStyle};
}
test('readiness matches effective opacity, current screen and inert ownership',()=>{
 assert.equal(controlFixture({opacity:.8,parentOpacity:.8}).run(rangeMenuControlReady),true);
 for(const opts of [{opacity:0},{opacity:.6},{opacity:.8,parentOpacity:.7},{inert:true},{current:'main'},{screen:'main'},{duplicate:true},{outside:true},{disabled:true},{leaving:true}])assert.equal(controlFixture(opts).run(rangeMenuControlReady),false,JSON.stringify(opts));
});
test('actual production guard can reject a trusted captured click before acceptance',()=>{
 const source=fs.readFileSync(new URL('../../patches/local-quality/menu.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const visibleItem='),source.indexOf('  if(settings)',source.indexOf('  const visibleItem=')));
 assert(body.includes('e.stopImmediatePropagation();e.preventDefault();'));
 for(const opts of [{opacity:.8,parentOpacity:.7},{inert:true},{current:'main'},{},]){
  const f=controlFixture(opts),m=f.window.__inkwave.menus,listeners={};
  m.el={addEventListener:(type,fn)=>{listeners[type]=fn;}};
  const guard=vm.runInNewContext('(function(){const pending=m=>!!(m._scr&&m.current!==m._scr.name);'+body+';return guardInput;})()',{env:{getComputedStyle:f.getComputedStyle}});guard(m);
  const event={target:f.control,isTrusted:true,stopped:false,prevented:false,stopImmediatePropagation(){this.stopped=true;},preventDefault(){this.prevented=true;}};
  listeners.pointerdown(event);const documentCapturedTrusted=event.isTrusted;listeners.click(event);
  assert.equal(documentCapturedTrusted,true);
  const ready=f.run(rangeMenuControlReady);assert.equal(event.stopped,!ready);assert.equal(event.prevented,!ready);
 }
});
test('preclick readiness shares action budget and does not retry or mutate screens',()=>{
 const source=fs.readFileSync(new URL('../lib/inkwave-range-menu-entry.mjs',import.meta.url),'utf8');
 assert(source.indexOf('waitForFunction(rangeMenuControlReady')<source.indexOf('button.tap('));
 assert.equal((source.match(/button\.tap\(/g)||[]).length,1);assert.equal((source.match(/button\.click\(/g)||[]).length,1);
 assert.match(source,/deadline=Date\.now\(\)\+timeout/);assert.match(source,/tap\(\{timeout:remaining\(\)\}\)/);
 assert.doesNotMatch(source,/\.inert\s*=|\.current\s*=(?!=)|\.opacity\s*=/);
});
test('late readiness receipt cannot reset the pointer action deadline',async()=>{
 const f=fixture();let clock=1000;const now=Date.now,wait=f.page.waitForFunction;
 try{
  Date.now=()=>clock;
  f.page.waitForFunction=async(fn,arg,opts)=>{await wait(fn,arg,opts);if(fn.name==='rangeMenuControlReady')clock+=240000;};
  await assert.rejects(enterRangeFromMenu(f.page,'http://localhost'),/deadline exceeded/);
  assert.deepEqual(f.calls,[['goto','http://localhost/?skipTitle']]);
 }finally{Date.now=now;}
});
