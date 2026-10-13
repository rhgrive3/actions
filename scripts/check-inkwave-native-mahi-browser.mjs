#!/usr/bin/env node
// Real Chromium admission checks and original-buffer/MTL/PNG verification.
// This blocked source has no playable placement, so no match/FPS claim is made.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const repo=path.resolve(import.meta.dirname,'..'),site=path.resolve(process.argv[2]||'_site-native-mahi');
const source=path.resolve(process.argv[3]||'.codex-stage-sources/originals/Vss_Hiagari04');
const out=path.resolve(process.argv[4]||'.browser-evidence/mahi/browser');
const definition=JSON.parse(fs.readFileSync(path.join(repo,'patches/native-stages/definitions/mahi.json')));
const identity=JSON.parse(fs.readFileSync(path.join(source,'../mahi-source-identity.json')));
const buffers=path.join(repo,'.codex-stage-sources/chromium-parser/mahi');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(buffers,{recursive:true});
assert(!fs.existsSync(path.join(site,'_native-reference-assets')),'Public build contains source payload');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(req.method==='POST'&&/^\/__mahi-buffer\/(vertices|indices)\.bin$/.test(pathname)){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);fs.writeFileSync(path.join(buffers,path.basename(pathname)),Buffer.concat(chunks));res.writeHead(204);res.end();return;
  }
  let file,root;
  if(pathname.startsWith('/__mahi-source/')){root=source;file=path.resolve(root,pathname.slice('/__mahi-source/'.length));}
  else if(pathname.startsWith('/__mahi-runtime/')){root=path.join(repo,'patches/native-stages/runtime');file=path.resolve(root,pathname.slice('/__mahi-runtime/'.length));}
  else{root=site;file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));}
  if(!file.startsWith(root+'/')||!fs.statSync(file).isFile())throw Error('Missing');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end('Missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={id:'mahi',status:'running',measurement:'Chromium SwiftShader; unavailable-stage admission and source parsing only; no playable match or hardware FPS claim',errors:[],unexpectedSourceDownloads:0};
const save=()=>fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
let page;
try{
 const context=await browser.newContext({viewport:{width:960,height:640},locale:'ja-JP'});page=await context.newPage();
 page.on('pageerror',error=>result.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
 page.on('request',request=>{if(request.url().includes('/stages/Vss_Hiagari04/'))result.unexpectedSourceDownloads++;});
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0,audioVolume:0})));
 await page.goto('http://127.0.0.1:'+server.address().port+'/?map=tidewater',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G);
 await page.waitForFunction(()=>NG.game?.menus&&NG.mode!=='boot'||document.getElementById('boot-error')?.textContent,null,{timeout:180000});
 assert.equal(await page.locator('#boot-error').textContent(),'');
 await page.evaluate(()=>{NG.game.debug.freeze();NG.game._skipRender=true;NG.game.menus.wipe.cancel();NG.game.menus.show('setup');});
 result.registry=await page.evaluate(async()=>{
  const registry=await import(new URL('patches/native-stages/runtime/registry.mjs',document.baseURI));
  const config=await import(new URL('src/config.js',document.baseURI));
  let sourceURLRejected=false;try{registry.nativeStageURL('mahi','Vss_Hiagari04.obj');}catch{sourceURLRejected=true;}
  return {mapPresent:config.MAPS.some(map=>map.id==='mahi'),nativeIdPresent:registry.NATIVE_IDS.includes('mahi'),fingerprint:registry.nativeStageFingerprint('mahi'),
   unavailable:registry.UNAVAILABLE_NATIVE_STAGES.find(stage=>stage.id==='mahi'),sourceURLRejected};
 });
 assert.equal(result.registry.mapPresent,false);assert.equal(result.registry.nativeIdPresent,false);assert.equal(result.registry.fingerprint,null);assert.equal(result.registry.sourceURLRejected,true);
 assert.equal(result.registry.unavailable?.availability,'placement-unavailable');assert.equal(result.registry.unavailable?.reason,definition.reason);
 await page.waitForFunction(({name,reason})=>document.body.textContent.includes(name)&&document.body.textContent.includes(reason),{name:definition.name,reason:definition.reason},{timeout:15000});
 result.menu={nameVisible:true,reasonVisible:true,selectableTicket:await page.locator('.iw-ticket').filter({hasText:definition.name}).count()};
 assert.equal(result.menu.selectableTicket,0);
 await page.screenshot({path:path.join(out,'unavailable-menu.png'),timeout:30000});
 result.admission=await page.evaluate(async()=>{
  const g=NG.game,before={level:NG.level,physics:NG.physics,nav:NG.nav,paint:NG.paint,match:NG.match},rules=[];
  for(const mode of ['turf','zones','tower','rainmaker','clams']){
   let rejected=false,message='';try{const outcome=await g.startMatch({mapId:'mahi',mode});rejected=outcome===false;}catch(error){rejected=true;message=error.message;}
   rules.push({mode,rejected,message,levelRetained:NG.level===before.level,matchRetained:NG.match===before.match});
  }
  let worldRejected=false,worldMessage='';try{await g._buildWorld({id:'mahi',name:'マヒマヒリゾート＆スパ'});}catch(error){worldRejected=true;worldMessage=error.message;}
  return {rules,worldRejected,worldMessage,authoritiesRetained:NG.level===before.level&&NG.physics===before.physics&&NG.nav===before.nav&&NG.paint===before.paint&&NG.match===before.match};
 });
 for(const rule of result.admission.rules){assert.equal(rule.rejected,true,rule.mode+' silently fell back');assert.equal(rule.levelRetained,true);assert.equal(rule.matchRetained,true);}
 assert.equal(result.admission.worldRejected,true);assert.equal(result.admission.authoritiesRetained,true);
 result.source=await page.evaluate(async({definition,identity})=>{
  const {parseSourceOBJ}=await import('/__mahi-runtime/source-convert.mjs');
  const {verifySourceBytes}=await import('/__mahi-runtime/source-cache.mjs');
  const obj=await(await fetch('/__mahi-source/Vss_Hiagari04.obj')).arrayBuffer();
  await verifySourceBytes(obj,{sha256:definition.sourceSha256,bytes:definition.sourceEvidence.objBytes});
  const start=performance.now(),data=parseSourceOBJ(new TextDecoder().decode(obj),definition.sourceSemantics),parserMilliseconds=performance.now()-start;
  for(const key of ['vertices','indices']){const response=await fetch('/__mahi-buffer/'+key+'.bin',{method:'POST',body:data[key]});if(!response.ok)throw Error('Original-buffer evidence write failed');}
  let rawGitBlobsVerified=0,pngFilesVerified=0;
  for(const file of identity.files.filter(file=>file.gitBlob)){
   const response=await fetch('/__mahi-source/'+file.file);if(!response.ok)throw Error('Missing raw source');
   await verifySourceBytes(await response.arrayBuffer(),{gitSha1:file.gitBlob,bytes:file.bytes});rawGitBlobsVerified++;if(file.file.endsWith('.png'))pngFilesVerified++;
  }
  const gl=NG.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {vertices:data.vertices.length/8,triangles:data.indices.length/3,objects:data.objects.length,rawGitBlobsVerified,pngFilesVerified,
   objSha256:definition.sourceSha256,parserMilliseconds,localOriginalSourceTransport:true,retailPlacementVerified:false,
   renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 },{definition,identity});
 assert.equal(result.source.vertices,247052);assert.equal(result.source.triangles,188912);assert.equal(result.source.objects,98);assert.equal(result.source.rawGitBlobsVerified,225);assert.equal(result.source.pngFilesVerified,224);
 assert.equal(result.unexpectedSourceDownloads,0);assert.deepEqual(result.errors,[]);result.status='passed';save();
 console.log(JSON.stringify(result));
}catch(error){result.status='failed';result.error=error.stack;await page?.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});throw error;}
finally{save();await browser.close();await new Promise(resolve=>server.close(resolve));}
