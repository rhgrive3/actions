import assert from 'node:assert/strict';
export function plan(mode){
 assert.ok(['source','emitted'].includes(mode),'mode');
 return [{variant:'old',extreme:false},{variant:'new',extreme:false},{variant:'new',extreme:true},{variant:'old',extreme:true}];
}
export function parseTap(text,extreme){
 const count=extreme?2:3;
 for(const [key,value]of Object.entries({tests:count,pass:count,fail:0,cancelled:0,skipped:0,todo:0})){
  const hits=[...text.matchAll(new RegExp('^# '+key+' (\\d+)\\s*$','gm'))];
  assert.equal(hits.length,1,'one TAP total '+key);assert.equal(Number(hits[0][1]),value,key);
 }
 const rows=text.split(/\r?\n/).filter(x=>x.startsWith('# {')).map(x=>JSON.parse(x.slice(2)));
 assert.equal(rows.length,count*4,'every team has detailed and lifecycle receipts');
 const keys=new Set();
 for(const weapon of (extreme?['shooter','roller']:['shooter','roller','dualies']))for(const team of [0,1]){
  const detailed=rows.filter(x=>x.weapon===weapon&&x.team===team&&x.sourceReceipt);
  assert.equal(detailed.length,1,'unique detailed receipt');
  const r=detailed[0];assert.equal(r.extremeAim,extreme);
  assert.equal(r.sourceReceipt.requested,true);assert.equal(r.sourceReceipt.status,'ready');assert.equal(r.sourceReceipt.activeAfterFrame,true);
  assert.ok(r.counts.head>0&&r.counts.chest>0);
  assert.deepEqual(r.maxInside,{head:0,chest:0});
  assert.ok(r.faceChecks.length>=(extreme?6:4)&&r.faceChecks.length<=6);
  for(const f of r.faceChecks){assert.equal(f.fishFaces,608);assert.equal(f.intersections,0);assert.ok(f.skinFaces>0);}
  const life=rows.filter(x=>x.weapon===weapon&&x.team===team&&'ticks'in x);
  assert.equal(life.length,1);assert.equal(life[0].ticks,extreme?6:90);
  for(const k of ['handAttachment','restored'])assert.equal(life[0][k],true);
  for(const k of ['geometryDispose','materialDispose'])assert.equal(life[0][k],1);
  for(const row of [r,life[0]]){const key=weapon+'/'+team+'/'+('ticks'in row?'life':'detail');assert.ok(!keys.has(key));keys.add(key);}
 }
 return rows;
}
export function compare(oldRows,newRows){assert.deepEqual(newRows,oldRows,'full ordered receipts, not just pass status');}
