#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from '/workspace/actions/node_modules/playwright/index.mjs';
import {nativeStageCatalog} from '/workspace/actions/scripts/lib/inkwave-native-stages.mjs';
const available=nativeStageCatalog().stages.map(s=>s.id),ids=(process.env.NATIVE_STAGE_IDS===undefined?'scorch,hagglefish,inkblot,mako,brinewater':process.env.NATIVE_STAGE_IDS).split(',').map(s=>s.trim());
assert(ids.length&&ids.every(Boolean),'Native lifecycle selection contains an empty id');
assert.equal(new Set(ids).size,ids.length,'Native lifecycle selection contains duplicate ids');
for(const id of ids)assert(available.includes(id),'Unknown playable native lifecycle stage: '+id);
const primary=ids[0],failureId=ids[1]||primary,lastId=ids[2]||primary,singleStage=ids.length===1;
const mobileIds=(process.env.NATIVE_MOBILE_STAGE_IDS===undefined?ids.join(','):process.env.NATIVE_MOBILE_STAGE_IDS).split(',').map(s=>s.trim());
assert(mobileIds.length&&mobileIds.every(Boolean),'Native mobile selection contains an empty id');
assert.equal(new Set(mobileIds).size,mobileIds.length,'Native mobile selection contains duplicate ids');
for(const id of mobileIds)assert(available.includes(id),'Unknown playable native mobile stage: '+id);
const site=path.resolve(process.argv[2]||'_site-native'),out=path.resolve(process.argv[3]||'.browser-evidence/native-lifecycle');fs.mkdirSync(out,{recursive:true});
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(site,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(site+'/')||!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const address='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[],result={status:'running',errors,scope:'Independent actual Game cancellation component: canonical concurrent world loads and all three world switches. Not full native-lifecycle or mobile acceptance.'};let diagnosticPage;const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));result.contentHash=manifest.contentHash;result.inputHash=manifest.inputHash;result.browser=browser.version();
try{
 const c=await browser.newContext({viewport:{width:960,height:640}}),p=await c.newPage();diagnosticPage=p;p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>console.log('requestfailed',r.url(),r.failure()?.errorText));
 await p.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0})));
 await p.goto(address+'/?map='+primary,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>globalThis.__G?.game?.menus&&globalThis.__G.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});assert.equal(await p.locator('#boot-error').textContent(),'');await p.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI));if(G!==globalThis.__G)throw Error('Native probe context owner mismatch');globalThis.NG=G;});
 await p.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;});console.log('lifecycle boot');
 result.cancellation=await p.evaluate(async({failureId,lastId,singleStage})=>{
  const G=NG,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI));
  if(singleStage){const {buildNativeWorld}=await import(new URL('patches/native-stages/runtime/engine.mjs',document.baseURI));const first=buildNativeWorld(g,MAPS.find(m=>m.id===failureId),()=>true),signal=g._nativeAbort.signal;await g._buildWorld(MAPS.find(m=>m.id==='tidewater'));await first;return {id:G.level.layout.id,nativeGroups:G.scene.children.filter(x=>x.name==='native-source-display').length,preparationCancelled:signal.aborted};}
  const first=g._buildWorld(MAPS.find(m=>m.id===failureId));const second=g._buildWorld(MAPS.find(m=>m.id===lastId));await Promise.all([first,second]);
  return {id:G.level.layout.id,nativeGroups:G.scene.children.filter(x=>x.name==='native-source-display').length};
 },{failureId,lastId,singleStage});assert.equal(result.cancellation.id,singleStage?'tidewater':lastId);assert.equal(result.cancellation.nativeGroups,singleStage?0:1);if(singleStage)assert.equal(result.cancellation.preparationCancelled,true);console.log('cancel passed');fs.writeFileSync(path.join(out,'component.json'),JSON.stringify(result,null,2));
 result.switches=[];
 for(const id of ['tidewater',primary,'tidewater']){
  const s=await p.evaluate(async id=>{const G=NG,g=G.game,{MAPS}=await import(new URL('src/config.js',document.baseURI));await g._buildWorld(MAPS.find(m=>m.id===id));G.renderer.render(G.scene,G.camera);G.renderer.getContext().finish();return {id:G.level.layout.id,native:!!G.level.native,nativeGroups:G.scene.children.filter(x=>x.name==='native-source-display').length,memory:{...G.renderer.info.memory}};},id);result.switches.push(s);assert.equal(s.id,id);assert.equal(s.nativeGroups,id===primary?1:0);assert.equal(s.native,id===primary);console.log('switch passed '+id);fs.writeFileSync(path.join(out,'component.json'),JSON.stringify(result,null,2));
 }
 // Explicitly verify mismatched geometry AND runtime fingerprints reject.
 result.fingerprint=await p.evaluate(async primary=>{const registry=await import(new URL('patches/native-stages/runtime/registry.mjs',document.baseURI)),value=registry.nativeStageFingerprint(primary);return {same:registry.nativeStageCompatible({map:primary,nativeStage:value}),changed:registry.nativeStageCompatible({map:primary,nativeStage:value+'-changed'}),missing:registry.nativeStageCompatible({map:primary})};},primary);assert.deepEqual(result.fingerprint,{same:true,changed:false,missing:false});

 assert.equal(result.switches.length,3);assert.equal(errors.length,0,JSON.stringify(errors));
 result.status='passed';await p.screenshot({path:path.join(out,'final-world.png'),timeout:60000});
}catch(error){result.status='failed';result.error=error.stack;
 if(diagnosticPage){result.diagnostic=await diagnosticPage.evaluate(()=>({url:location.href,bootError:document.getElementById('boot-error')?.textContent,mode:globalThis.__G?.mode,map:globalThis.__G?.level?.layout?.id})).catch(e=>({error:String(e)}));await diagnosticPage.screenshot({path:path.join(out,'failure.png'),timeout:60000}).catch(()=>{});}
 process.exitCode=1;
}finally{fs.writeFileSync(path.join(out,'component.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();await new Promise(r=>server.close(r));}
