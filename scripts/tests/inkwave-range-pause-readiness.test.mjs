import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pauseEntranceReady,waitForPauseEntrance,collectPauseEntranceEvidence} from '../inkwave-range-pause-readiness.mjs';
function install(t) {
  const previous = Object.fromEntries(['document','window','getComputedStyle'].map(k=>[k,globalThis[k]]));
  t.after(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
  const element=()=>({style:{display:'block',visibility:'visible',opacity:'1'},animations:[],getAnimations(){return this.animations;},parentElement:null});
  const root=element(), children=Array.from({length:6},element);
  for(const child of children)child.parentElement=root;
  root.querySelector=selector=>children[{'.iw-head':0,'.iwr-pause':1,'.iwr-pause__menu':2}[selector]];
  root.querySelectorAll=()=>children.slice(3);
  globalThis.document={querySelectorAll:()=>[root],querySelector:()=>root,timeline:{currentTime:123}};globalThis.window={__G:{match:{paused:true}}};globalThis.getComputedStyle=e=>e.style;
  return {root,children};
}
test('serialized predicate rejects entrance then accepts naturally settled state',t=>{
  const {children}=install(t),head=children[0];
  head.style.opacity='0';head.animations=[{pending:true,playState:'running',currentTime:0}];
  assert.equal(pauseEntranceReady(),false);
  head.style.opacity='1';assert.equal(pauseEntranceReady(),false);
  head.animations=[];assert.equal(pauseEntranceReady(),true);
  // Standalone serialization must not depend on module closure bindings.
  assert.equal(Function('return ('+pauseEntranceReady.toString()+')()')(),true);
});
test('stuck running, paused, pending or hidden ancestor never becomes ready',async t=>{
  const {root}=install(t);
  for(const animation of [{pending:true,playState:'running'},{pending:false,playState:'paused'},{pending:false,playState:'running'}]) {
    root.animations=[animation];let polls=0;
    const page={async waitForSelector(){},async waitForFunction(predicate,arg,options){assert.deepEqual(options,{polling:'raf',timeout:30000});assert.equal(arg,null);for(let elapsed=0;elapsed<options.timeout;elapsed+=16){polls++;assert.equal(predicate(),false);}throw new Error('Timeout 30000ms');}};
    await assert.rejects(waitForPauseEntrance(page,()=>0),/Timeout 30000ms/);assert.ok(polls>1);
  }
  root.animations=[];root.style.opacity='.5';assert.equal(pauseEntranceReady(),false);
  root.style.opacity='1';root.style.display='none';assert.equal(pauseEntranceReady(),false);
});
test('current main proposal replaces only readiness sleep and preserves failed screenshot',()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-range.mjs',import.meta.url),'utf8');
 assert.ok(!s.includes('waitForTimeout(1200)'));
 const wait=s.indexOf('await waitForPauseEntrance(page)'),shot=s.indexOf("run.name + '-pause.png'",wait),fail=s.indexOf('if (pauseReadinessError) throw pauseReadinessError',shot);
 assert.ok(wait>0&&shot>wait&&fail>shot);assert.ok(!s.includes("animations: 'disabled'"));
});
test('rejected wait saves first state before screenshot advances it or fails',async()=>{
 const s=fs.readFileSync(new URL('../check-inkwave-range.mjs',import.meta.url),'utf8');
 const block=s.slice(s.indexOf('    let pauseReadinessError;'),s.indexOf('    // The hub ring remains readable.',s.indexOf('    let pauseReadinessError;')));
 const execute=Object.getPrototypeOf(async function(){}).constructor('waitForPauseEntrance','page','out','collectPauseEntranceEvidence','fs','path','evidence','run','manifest',block);
 for(const screenshotFails of [false,true]){
  const order=[];let opacity=0,saved;
  await assert.rejects(execute(async()=>{order.push('wait');throw Error('timeout1200');},{evaluate:async()=>{order.push('collect');return {opacity};},screenshot:async()=>{order.push('screenshot');opacity=1;if(screenshotFails)throw Error('capture failed');}},{checks:{}},()=>{}, {writeFileSync:(p,s)=>{order.push('receipt');saved=JSON.parse(s);}},{join:(...p)=>p.join('/')},'evidence',{name:'test'},{contentHash:'current'}),screenshotFails?/capture failed/:/timeout1200/);
  assert.deepEqual(order,['wait','collect','receipt','screenshot']);assert.equal(saved.state.opacity,0);assert.equal(saved.settled,false);
 }
});

test('selector and animation share one absolute original window without reset or retry',async()=>{
 let time=100,calls=[];
 const page={async waitForSelector(selector,options){calls.push(['selector',options.timeout]);assert.equal(selector,'.iwr-pausescr [data-id="z-bomb"]');time+=27000;},async waitForFunction(predicate,arg,options){calls.push(['animation',options.timeout]);}};
 await waitForPauseEntrance(page,()=>time);
 assert.deepEqual(calls,[['selector',30000],['animation',3000]]);
});
test('selector consumes deadline: animation never receives zero/unlimited timeout',async()=>{
 let time=0,calls=0;
 const page={async waitForSelector(){time=30000;},async waitForFunction(){calls++;}};
 await assert.rejects(waitForPauseEntrance(page,()=>time),/window exhausted/);assert.equal(calls,0);
});
test('selector timeout fails once and never restarts readiness',async()=>{
 let selectors=0,animations=0;
 await assert.rejects(waitForPauseEntrance({async waitForSelector(){selectors++;throw Error('selector timeout');},async waitForFunction(){animations++;}},()=>0),/selector timeout/);
 assert.equal(selectors,1);assert.equal(animations,0);
});

test('negative or nonfinite remaining fails closed without animation wait',async()=>{
 for(const last of [30001,Infinity,-Infinity,NaN]){
  let reads=0,animations=0;const now=()=>++reads<3?0:last;
  await assert.rejects(waitForPauseEntrance({async waitForSelector(){},async waitForFunction(){animations++;}},now),/window exhausted/);
  assert.equal(animations,0);
 }
});
test('naturally ready entrance is accepted only inside the remaining budget',async t=>{
 install(t);let time=0,timeout;
 await waitForPauseEntrance({async waitForSelector(){time=500;},async waitForFunction(predicate,arg,options){timeout=options.timeout;assert.equal(predicate(),true);}},()=>time);
 assert.equal(timeout,29500);
});

test('late successful protocol response does not admit beyond absolute deadline',async()=>{
 let time=0;
 await assert.rejects(waitForPauseEntrance({async waitForSelector(){time=100;},async waitForFunction(){time=30001;}},()=>time),/window exhausted/);
});

test('general verifier stays portable and CI executes this regression',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-range.mjs',import.meta.url),'utf8');
 assert.ok(!source.includes('FROZEN_SOURCE'));assert.ok(!source.includes('FROZEN_CONTENT'));assert.ok(!source.includes("option('--source')"));
 const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('scripts/tests/inkwave-range-pause-readiness.test.mjs'));
});
test('serialized evidence preserves pending opacity-zero entrance without mutation',t=>{
 const {children}=install(t);children[0].style.opacity='0';children[0].animations=[{animationName:'entrance',pending:true,playState:'running',currentTime:0}];
 const collect=Function('return ('+collectPauseEntranceEvidence.toString()+')()');
 const evidence=collect();assert.equal(evidence.elements[1].chain[0].opacity,'0');assert.equal(evidence.elements[1].chain[0].animations[0].pending,true);
 assert.equal(children[0].style.opacity,'0');assert.equal(children[0].animations[0].currentTime,0);
});
