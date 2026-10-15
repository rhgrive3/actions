import assert from 'node:assert/strict';
const names=['decode','resize','resize-reject','texture-setup-reject','normal','abort'];
export function validateResults(results){
 assert.equal(results.length,12);const seen=new Set();
 for(const r of results){
  assert(['baseline','candidate'].includes(r.variant));assert(names.includes(r.scenario));const k=r.variant+'/'+r.scenario;assert(!seen.has(k));seen.add(k);
  const leak=r.variant==='baseline'&&['resize-reject','texture-setup-reject'].includes(r.scenario),success=['decode','resize','normal'].includes(r.scenario);
  assert.equal(r.ownershipPass,!leak,k);assert.equal(r.restorationVerifiedOnExit,true);assert.equal(r.returned,success);
  assert.equal(r.calls,['decode','normal'].includes(r.scenario)?1:2);
  const dimensions=r.scenario==='resize-reject'||['decode','normal'].includes(r.scenario)?[[32,16]]:[[32,16],[8,4]];
  assert.equal(r.snapshots.length,dimensions.length);
  const live=success&&r.scenario!=='normal'?dimensions.length-1:leak?dimensions.length-1:-1;
  const events=[];
  for(let i=0;i<dimensions.length;i++){
   const s=r.snapshots[i],alive=i===live;assert.equal(s.id,i);assert.equal(s.closeCount,alive?0:1);assert.equal(s.drawable,alive);assert.deepEqual([s.width,s.height],alive?dimensions[i]:[0,0]);assert.deepEqual(s.pixel,alive?[192,64,32,255]:null);
   if(!alive)events.push({id:i,before:dimensions[i],after:[0,0]});
  }
  assert.deepEqual(r.closeEvents,events);
  assert.equal(r.disposedCount,success||leak||r.scenario==='resize-reject'?0:1);
  if(success){assert.equal(r.error,undefined);assert.deepEqual(r.callerCleanup,{disposed:1,bitmapClosed:r.scenario==='normal'?null:true});}
  else {assert.deepEqual(r.error,r.scenario==='abort'?{name:'AbortError',message:'Aborted'}:{name:'Error',message:r.scenario==='resize-reject'?'intentional-resize-reject':'intentional-texture-setup-reject'});assert.equal(r.callerCleanup,undefined);}
 }
}
