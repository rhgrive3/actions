#!/usr/bin/env node
// Isolated V8 SourceTextModule construction / JSON.parse benchmark, NOT browser parse/execute or device performance.
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import vm from 'node:vm';import {spawnSync} from 'node:child_process';import {performance} from 'node:perf_hooks';
const root=path.resolve(process.argv[2]||'_site');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const list=[...new Set([...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(m=>m[1]).concat([html.match(/<script type="module" src="\.\/([^"]+)"/)?.[1]]).filter(Boolean))];
if(process.argv.includes('--child')){
 const sources=list.map(file=>({file,source:fs.readFileSync(path.join(root,file),'utf8')}));const context=vm.createContext({});const rows=[];const held=[];
 const heapBefore=process.memoryUsage().heapUsed;
 for(const{file,source}of sources){const start=performance.now();held.push(new vm.SourceTextModule(source,{context,identifier:file}));rows.push({file,bytes:Buffer.byteLength(source),moduleConstructionMs:performance.now()-start});}
 const profile=fs.readFileSync(path.join(root,'patches/splatoon3/profile.json'),'utf8');const t=performance.now();for(let i=0;i<100;i++)JSON.parse(profile);const jsonMsPerParse=(performance.now()-t)/100;
 console.log(JSON.stringify({modules:rows,totalModuleConstructionMs:rows.reduce((n,r)=>n+r.moduleConstructionMs,0),jsonMsPerParse,heapDelta:process.memoryUsage().heapUsed-heapBefore}));
}else{
 const out=path.resolve(process.argv[3]||'reports/loading-cache/cpu.json');const count=Number(process.argv[4]||5);if(!Number.isInteger(count)||count<3||count>30)throw Error('Use 3..30 runs');
 const runs=[];for(let i=0;i<count;i++){
  const p=spawnSync(process.execPath,['--experimental-vm-modules',new URL(import.meta.url).pathname,root,'--child'],{encoding:'utf8',timeout:45000});if(p.status!==0)throw Error(p.stderr);runs.push(JSON.parse(p.stdout));
 }
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const inputHashes=Object.fromEntries(list.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
 const result={schema:1,revision:html.match(/<base href="\.\/_versions\/([a-f0-9]{64})\/">/)?.[1]||null,inputHashes,kind:'ISOLATED NODE MICROBENCHMARK: constructs ESM objects; no linking, evaluation, browser code cache, JS execution, shader compilation or GPU',node:process.version,v8:process.versions.v8,platform:process.platform,arch:process.arch,runCount:count,moduleCount:list.length,medianModuleConstructionMs:median(runs.map(x=>x.totalModuleConstructionMs)),medianProfileJSONParseMs:median(runs.map(x=>x.jsonMsPerParse)),runs};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,runs:undefined,inputHashes:undefined},null,2));
}
