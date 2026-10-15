#!/usr/bin/env node
// Component CPU comparison using the exact BotBrain._wet queries recorded by
// measure-inkwave-native-ground.mjs. Both variants use separate identical VM
// fixtures and the same pinned Scorch source geometry. No rendering/FPS claim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {SOURCE_STAGES} from '../patches/native-stages/runtime/source-catalog.mjs';
import {convertSource} from '../patches/native-stages/runtime/source-convert.mjs';
const args=process.argv.slice(2),get=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
if(process.env.INKWAVE_BUILT_SITE)throw Error('This component comparison uses exact source fixtures; use the full replay for built artifacts.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.resolve(get('--source-dir',root+'/.codex-stage-sources/scorch-source'));
const input=fs.readFileSync(get('--queries')),queries=JSON.parse(input),stage=SOURCE_STAGES.find(s=>s.id==='scorch'),obj=fs.readFileSync(dir+'/Vss_Yunohana.obj'),mtl=fs.readFileSync(dir+'/Vss_Yunohana.mtl'),tree=JSON.parse(fs.readFileSync(dir+'/tree.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(sha(obj)!==stage.sourceSha256||tree.sha!==stage.tree||tree.truncated)throw Error('Source identity mismatch');
const files={};for(const row of tree.tree)if(row.type==='blob')files[row.path]={bytes:row.size,gitSha1:row.sha};
if(crypto.createHash('sha1').update('blob '+mtl.length+'\0').update(mtl).digest('hex')!==files['Vss_Yunohana.mtl'].gitSha1)throw Error('MTL identity mismatch');
const data=convertSource(stage,obj.toString(),mtl.toString(),files),worlds={};
for(const variant of ['before','after']){
 const old=new Map();if(variant==='before')for(const n of ['native-level','triangle-world'])old.set(`patches/native-stages/runtime/${n}.mjs`,fs.readFileSync(root+`/patches/native-stages/tests/fixtures/${n}-e57.mjs.txt`,'utf8'));
 const f=await fixture({productionComposition:true,adaptRuntime:(rel,s)=>adaptBuildSource(rel,old.get(rel)||s),extraExports:"export {NativeLevel} from './patches/native-stages/runtime/engine.mjs';"});
 worlds[variant]=new f.NativeLevel(data);
}
const run=(variant,loops,verify=false)=>{
 const level=worlds[variant];let supported=0;
 for(let n=0;n<loops;n++)for(const [x,z,yMax,minimumY,wet] of queries){
  let result;if(variant==='before'){const y=level.groundHeight(x,z,yMax);result=y!==-Infinity&&!(y<minimumY);}else result=level.hasGroundAbove(x,z,yMax,minimumY);
  if(verify&&result===wet)throw Error('Ground predicate mismatch');supported+=result?1:0;
 }
 return supported;
};
for(const v of ['before','after','after','before'])run(v,2,true);
const results=[];for(const variant of ['before','after','after','before','before','after','after','before']){
 const w=worlds[variant].triangleWorld,beforeTriangles=w.triangleTests,beforeRays=w.queryCount,cpu0=process.cpuUsage(),start=performance.now(),supported=run(variant,10),ms=performance.now()-start,cpu=process.cpuUsage(cpu0);
 results.push({variant,ms,cpu,supported,queries:w.queryCount-beforeRays,triangleTests:w.triangleTests-beforeTriangles});
}
const result={schema:1,component:'BotBrain native water-guard support queries',sourceSha256:stage.sourceSha256,inputSha256:sha(input),inputQueries:queries.length,loops:10,environment:{node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},results,limits:['Native CPU component in Node, not whole-game/browser/device FPS.','Shared executor load may affect wall times; process CPU includes V8 helper threads.','Both before and after execute all captured query inputs without visibility caching.']};
const out=get('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
