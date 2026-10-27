import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import{createRequire}from'node:module';
import{catalogAudioGraph,catalogChargeWorker}from'/workspace/inkwave-ci-reconcile-1ab0/scripts/lib/inkwave-catalog-audio.mjs';
import{catalogBombFxGraph}from'/workspace/inkwave-ci-reconcile-1ab0/scripts/lib/inkwave-catalog-fx-graph.mjs';
import{validateCatalogAudioGraphResult,validateCatalogBombFxGraphResult,validateCatalogReceipts}from'/workspace/inkwave-ci-reconcile-1ab0/scripts/check-inkwave-motion-catalog.mjs';
const{chromium}=createRequire('/workspace/actions/package.json')('playwright');
const site='/workspace/scratch/integration-reviewed-batch-site',out='/workspace/scratch/ci-reconcile-1ab0',m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const entry=Object.keys(m.artifacts).find(f=>f.endsWith('/src/fx/fxHooks.js')),prefix='/'+entry.slice(0,entry.indexOf('/src/'))+'/';
if(m.contentHash!=='af180bade0c09f1c0b32a8eab99016aa5f697991a32a7cd8ccb076cf3311ae84')throw Error('Expected exact unchanged1ab/907 runtime');
const r={status:'running',sourceSha:'76a6d01d9',runtime:'1ab0f4d3f952e80b23df862820549e68dba9e8c2 byte-identical907',contentHash:m.contentHash,kind:'isolated emitted native method/Worker graph; not native input, gameplay render or playback',chromiumSandbox:true,errors:[]},loaded=new Map();
const server=http.createServer((req,res)=>{if(req.url==='/qa'){res.setHeader('content-type','text/html');res.end('<!doctype html><script type="importmap">'+JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})+'</script><title>Bounded native FX graph</title>');return;}const file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const deadline=setTimeout(()=>void browser?.close(),90000);
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings']});r.browser=browser.version();const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>r.errors.push(e.message));
 await context.route('http://127.0.0.1:'+server.address().port+'/**',async route=>{try{const response=await route.fetch(),bytes=await response.body(),file=new URL(response.url()).pathname.slice(1);if(file!=='qa'){if(response.status()!==200||hash(bytes)!==m.artifacts[file])throw Error('HTTP/hash mismatch '+file);loaded.set(file,{file,sha256:hash(bytes),bytes:bytes.length,status:response.status()});}await route.fulfill({response,body:bytes});}catch(e){r.errors.push(e.message);await route.abort();}});
 await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
 await page.addScriptTag({content:'globalThis.catalogAudioGraph='+catalogAudioGraph.toString()+';globalThis.catalogChargeWorker='+catalogChargeWorker.toString()+';globalThis.catalogBombFxGraph='+catalogBombFxGraph.toString()+';'});
 r.audioGraph=await page.evaluate(async prefix=>{const graph=await catalogAudioGraph(prefix);graph.prewarmWorkers.push(await catalogChargeWorker(prefix));return graph;},prefix);
 r.bombFxGraph=await page.evaluate(async prefix=>{
  const THREE=await import('three'),profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
  const {G,Actor,Character,Projectiles}=install(profile),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,2,0);
  Object.assign(G,{scene,camera,actors:[],time:0,teamColors:[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')],level:{},paint:{sample:()=>1,splat:()=>0}});
  const projectiles=G.projectiles=new Projectiles(scene),actor=new Actor({team:0,name:'catalog FX birth',weapon:'shooter',isLocal:true,CharacterClass:Character});actor.pos.copy(camera.position);
  const primitives=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v===null||['number','string','boolean'].includes(typeof v)));
  const snapshot=()=>JSON.stringify({time:G.time,actor:primitives(actor),runner:primitives(actor.weaponRunner),pos:actor.pos.toArray(),vel:actor.vel.toArray(),intent:actor.intent,projectiles:primitives(projectiles),bombs:projectiles.bombs.map(b=>({clocks:primitives(b),pos:b.pos.toArray(),vel:b.vel.toArray(),resolved:b.s3Resolved}))});
  try{if(actor.character._sourceMotionLoader)await actor.character._sourceMotionLoader;return await catalogBombFxGraph(prefix,G,projectiles,actor,snapshot);}
  finally{projectiles.clear();actor.character.dispose();}
 },prefix);
 r.loaded=[...loaded.values()];validateCatalogAudioGraphResult({artifacts:m.artifacts,loaded:r.loaded,audioGraph:r.audioGraph});validateCatalogBombFxGraphResult({artifacts:m.artifacts,loaded:r.loaded,bombFxGraph:r.bombFxGraph});
 const original=JSON.parse(fs.readFileSync('/workspace/scratch/catalog-full-af41c627/evidence/motion-catalog-result.json'));
 r.replay={path:'/workspace/scratch/catalog-full-af41c627/evidence/motion-catalog-result.json',sha256:hash(fs.readFileSync('/workspace/scratch/catalog-full-af41c627/evidence/motion-catalog-result.json')),originalStatus:original.status,originalModules:original.loaded.length};
 const required=Object.keys(m.artifacts).filter(f=>f.startsWith('_versions/')&&/\/patches\/splatoon3\/runtime\/.*\.mjs$/.test(f)&&!f.endsWith('/death-camera.mjs')&&!f.endsWith('/audio/render-worker.mjs'));
 const oldSet=new Set(original.loaded.map(x=>x.file));r.replay.required=required.length;r.replay.missingBefore=required.filter(f=>!oldSet.has(f));
 const union=new Map(original.loaded.map(x=>[x.file,x]));for(const row of r.loaded)union.set(row.file,row);r.replay.missingAfter=required.filter(f=>!union.has(f));validateCatalogReceipts(m,[...union.values()]);r.replay.receiptUnion='passed immutable bytes/required installed graph; distinct bounded invocation, no render rerun';
 const diagnostic=JSON.parse(fs.readFileSync('/workspace/scratch/catalog-full-af41c627/evidence/motion-catalog-diagnostic.json'));r.replay.fullDiagnosticPresent={data:diagnostic.data.length,images:diagnostic.images.length,audioGraph:!!diagnostic.audioGraph};
 if(r.errors.length||r.replay.missingBefore.length!==1||!r.replay.missingBefore[0].endsWith('/bomb-cues.mjs')||r.replay.missingAfter.length)throw Error('Graph/receipt acceptance failed');r.status='passed';
 console.log(JSON.stringify({status:r.status,workers:r.audioGraph.prewarmWorkers,bombFxGraph:r.bombFxGraph,loaded:r.loaded.length,replay:r.replay}));
}catch(e){r.status='failed';r.error=e.stack;console.error(e.stack);process.exitCode=1;}
finally{clearTimeout(deadline);await browser?.close();await new Promise(resolve=>server.close(resolve));r.closed=true;fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(r,null,2)+'\n');}
