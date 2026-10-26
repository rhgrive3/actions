// Controlled Node contracts, not browser Pointer Lock acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireNativeCaptureInput,assertInputAdmission,readInputAdmission} from '../lib/reticle-next/native-input-admission.mjs';
const admitted={mode:'match',state:'playing',paused:false,menu:null,frozen:true,nativeTick:80,time:1,enabled:true,lastDevice:'kbm',locked:true,pointerLockIsCanvas:true,events:[{type:'resume-click',trusted:true},{type:'pointerlockchange',pointerLockIsCanvas:true}]};
function rig({admittedInitially=false,deny=false,untrusted=false,advance=false,cleanupFails=false}={}){
 const calls=[],updates=[];let reads=0;
 const before={...admitted,locked:admittedInitially,pointerLockIsCanvas:admittedInitially,events:[]};
 const after={...admitted,nativeTick:advance?81:80,events:untrusted?[{type:'resume-click',trusted:false},{type:'pointerlockchange',pointerLockIsCanvas:true}]:admitted.events};
 const page={
  evaluate:async(fn)=>{if(fn===readInputAdmission){reads++;return reads===1?before:reads===2?{...before,paused:true,menu:'pause'}:after;}calls.push(fn.toString().includes('already owned')?'observe':'stop');if(cleanupFails&&calls.at(-1)==='stop')throw Error('observer cleanup');},
  keyboard:{press:async key=>calls.push('press:'+key),up:async key=>calls.push('up:'+key)},
  mouse:{up:async()=>calls.push('mouse-up')},
  waitForFunction:async fn=>{calls.push('wait');if(deny&&calls.filter(c=>c==='wait').length===3)throw Error('browser lock denied');},
  locator:selector=>({click:async()=>calls.push('click:'+selector)})};
 return {page,calls,updates,options:{onUpdate:r=>updates.push(r)}};
}
test('requires both actual canvas pointerLockElement and native Input locked; rejects fake flag-only admission',()=>{
 assertInputAdmission(admitted);assert.throws(()=>assertInputAdmission({...admitted,pointerLockIsCanvas:false}));assert.throws(()=>assertInputAdmission({...admitted,locked:false}));assert.throws(()=>assertInputAdmission({...admitted,paused:true}));
});
test('native KeyP then trusted Resume route owns successful admission and input cleanup',async()=>{
 const r=rig(),result=await acquireNativeCaptureInput(r.page,r.options);assert.equal(result.status,'admitted');
 assert(r.calls.includes('press:KeyP'));assert(r.calls.includes('click:.iw-ui [data-id="resume"]'));
 assert(r.calls.includes('up:KeyP')&&r.calls.includes('mouse-up')&&r.calls.includes('stop'));
});
test('already actually locked range does not open needless pause UI',async()=>{
 const r=rig({admittedInitially:true});assert.equal((await acquireNativeCaptureInput(r.page,r.options)).status,'already-admitted');assert(!r.calls.some(c=>c.startsWith('press:')));
});
test('real browser rejection remains failure with final diagnostic and released P/mouse',async()=>{
 const r=rig({deny:true});await assert.rejects(acquireNativeCaptureInput(r.page,r.options),/browser lock denied/);
 assert.equal(r.updates.at(-1).status,'failed');assert(r.updates.at(-1).failure);assert(r.calls.includes('up:KeyP')&&r.calls.includes('mouse-up'));
});
test('untrusted Resume and any native tick advance fail closed',async()=>{
 for(const options of [{untrusted:true},{advance:true}]){const r=rig(options);await assert.rejects(acquireNativeCaptureInput(r.page,r.options));}
});
test('primary denial remains available if observer teardown also fails',async()=>{
 const r=rig({deny:true,cleanupFails:true});await assert.rejects(acquireNativeCaptureInput(r.page,r.options),e=>e instanceof AggregateError&&e.errors.some(e=>String(e).includes('browser lock denied'))&&e.errors.some(e=>String(e).includes('observer cleanup')));
});
test('helper observes native browser errors, never rewrites Input/state/methods or disables security',()=>{
 const source=fs.readFileSync(new URL('../lib/reticle-next/native-input-admission.mjs',import.meta.url),'utf8');
 assert(source.includes('pointerlockerror'));assert(source.includes('pointerlockchange'));assert(source.includes('isTrusted'));assert(source.includes('pointerLockElement===c'));
 assert(!/\.(locked|_relock|_touchRelockWanted|enabled|paused|charge|rounds)\s*=(?!=)/.test(source));
 assert(!/requestPointerLock\s*\(|\.requestLock\s*\(|dispatchEvent\s*\(|Object\.defineProperty|\.prototype\./.test(source));
});

test('actual native Main source: ordinary canvas click is relock-only, KeyP pause then native Resume requests lock',()=>{
 const root=process.env.INKWAVE_RETICLE_BASELINE_ROOT||fileURLToPath(new URL('../../',import.meta.url));
 const source=fs.readFileSync(path.join(root,'inkwave-public/src/main.js'),'utf8');
 const extract=(from,to)=>{const at=source.indexOf(from),end=source.indexOf(to,at);assert(at>=0&&end>at);return source.slice(at,end);};
 const canvas=extract("    this.R.renderer.domElement.addEventListener('mousedown'",'\n\n    // modules built');
 assert.match(canvas,/if \(this\._relock && G\.mode === 'match'/);assert.equal((canvas.match(/requestLock\(/g)||[]).length,1);
 const key=extract('  _onKey(e, repeat) {','\n  _onPointerUnlock() {');
 const pause=extract('  pause() {','\n  resume() {'),resume=extract('  resume() {','\n  async quitToMenu() {');
 let requests=0;const G={mode:'match'},Main=Function('G','return class {'+key+pause+resume+'}')(G),g=new Main();
 Object.assign(g,{_audioOn:true,match:{state:'playing',paused:false,controller:{enabled:true}},menus:{current:null,show(value){this.current=value;}},input:{exitLock(){},requestLock(){requests++;}}});
 assert.equal(g._onKey({code:'KeyP'},false),true);assert.equal(g.match.paused,true);assert.equal(g.menus.current,'pause');assert.equal(requests,0);
 g.resume();assert.equal(g.match.paused,false);assert.equal(g.menus.current,null);assert.equal(g.match.controller.enabled,true);assert.equal(requests,1);
});
