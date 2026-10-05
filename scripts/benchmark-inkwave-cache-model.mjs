#!/usr/bin/env node
// Operations/bytes in an in-memory Cache API contract model. NEVER treat these as wire traffic/browser latency.
import fs from 'node:fs';import path from 'node:path';import {parse} from '../patches/loading-cache/vendor/acorn.mjs';
import {World,makeBuild,REV_B,sha} from '../patches/loading-cache/tests/worker-fixture.mjs';
const before=path.resolve(process.argv[2]);const after=path.resolve(process.argv[3]);const out=path.resolve(process.argv[4]||'reports/loading-cache/cache-model.json');
const rowData=root=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const revision=html.match(/<base href="\.\/_versions\/([a-f0-9]{64})\/">/)[1];const scripts=[...new Set([...html.matchAll(/<link rel="modulepreload" href="\.\/([^"]+)">/g)].map(m=>m[1]).concat([html.match(/<script type="module" src="\.\/([^"]+)"/)[1]]))];return{html,revision,scripts};};
const stamp=source=>{const node=parse(source,{ecmaVersion:'latest'}).body.find(n=>n.type==='VariableDeclaration'&&n.declarations[0].id.name==='BUILD').declarations[0].init;return JSON.parse(source.slice(node.start,node.end));};
const cacheBytes=world=>[...world.maps.values()].reduce((n,cache)=>n+[...cache.values()].reduce((m,row)=>m+row.body.length,0),0);
const drain=()=>new Promise(resolve=>setTimeout(resolve,20));
const series={};
for(const[label,root]of [['before',before],['after',after]]){
 const data=rowData(root),world=new World();world.route('./',data.html);world.route('index.html',data.html);const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const config=label==='after'?stamp(source):makeBuild(data.revision).config;
 if(label==='after')for(const rel of Object.keys(config.assets))world.route(`_versions/${data.revision}/${rel}`,fs.readFileSync(path.join(root,rel)));
 const workload=data.scripts.map(rel=>({rel,destination:'script'}));
 for(const rel of ['styles/ui.css','styles/hud.css','styles/mobile.css','patches/splatoon3/ui/gear.css'])if(fs.existsSync(path.join(root,rel)))workload.push({rel,destination:'style'});
 // Include all CSS rather than assuming the patch style filename.
 const css=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'inkwave-build.json'))).artifacts).filter(r=>r.endsWith('.css')&&!r.startsWith('_versions/'));
 for(const rel of css)if(!workload.some(r=>r.rel===rel))workload.push({rel,destination:'style'});
 for(const rel of fs.readdirSync(path.join(root,'assets/fonts')))workload.push({rel:'assets/fonts/'+rel,destination:'font'});
 workload.push({rel:'patches/splatoon3/profile.json',destination:''},{rel:'assets/lightmaps/tidewater.json',destination:''});
 const lightmap=JSON.parse(fs.readFileSync(path.join(root,'assets/lightmaps/tidewater.json')));
 workload.push({rel:'assets/lightmaps/tidewater.png',query:label==='before'?'?h='+lightmap.hash:'',destination:'image'});
 for(const item of workload){item.url=`_versions/${data.revision}/${item.rel}${item.query||''}`;world.route(item.url,fs.readFileSync(path.join(root,item.rel)));}
 const worker=world.worker({config},source);await worker.install();await worker.activate();await drain();
 const installedBytes=cacheBytes(world);const requestAll=async()=>{for(const item of workload)await(await worker.request(item.url,{destination:item.destination})).response.arrayBuffer();await drain();};
 await requestAll();const runs=[];
 for(let run=1;run<=3;run++){world.resetStats();await requestAll();runs.push({run,pageAssetRequests:workload.length,workerFetchCalls:world.fetches.length,cachePutCalls:world.puts.length,bytesCopiedToCache:world.puts.reduce((n,x)=>n+x.bytes,0),logicalStoredBodyBytes:cacheBytes(world),scriptFetchCalls:world.fetches.filter(r=>data.scripts.some(s=>r.url.endsWith('/'+s))).length});}
 series[label]={revision:data.revision,installedLogicalBodyBytes:installedBytes,workload,runs};
}
// Changed-file update simulation: real candidate payloads, deliberately synthetic revision/config.
const source=fs.readFileSync(path.join(after,'sw.js'),'utf8'),oldConfig=stamp(source);const w=new World();const oldBodies=Object.fromEntries(oldConfig.precache.map(rel=>[rel,fs.readFileSync(path.join(after,rel))]));
const old={config:oldConfig,index:fs.readFileSync(path.join(after,'index.html')),bodies:oldBodies};w.serve(old);const oldWorker=w.worker(old,source);await oldWorker.install();await oldWorker.activate();
const newBodies={...oldBodies,'src/main.js':Buffer.concat([oldBodies['src/main.js'],Buffer.from('\n// synthetic deployment fixture\n')])};const newBuild=makeBuild(REV_B,newBodies);w.serve(newBuild);w.resetStats();const newWorker=w.worker(newBuild);await newWorker.install();await newWorker.activate();
const update={kind:'synthetic changed-one-module version, real candidate core bytes; NOT a deployed source commit or native browser update',coreFiles:newBuild.config.precache.length,workerFetchCalls:w.fetches.length,cachePutCalls:w.puts.length,bytesCopiedToCache:w.puts.reduce((n,x)=>n+x.bytes,0),unchangedCoreFilesReused:newBuild.config.precache.length-1,logicalStoredBodyBytes:cacheBytes(w),cacheCount:[...w.maps.keys()].length};
const result={schema:1,measurementKind:'IN-MEMORY CONTRACT MODEL. HTTP cache, compression, native Cache Storage overhead, SW lifecycle scheduling, GPU and wire transfers are NOT modeled. Fetch call counts are not network transfers.',before:series.before,after:series.after,update};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({before:series.before.runs,after:series.after.runs,update},null,2));
