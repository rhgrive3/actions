import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const [beforePath,afterPath,out]=process.argv.slice(2);if(!out)throw Error('Usage: before-records.json after-records.json summary.json');
const read=p=>JSON.parse(fs.readFileSync(p)),before=read(beforePath),after=read(afterPath),sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
assert.equal(before.errors.length,0);assert.equal(after.errors.length,0);assert.equal(before.cases.length,24);assert.equal(after.cases.length,24);
const rows=[];
for(let i=0;i<before.cases.length;i++){
 const b=before.cases[i],a=after.cases[i],key=x=>`${x.id}/${x.mode}/${x.hz}`;assert.equal(key(b),key(a));
 for(const field of ['trace','events','paint','grid','counts'])assert.deepEqual(a[field],b[field],key(a)+' '+field+' changed');
 assert(a.events.length>0,key(a)+' did not fire');assert(a.paint.length>0,key(a)+' did not paint');assert(a.trace.length===240,key(a)+' step count');
 if(a.mode==='moving-jump')assert(a.trace.some(t=>!t.ground)&&a.trace.some(t=>Math.abs(t.pos[0])>.05),key(a)+' did not move/jump');
 rows.push({case:key(a),steps:a.trace.length,shots:a.events.length,paintWrites:a.paint.length,counts:a.counts,gameplaySHA256:sha(a.trace),birthEventsSHA256:sha(a.events),paintWritesSHA256:sha(a.paint),paintGridSHA256:sha(a.grid),before:{resources:b.resources,render:b.render,peakBlobs:b.peakBlobs,peakFxDrops:b.peakDrops},after:{resources:a.resources,render:a.render,peakBlobs:a.peakBlobs,peakFxDrops:a.peakDrops,retirement:a.last}});
}
const cadenceDifferences=[];
for(const prefix of [...new Set(rows.map(r=>r.case.replace(/\/\d+$/,'')))]){
 const group=rows.filter(r=>r.case.startsWith(prefix+'/'));for(const field of ['gameplaySHA256','birthEventsSHA256','paintWritesSHA256','paintGridSHA256'])if(new Set(group.map(r=>r[field])).size!==1)cadenceDifferences.push({case:prefix,field,status:'present in baseline and identically preserved in candidate; native birth origin differs at120Hz in this harness; cause not isolated'});
}
const summary={status:'pass',measurement:'real Chromium emitted-component Actor/Character/Physics/FX and CPU PaintSystem, fixed60 simulation, 30/60/120 display; not full Game/native camera or hardware/retail acceptance',cadenceDifferences,cases:rows.length,simulationSteps:rows.reduce((n,r)=>n+r.steps,0),beforeContentHash:before.build.contentHash,afterContentHash:after.build.contentHash,beforeRawSHA256:crypto.createHash('sha256').update(fs.readFileSync(beforePath)).digest('hex'),afterRawSHA256:crypto.createHash('sha256').update(fs.readFileSync(afterPath)).digest('hex'),rows};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({status:summary.status,cases:summary.cases,simulationSteps:summary.simulationSteps}));
