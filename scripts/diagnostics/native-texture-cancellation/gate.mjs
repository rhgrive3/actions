import assert from 'node:assert/strict';
export const scenarios=['normal','before','cache','decode','transferred'];
export function validateResults(rows){
 assert.equal(rows.length,10,'All paired cases');const seen=new Set();
 for(const r of rows){
  assert.ok(['baseline','candidate'].includes(r.variant));assert.ok(scenarios.includes(r.scenario));const key=r.variant+'/'+r.scenario;assert.ok(!seen.has(key),'Duplicate case');seen.add(key);
  assert.equal(r.restored,true);assert.deepEqual(r.cleanupErrors,[]);assert.deepEqual(r.nativeAPIs,{bitmap:true,texture:true,canvas:true,cache:true});
  const fixed=r.variant==='candidate',normal=r.scenario==='normal';
  const count=!fixed||normal?[8,8,8]:r.scenario==='before'?[0,0,0]:r.scenario==='cache'?[2,0,0]:r.scenario==='decode'?[2,2,0]:[2,2,1];
  assert.deepEqual([r.cacheCalls,r.createCalls,r.textureCount],count,key+' exact work counts');assert.equal(r.bitmapCount,count[1]);
  assert.equal(r.beforeCleanup.length,r.bitmapCount);assert.equal(r.afterCallerCleanup.length,r.bitmapCount);assert.equal(r.disposeCounts.length,r.textureCount);assert.equal(r.afterCallerDisposeCounts.length,r.textureCount);
  assert.equal(r.returned.length,normal?8:0);assert.deepEqual(r.error,normal?null:{name:'AbortError',message:'Aborted'});
  assert.equal(r.abortedAt,({normal:null,before:'before-load',cache:'two-native-cache-matches-started',decode:'two-native-decode-calls-started',transferred:'first-native-texture-update-before-synchronous-map-transfer'})[r.scenario]);
  for(let i=0;i<r.bitmapCount;i++){
   const b=r.beforeCleanup[i],after=r.afterCallerCleanup[i];assert.equal(b.id,i);assert.equal(after.id,i);assert.equal(b.closeCount,normal?0:1);assert.equal(b.drawable,normal);assert.equal(b.width,normal?16:0);assert.equal(b.height,normal?8:0);
   assert.equal(after.closeCount,1);assert.equal(after.drawable,false);assert.equal(after.width,0);assert.equal(after.height,0);
  }
  assert.ok(r.disposeCounts.every(n=>n===(normal?0:1)));assert.ok(r.afterCallerDisposeCounts.every(n=>n===1));
  assert.equal(r.closeEvents.length,normal?0:r.bitmapCount);for(let i=0;i<r.bitmapCount&&!normal;i++){const events=r.closeEvents.filter(e=>e.id===i);assert.equal(events.length,1);assert.deepEqual(events[0].before,[16,8]);assert.deepEqual(events[0].after,[0,0]);}
  if(normal){const files=new Set();for(const t of r.returned){assert.ok(/^texture[0-7]\.png$/.test(t.file));assert.ok(!files.has(t.file));files.add(t.file);const i=Number(t.file[7]),expected=[24+i*23,48+i*17,192-i*19,255];assert.deepEqual(t.pixel,expected);assert.deepEqual(t.expectedPixel,expected);assert.equal(t.width,16);assert.equal(t.height,8);assert.deepEqual(r.beforeCleanup[t.bitmap].pixel,expected);}}
 }
 return{cases:10,baselineCases:5,candidateCases:5,realBrowserRequired:true};
}

export function capturePageErrors(page, errors){
 assert.ok(Array.isArray(errors));
 page.on('pageerror',error=>errors.push({type:'pageerror',message:String(error.stack||error)}));
 page.on('console',message=>{if(message.type()==='error')errors.push({type:'console.error',message:message.text()});});
}
export function assertNoPageErrors(errors){assert.deepEqual(errors,[],'No asynchronous page or console errors');}
