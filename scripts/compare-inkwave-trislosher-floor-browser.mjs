// Compare independent immutable build runs, including actual physical traces.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [beforeDir,afterDir,output]=process.argv.slice(2);
const read=(dir,file)=>JSON.parse(fs.readFileSync(path.join(dir,file)));
const before=read(beforeDir,'browser.json'),after=read(afterDir,'browser.json');
assert.equal(before.status,'passed');assert.equal(after.status,'passed');
assert.equal(before.cases.length,10);assert.equal(after.cases.length,10);
const rows=[];
for(let i=0;i<before.cases.length;i++){
  const b=before.cases[i],a=after.cases[i];
  assert.equal(a.name,b.name);
  for(const key of ['config','camera','sourceMotion','traceSha256','stampsSha256','gridSha256','cells','peakDrops','peakMain','peakBlobs','matrixSamples'])
    assert.deepEqual(a[key],b[key],a.name+': unchanged '+key);
  const bd=read(beforeDir,b.name+'.json'),ad=read(afterDir,a.name+'.json');
  for(const key of ['trace','stamps'])assert.deepEqual(ad[key],bd[key],a.name+': exact physical '+key);
  assert.equal(ad.matrices.length,bd.matrices.length);
  for(let n=0;n<ad.matrices.length;n++){
    const x=ad.matrices[n],y=bd.matrices[n];
    assert.equal(x.source,'WeaponSlosherDiffusion');
    for(const key of ['tick','frames','physicalVelocity','drawRadius'])assert.deepEqual(x[key],y[key]);
    for(let k=0;k<3;k++)assert(Math.abs(x.scale[k]*2-y.scale[k])<1e-6,'actual half-width instance');
    assert(Math.abs(x.direction[1])<1e-6,'actual forward-facing instance');
    if(y.frames>0)assert(y.direction[1]<-.9999,'old gravity-facing instance');
  }
  rows.push({name:a.name,physicalTraceEqual:true,paintStampsEqual:true,cpuGridEqual:true,instanceRatio:.5,matrices:ad.matrices.length,
    peakMain:a.peakMain,peakDrops:a.peakDrops,peakBlobs:a.peakBlobs,cells:a.cells,beforeCpu:b.cpu,afterCpu:a.cpu});
}
for(const pitch of [-20,0,20]){
  const matches=after.cases.filter(c=>c.config.moving&&c.config.pitch===pitch);
  for(const row of matches)for(const key of ['traceSha256','stampsSha256','gridSha256'])assert.equal(row[key],matches[0][key],'30/60/120Hz identical '+key);
}
const result={status:'passed',beforeContentHash:before.contentHash,afterContentHash:after.contentHash,cases:rows,
  timing:'Each trace tick is a 60Hz INKWAVE simulation step. WebGL screenshots are sampled at nine common simulation ticks, not a continuous-video frame-rate acceptance.',
  limits:'CPU totals are software Chromium observations including warmup noise, not device GPU benchmarks. No matching retail footage or encoded native-frame comparison.'};
fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
