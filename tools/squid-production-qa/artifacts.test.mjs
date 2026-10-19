import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ARTIFACT_PARTITIONS,MAX_PARTITION_BYTES,assertWorkflowLayout,inspectPartitions} from './artifacts.mjs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-squid-visual-qa.yml',import.meta.url),'utf8');
test('three exact-head bundles preserve928 PNGs and every suite/manifest once',()=>{
 assert.deepEqual(ARTIFACT_PARTITIONS.map(p=>[p.name,p.frames]),[['baseline',404],['candidate',404],['spawn',120]]);
 assert.deepEqual(ARTIFACT_PARTITIONS.flatMap(p=>p.roots),['.qa-evidence/squid-baseline','.qa-evidence/squid-motion-baseline','_squid_baseline/_site/inkwave-build.json','.qa-evidence/squid-candidate','.qa-evidence/squid-motion-sampled','_site/inkwave-build.json','.qa-evidence/squid-spawn']);
 assertWorkflowLayout(workflow);assert.equal(MAX_PARTITION_BYTES,500*1024*1024);
 for(const altered of [workflow.replace('            .qa-evidence/squid-spawn/**\n',''),workflow.replace('            .qa-evidence/squid-spawn/**','            .qa-evidence/squid-motion-sampled/**'),workflow.replace('include-hidden-files: true','include-hidden-files: false'),workflow.replace('if: always()','if: success()')])assert.throws(()=>assertWorkflowLayout(altered));
});
test('inventory rejects lost, duplicated and oversized evidence without changing PNG bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'squid-partitions-'));
 for(const p of ARTIFACT_PARTITIONS){for(const rel of p.roots){const target=path.join(root,rel);if(rel.endsWith('.json')){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'{}');}else{fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'result.json'),'{}');}}
  for(let i=0;i<p.frames;i++)fs.writeFileSync(path.join(root,p.roots[0],i+'.png'),'actual bytes stand-in');}
 assert.equal(inspectPartitions(root).reduce((n,p)=>n+p.frames,0),928);
 const file=path.join(root,ARTIFACT_PARTITIONS[0].roots[0],'0.png');fs.renameSync(file,file+'.held');assert.throws(()=>inspectPartitions(root),/denominator/);fs.renameSync(file+'.held',file);
 const duplicate=structuredClone(ARTIFACT_PARTITIONS);duplicate[0].roots.push(duplicate[0].roots[0]);assert.throws(()=>inspectPartitions(root,duplicate),/duplicate/);
 const large=path.join(root,ARTIFACT_PARTITIONS[2].roots[0],'oversize.bin');fs.closeSync(fs.openSync(large,'w'));fs.truncateSync(large,MAX_PARTITION_BYTES);assert.throws(()=>inspectPartitions(root),/budget/);
});
