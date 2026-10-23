// Compare an untouched baseline build/run with the candidate; no network access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const [baseSite, candidateSite, baseRun, candidateRun, output] = process.argv.slice(2).map(p=>path.resolve(p));
const read=p=>JSON.parse(fs.readFileSync(p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseSha='a4e81347906c0d60ceef76a69f476261bf8d3f86';
const manifests=[baseSite,candidateSite].map(site=>{
 const m=read(path.join(site,'inkwave-build.json'));
 assert.equal(hash(JSON.stringify(m.artifacts)),m.contentHash);
 for(const [file,expected] of Object.entries(m.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),expected,file);
 return m;
});
const [before,after]=manifests;
assert.equal(before.files['patch/runtime/special-motion.mjs'],hash(execFileSync('git',['show',baseSha+':patches/splatoon3/runtime/special-motion.mjs'])),'original implementation restored in the negative control');
const changed=[...new Set([...Object.keys(before.files),...Object.keys(after.files)])].filter(k=>before.files[k]!==after.files[k]).sort();
assert.deepEqual(changed,['patch/runtime/special-motion.mjs','patch/runtime/storm-boundary.mjs']);
for(const file of ['special-motion.mjs','storm-boundary.mjs'])assert.equal(after.files['patch/runtime/'+file],hash(fs.readFileSync('patches/splatoon3/runtime/'+file)));
const [b,c]=[baseRun,candidateRun].map(p=>read(path.join(p,'probe.json')));
for(const r of [b,c]){assert.deepEqual(r.errors,[]);assert.equal(r.error,undefined);}
assert.equal(b.identity,before.contentHash);assert.equal(c.identity,after.contentHash);
const gameplay=f=>{const {calls,triangles,cloud,...rest}=f;if(cloud){const {boundary,vertices,...state}=cloud;rest.cloud=state;}else rest.cloud=null;return rest;};
assert.equal(b.frames.length,c.frames.length);
for(let i=0;i<b.frames.length;i++)assert.deepEqual(gameplay(b.frames[i]),gameplay(c.frames[i]),'sampled simulation state '+b.frames[i].frame);
assert.ok(b.frames.every(f=>!f.cloud?.boundary));
assert.ok(c.frames.some(f=>f.cloud?.boundary));
assert.ok(!c.frames.at(-1).cloud);
// A candidate requirement must reject the unchanged original, not silently pass.
const boundaryRequirement=run=>assert.ok(run.frames.some(f=>f.cloud?.boundary),'moving surface boundary required');
assert.throws(()=>boundaryRequirement(b));boundaryRequirement(c);
assert.ok(c.visibilityControl.pixels>100&&c.visibilityControl.pixels<960*640/5,'isolated contour changes a small part of the frozen normal game frame');
const rateRows=[];
for(let i=0;i<3;i++){
 const x=b.rates[i],y=c.rates[i];assert.equal(x.hz,y.hz);assert.equal(x.traceHash,y.traceHash);assert.equal(x.paintHash,y.paintHash);
 assert.equal(y.ticks,123);assert.ok(y.boundary&&y.survivesDeath&&y.cleared);assert.deepEqual(y.boundaryCenter,y.final.cloud.pos);
 assert.deepEqual(y.final,c.rates[0].final);assert.equal(y.paintHash,c.rates[0].paintHash);
 rateRows.push({hz:y.hz,ticks:y.ticks,traceHash:y.traceHash,paintHash:y.paintHash,deathAndClear:true});
}
const summary={status:'passed',baseSha,baseTree:'34236683e6776aac9d8b1d4ae0b8a1b31d3f2df2',changedInputs:changed,
 baselineContentHash:before.contentHash,candidateContentHash:after.contentHash,candidateSources:Object.fromEntries(Object.entries(after.files).filter(([k])=>changed.includes(k))),
 artifactHashesVerified:true,negativeControlRejected:true,normalFrameGameplayEqual:true,rateRows,visibilityControl:c.visibilityControl,
 drawDelta:c.frames.filter(f=>f.cloud).map(f=>({simulationFrame:f.frame,calls:f.calls-b.frames.find(b=>b.frame===f.frame).calls,triangles:f.triangles-b.frames.find(b=>b.frame===f.frame).triangles})),
 limitations:['No direct Nintendo clip access; parent observation of encoded 30fps f173–183 is the comparison target.','Normal-game captures use the procedural practice range, not a retail or native-source stage.','Rates are render delivery schedules with the same fixed 60Hz simulation. Ray counts include presentation queries and are not equal-work timings.','Warm renderer timings use Chromium SwiftShader in one context; mobile/hardware and large native stages are unmeasured.']};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
