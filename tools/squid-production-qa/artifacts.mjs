import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export const ARTIFACT_PARTITIONS=[
 {name:'baseline',frames:404,roots:['.qa-evidence/squid-baseline','.qa-evidence/squid-motion-baseline','_squid_baseline/_site/inkwave-build.json']},
 {name:'candidate',frames:404,roots:['.qa-evidence/squid-candidate','.qa-evidence/squid-motion-sampled','_site/inkwave-build.json']},
 {name:'spawn',frames:120,roots:['.qa-evidence/squid-spawn']},
];
// Conservative raw-byte budget leaves ZIP metadata headroom below the512MiB reader limit.
export const MAX_PARTITION_BYTES=500*1024*1024;
export function assertWorkflowLayout(source,partitions=ARTIFACT_PARTITIONS){
 const blocks=source.split('      - uses: actions/upload-artifact@v4').slice(1);
 assert.equal(blocks.length,partitions.length,'one upload per partition');
 const seen=new Set();
 blocks.forEach((block,i)=>{
  const p=partitions[i];assert(block.includes('name: squid-native-'+p.name+'-${{ github.event.pull_request.head.sha || github.sha }}'),'exact-head partition name');
  assert.match(block,/if: always\(\)/);assert.match(block,/include-hidden-files: true/);assert.match(block,/if-no-files-found: error/);assert.match(block,/retention-days: 14/);
  const actual=block.match(/          path: \|\n([\s\S]*?)          include-hidden-files:/)[1].trim().split('\n').map(x=>x.trim());
  assert.deepEqual(actual,p.roots.map(x=>x.endsWith('.json')?x:x+'/**'),'complete partition paths');
  for(const r of p.roots){assert(!seen.has(r),'duplicate partition root');seen.add(r);}
 });
}
export function inspectPartitions(root,partitions=ARTIFACT_PARTITIONS){
 const seen=new Set(),rows=[];const walk=p=>fs.statSync(p).isDirectory()?fs.readdirSync(p).flatMap(n=>walk(path.join(p,n))):[p];
 for(const partition of partitions){
  const files=partition.roots.flatMap(r=>walk(path.resolve(root,r)));let bytes=0,frames=0;
  for(const file of files){assert(!seen.has(file),'duplicate evidence file');seen.add(file);bytes+=fs.statSync(file).size;if(file.endsWith('.png'))frames++;}
  assert.equal(frames,partition.frames,'complete PNG denominator '+partition.name);assert(bytes<MAX_PARTITION_BYTES,'partition exceeds safe download budget '+partition.name);
  for(const r of partition.roots.filter(x=>!x.endsWith('.json')))assert(fs.existsSync(path.resolve(root,r,'result.json')),'suite receipt '+r);
  rows.push({name:partition.name,frames,bytes,files:files.map(f=>path.relative(root,f)).sort()});
 }
 assert.equal(rows.reduce((n,r)=>n+r.frames,0),928,'all original native frames');return rows;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assertWorkflowLayout(fs.readFileSync('.github/workflows/inkwave-squid-visual-qa.yml','utf8'));
 console.log('SQUID_ARTIFACT_PARTITIONS '+JSON.stringify(inspectPartitions(process.cwd())));
}
