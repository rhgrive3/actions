import assert from 'node:assert/strict';
export const scenarios=['unorm','signed','rgb','resize','multiple','unknown','readFailure','abort'];
export function validateResults(rows){
 assert.equal(rows.length,16);assert.equal(new Set(rows.map(r=>r.variant+':'+r.scenario)).size,16);
 for(const scenario of scenarios){const a=rows.find(r=>r.variant==='baseline'&&r.scenario===scenario),b=rows.find(r=>r.variant==='candidate'&&r.scenario===scenario);assert.ok(a&&b);
 for(const r of [a,b]){const failed=['readFailure','abort'].includes(scenario),n=scenario==='multiple'?2:1;assert.equal(r.disposeBefore.length,failed?0:n);assert.equal(r.disposeAfter.length,failed?0:n);assert.equal(r.bitmapBefore.length,scenario==='resize'?2:n);assert.equal(r.bitmapAfter.length,scenario==='resize'?2:n);assert.equal(r.restored,true);assert.ok(r.bitmapAfter.length>0);assert.ok(r.bitmapAfter.every(x=>x.width===0&&x.height===0&&x.closes===1));assert.ok(r.disposeAfter.every(x=>x===1));assert.ok(r.disposeBefore.every(x=>x===0));}
 for(const k of ['outputs','encodings','error','bitmapBefore','bitmapAfter','disposeBefore','disposeAfter'])assert.deepEqual(b[k],a[k],scenario+':'+k);
 if(['readFailure','abort'].includes(scenario)){assert.equal(b.outputs.length,0);assert.equal(b.error.name,scenario==='abort'?'AbortError':'Error');if(scenario==='readFailure')assert.equal(b.error.isInjected,true);assert.equal(a.reads,scenario==='abort'?0:1);assert.equal(b.reads,a.reads);continue}
 assert.equal(b.error,null);assert.equal(b.outputs.length,scenario==='multiple'?2:1);
 const expectedReads={unorm:[2,1],signed:[2,1],rgb:[1,1],resize:[2,1],multiple:[4,2],unknown:[0,0]}[scenario];assert.deepEqual([a.reads,b.reads],expectedReads);
 const width=scenario==='resize'?16:64,height=scenario==='resize'?8:32;assert.equal(a.allocatedBytes,a.reads*width*height*4);assert.equal(b.allocatedBytes,b.reads*width*height*4);
 for(const t of b.outputs){assert.equal(t.width,width);assert.equal(t.height,height);assert.equal(t.bytes,width*height*4);assert.match(t.rgba,/^[a-f0-9]{64}$/);assert.equal(t.anisotropy,4);assert.equal(t.dataTexture,!['rgb','unknown'].includes(scenario));}
 assert.deepEqual(b.encodings,scenario==='multiple'?['unorm-rg','signed-byte-rg']:[{resize:'unorm-rg',unorm:'unorm-rg',signed:'signed-byte-rg',rgb:'rgb',unknown:'unknown'}[scenario]]);
 if(scenario==='multiple')assert.notEqual(b.outputs[0].rgba,b.outputs[1].rgba,'Independent per-texture pixels');
 }
}

export function capturePageErrors(page, errors){
 assert.ok(Array.isArray(errors));
 page.on('pageerror',error=>errors.push({type:'pageerror',message:String(error.stack||error)}));
 page.on('console',message=>{if(message.type()==='error')errors.push({type:'console.error',message:message.text()});});
}
export function assertNoPageErrors(errors){assert.deepEqual(errors,[],'No asynchronous page or console errors');}
