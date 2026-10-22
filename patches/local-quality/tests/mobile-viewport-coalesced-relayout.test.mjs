import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../../inkwave-public/src/core/mobile.js',import.meta.url),'utf8');
const start=source.indexOf('    const relayout = () => {');
const end=source.indexOf("    window.addEventListener('resize', relayout",start);
assert.ok(start>0&&end>start,'test must exercise current production relayout body');
const relayoutCode=source.slice(start,end);
const endDestroy=source.indexOf('\n  _install()',source.indexOf('  destroy()'));
const destStart=source.indexOf('  destroy()');
assert.ok(destStart>0&&endDestroy>destStart,'destroy method must remain discoverable');
const rawDestroy=source.slice(destStart,endDestroy).trim().replace(/^destroy\(\)/,'function destroy()');
function rig(){
 const frames=new Map();let next=1,cancelled=[];
 const requestAnimationFrame=cb=>{const id=next++;frames.set(id,cb);return id;};
 const cancelAnimationFrame=id=>{cancelled.push(id);frames.delete(id);};
 const ctx={requestAnimationFrame,cancelAnimationFrame,document:{documentElement:{classList:{remove(){}}}}};
 const make=vm.runInNewContext('(function(){\n'+relayoutCode+'\nreturn relayout;})',ctx);
 const destroy=vm.runInNewContext('('+rawDestroy+')',ctx);
 const counts={resync:0,reset:0,layout:0,coordinates:0,stopped:0,removed:0};
 const obj={_relayoutRaf:null,_abort:new AbortController(),gyro:{resync(){counts.resync++;},stop(){counts.stopped++;}},
  resetPointers(){counts.reset++;},_layoutAll(){counts.layout++;if(this.editing)counts.coordinates++;},
  editing:true,root:{remove(){counts.removed++;}}};
 return {counts,frames,cancelled,obj,relayout:make.call(obj),destroy:()=>destroy.call(obj)};
}
test('three native viewport events coalesce to one layout but all cancel gestures and resync gyro',()=>{
 const x=rig();x.relayout();x.relayout();x.relayout();
 assert.deepEqual([x.counts.reset,x.counts.resync,x.frames.size,x.counts.layout],[3,3,1,0]);
 const done=[...x.frames.values()][0];x.frames.clear();done();
 assert.equal(x.counts.layout,1);assert.equal(x.counts.coordinates,1);
 x.relayout();assert.equal(x.frames.size,1);for(const f of x.frames.values())f();
 assert.equal(x.counts.layout,2);
});
test('destroy cancels a pending viewport animation and disallows stale callbacks',()=>{
 const x=rig();x.relayout();const [[id,callback]]=[...x.frames];
 x.destroy();assert.deepEqual(x.cancelled,[id]);
 assert.equal(x.frames.size,0);assert.equal(x.obj._relayoutRaf,null);
 callback();assert.equal(x.counts.layout,0);
 assert.equal(x.counts.stopped,1);assert.equal(x.counts.removed,1);
});
test('existing three event listeners still use one relayout handler',()=>{
 for(const event of ["window.addEventListener('resize', relayout",
  "screen.orientation?.addEventListener?.('change', relayout",
  "window.addEventListener('orientationchange', relayout"])assert.ok(source.includes(event),event);
});
