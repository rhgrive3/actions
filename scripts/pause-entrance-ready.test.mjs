import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pauseEntranceReady,waitForPauseEntrance,assertArtifactDigest} from './pause-entrance-ready.mjs';
function install(t) {
  const previous = Object.fromEntries(['document','window','getComputedStyle'].map(k=>[k,globalThis[k]]));
  t.after(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
  const element=()=>({style:{display:'block',visibility:'visible',opacity:'1'},animations:[],getAnimations(){return this.animations;},parentElement:null});
  const root=element(), children=Array.from({length:6},element);
  for(const child of children)child.parentElement=root;
  root.querySelector=selector=>children[{'.iw-head':0,'.iwr-pause':1,'.iwr-pause__menu':2}[selector]];
  root.querySelectorAll=()=>children.slice(3);
  globalThis.document={querySelectorAll:()=>[root]};globalThis.window={__G:{match:{paused:true}}};globalThis.getComputedStyle=e=>e.style;
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
    const page={async waitForFunction(predicate,arg,options){assert.deepEqual(options,{polling:'raf',timeout:1200});assert.equal(arg,null);for(let elapsed=0;elapsed<options.timeout;elapsed+=16){polls++;assert.equal(predicate(),false);}throw new Error('Timeout 1200ms');}};
    await assert.rejects(waitForPauseEntrance(page),/Timeout 1200ms/);assert.ok(polls>1);
  }
  root.animations=[];root.style.opacity='.5';assert.equal(pauseEntranceReady(),false);
  root.style.opacity='1';root.style.display='none';assert.equal(pauseEntranceReady(),false);
});
test('current main proposal replaces only readiness sleep and preserves failed screenshot',()=>{
 const s=fs.readFileSync(new URL('./check-inkwave-range.mjs',import.meta.url),'utf8');
 assert.ok(!s.includes('waitForTimeout(1200)'));
 const wait=s.indexOf('await waitForPauseEntrance(page)'),shot=s.indexOf("run.name + '-pause.png'",wait),fail=s.indexOf('if (pauseReadinessError) throw pauseReadinessError',shot);
 assert.ok(wait>0&&shot>wait&&fail>shot);assert.ok(!s.includes("animations: 'disabled'"));
});
test('rejected wait saves first state before screenshot advances it or fails',async()=>{
 const s=fs.readFileSync(new URL('./check-inkwave-range.mjs',import.meta.url),'utf8');
 const block=s.slice(s.indexOf('    let pauseReadinessError;'),s.indexOf('    // The hub ring remains readable.',s.indexOf('    let pauseReadinessError;')));
 const execute=Object.getPrototypeOf(async function(){}).constructor('waitForPauseEntrance','page','out','collectPauseEntranceEvidence','fs','path','evidence','run','manifest',block);
 for(const screenshotFails of [false,true]){
  const order=[];let opacity=0,saved;
  await assert.rejects(execute(async()=>{order.push('wait');throw Error('timeout1200');},{evaluate:async()=>{order.push('collect');return {opacity};},screenshot:async()=>{order.push('screenshot');opacity=1;if(screenshotFails)throw Error('capture failed');}},{checks:{}},()=>{}, {writeFileSync:(p,s)=>{order.push('receipt');saved=JSON.parse(s);}},{join:(...p)=>p.join('/')},'evidence',{name:'test'},{contentHash:'current'}),screenshotFails?/capture failed/:/timeout1200/);
  assert.deepEqual(order,['wait','collect','receipt','screenshot']);assert.equal(saved.state.opacity,0);assert.equal(saved.settled,false);
 }
});

test('immutable content/compiler check rejects wrong build and compiler',()=>{
 const s=fs.readFileSync(new URL('./check-inkwave-range.mjs',import.meta.url),'utf8');
 const line=s.split('\n').find(l=>l.startsWith('if(manifest.contentHash!==FROZEN_CONTENT'));
 const check=Function('manifest','FROZEN_CONTENT',line);
 assert.doesNotThrow(()=>check({contentHash:'expected',build:{esbuild:'0.28.2'}},'expected'));
 assert.throws(()=>check({contentHash:'changed',build:{esbuild:'0.28.2'}},'expected'),/Frozen emitted/);
 assert.throws(()=>check({contentHash:'expected',build:{esbuild:'changed'}},'expected'),/Frozen emitted/);
 assert.ok(s.includes("for(const [file,digest] of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Artifact mismatch '+file)"));
});

test('request gate rejects unknown bytes and accepts only manifest exception',()=>{
 const artifacts={'index.html':'abc'};
 assertArtifactDigest('index.html','abc',artifacts,'manifest');
 assertArtifactDigest('inkwave-build.json','manifest',artifacts,'manifest');
 for(const [key,hash] of [['unknown.js','abc'],['index.html','wrong'],['inkwave-build.json','wrong']])assert.throws(()=>assertArtifactDigest(key,hash,artifacts,'manifest'));
});
