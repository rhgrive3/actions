import test from 'node:test';
import assert from 'node:assert/strict';
import {auditInputListeners} from '../lib/inkwave-input-listener-audit.mjs';

function setup(fault='') {
 const windowTarget=new EventTarget(),documentTarget=new EventTarget(),canvas=new EventTarget();
 let sentinels,canvasCalls=0;
 class Input {
  constructor() {
   this.keys=new Set();this._platformInputListeners=[];this.abort=new AbortController();this.disposed=false;
   const shared=()=>{};
   const listen=(target,type,callback,capture=false)=>{
    this._platformInputListeners.push({target,type,callback,capture});target.addEventListener(type,callback,{capture});
   };
   listen(windowTarget,'keydown',e=>this.keys.add(e.code));
   listen(windowTarget,'keyup',e=>this.keys.delete(e.code));
   // Same callback on distinct targets and capture phases must remain distinct identities.
   listen(windowTarget,'custom',shared,false);listen(windowTarget,'custom',shared,true);
   listen(documentTarget,'custom',shared,false);listen(canvas,'custom',shared,false);
   canvas.addEventListener('pointerdown',()=>canvasCalls++,{signal:this.abort.signal});
   const resize=()=>{};windowTarget.addEventListener('resize',resize,true);
   this.mobile={_queueSafeLayout:{unsubs:[()=>windowTarget.removeEventListener('resize',resize,{capture:true})]}};
  }
  down(key){return this.keys.has(key);}
  disposePlatform(){
   if(this.disposed){if(fault==='second-dispose')windowTarget.addEventListener('unexpected',()=>{});return;}
   this.disposed=true;
   for(const o of this._platformInputListeners){
    if(fault==='leak-target'&&o.target===documentTarget)continue;
    if(fault==='leak-key'&&o.type==='keydown')continue;
    o.target.removeEventListener(o.type,o.callback,{capture:fault==='wrong-capture'?!o.capture:o.capture});
   }
   if(fault!=='forget-abort')this.abort.abort();
   const sampler=this.mobile._queueSafeLayout;
   if(fault!=='leak-sampler'){for(const off of sampler.unsubs)off();sampler.unsubs.length=0;}
   if(fault==='remove-sentinel')sentinels[0].target.removeEventListener('iw-audit-sentinel',sentinels[0].callback,{capture:true});
  }
 }
 const args={Input,windowTarget,documentTarget,canvas,requireCanvas:true,cycles:3,
  event:type=>new Event(type),keyEvent:(type,code)=>{const e=new Event(type);Object.defineProperty(e,'code',{value:code});return e;},
  onSentinels:s=>{sentinels=s;}};
 return {args,canvas,getCanvasCalls:()=>canvasCalls};
}
test('exact listener identities, abort ownership, sentinels and repeated disposal pass',()=>{
 const f=setup(),result=auditInputListeners(f.args);
 assert.equal(result.cycles,3);assert.equal(result.active,0);assert.deepEqual(result.sentinelCalls,[3,3,3]);
 f.canvas.dispatchEvent(new Event('pointerdown'));assert.equal(f.getCanvasCalls(),0);
});
test('capture propagation from canvas does not count as a window or document sentinel dispatch',()=>{
 const f=setup(),previous=f.args.onSentinels;
 f.args.onSentinels=sentinels=>{previous(sentinels);sentinels[0].callback({target:f.canvas});sentinels[1].callback({target:f.canvas});};
 assert.deepEqual(auditInputListeners(f.args).sentinelCalls,[3,3,3]);
});
for(const [fault,pattern] of [
 ['leak-target',/instance listener remains active/],['wrong-capture',/instance listener remains active/],
 ['forget-abort',/instance listener remains active/],['leak-sampler',/mobile layout sampler retained its unsubs/],['leak-key',/instance listener remains active/],
 ['second-dispose',/second dispose is not idempotent/],['remove-sentinel',/unrelated preexisting sentinel/],
]) test(`observer rejects ${fault}`,()=>{const f=setup(fault);assert.throws(()=>auditInputListeners(f.args),pattern);});
