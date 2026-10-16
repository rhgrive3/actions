#!/usr/bin/env node
// Actual shipped Showcase/Character/renderer with a controlled empty world.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
const option=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],n+' required');return path.resolve(process.argv[i+1]);};
const site=option('--site'),out=option('--evidence-dir'),expectStale=process.argv.includes('--expect-stale');fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
const base='/_versions/'+manifest.build.revision+'/',receipts=new Set();
const html=`<!doctype html><base href="${base}"><script type="importmap">${JSON.stringify({imports:{three:base+'vendor/three/build/three.module.js','three/addons/':base+'vendor/three/jsm/'}})}</script>`;
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://local').pathname;if(name==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}const rel=decodeURIComponent(name.slice(1)),file=path.resolve(site,rel);assert(file.startsWith(site+'/')&&manifest.artifacts[rel]);const bytes=fs.readFileSync(file);assert.equal(hash(bytes),manifest.artifacts[rel]);receipts.add(rel);res.writeHead(200,{'content-type':rel.endsWith('.json')?'application/json':/\.m?js$/.test(rel)?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const rows=await page.evaluate(async base=>{
  const THREE=await import('three'),{install}=await import(base+'patches/splatoon3/runtime/install.mjs'),profile=await fetch(base+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile);
  const{installWeaponsFidelity}=await import(base+'patches/splatoon3/runtime/weapons-fidelity.mjs'),{installMainWeaponCatalogRuntime}=await import(base+'patches/splatoon3/runtime/main-weapon-catalog.mjs');installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);
  const{Showcase}=await import(base+'src/game/showcase.js'),R=await import(base+'patches/splatoon3/runtime/weapon-models/registry.mjs');
  const{G}=api;G.time=0;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(50,1,.1,100);G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
  const renderer=G.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(480,480);document.body.append(renderer.domElement);
  G.physics={raycast(_a,_b,_c,h){h.hit=false;return h;},segment(_a,_b,h){h.hit=false;return h;}};
  const style={hair:0,skin:2,outfit:0,eyes:0};G.game={profile:{style,weapon:'shooter'},settings:{quality:'low'}};
  const rows=[];
  try{for(const hz of[30,60,120])for(const mode of['queued','latest','settled','in-flight','unchanged']){
   const sc=G.game.showcase=new Showcase(renderer,api.Character);
   try{
    sc.showLoadout('shooter',G.teamColors[0],style);
    if(mode==='settled'||mode==='in-flight')for(let i=0;i<3*hz;i++){G.time+=1/hz;sc.update(1/hz);}
    const phaseBefore=sc.phase,first='s3-spinner-serein-01',last=mode==='unchanged'?'shooter':mode==='latest'||mode==='in-flight'?'s3-spinner-hyper-01':first;
    if(mode!=='unchanged')sc.showLoadout(first,G.teamColors[0],style);
    if(mode==='in-flight')for(let i=0;i<Math.ceil(.05*hz);i++){G.time+=1/hz;sc.update(1/hz);}
    if(mode==='latest'||mode==='in-flight')sc.showLoadout(last,G.teamColors[0],style);
    for(let i=0;i<3*hz;i++){G.time+=1/hz;sc.update(1/hz);}
    sc.render();const ch=sc.chars[0],def=ch.weapon.def,expected=R.weaponModelKey(last);
    rows.push({hz,mode,phaseBefore,phase:sc.phase,requested:last,expected,weapon:sc.weapon,pending:sc.hopWeapon,model:ch.weaponModel,appearance:ch.weaponAppearanceModel,modelId:def.modelId,modelVariantId:def.modelVariantId??null,characterCount:sc.chars.length,consumed:ch.weaponModel===expected&&ch.weaponAppearanceModel===expected});
   }finally{sc.dispose();}
  }}finally{renderer.dispose();}
  return rows;
 },base);
 const report={status:'observed',browser:browser.version(),contentHash:manifest.contentHash,revision:manifest.build.revision,scope:'Real shipped Showcase/Character and WebGL; controlled empty-world physics, native public loadout calls and normal update/render. No forced Character selection or animation state. Not a full Game, physical device or measured Nintendo animation parity.',rows,errors,loadedArtifactCount:receipts.size};
 fs.writeFileSync(path.join(out,'showcase-weapon-queue.json'),JSON.stringify(report,null,2)+'\n');assert.deepEqual(errors,[]);
 for(const r of rows){assert.equal(r.characterCount,1);assert.equal(r.weapon,r.requested);if(expectStale&&['queued','latest'].includes(r.mode)){assert.equal(r.consumed,false);assert.equal(r.phase,'pose');assert.equal(r.pending,r.requested);}else{assert.equal(r.consumed,true,r.mode+' at '+r.hz+'Hz: '+JSON.stringify(r));assert.equal(r.pending,null);}}
 report.status=expectStale?'reproduced':'passed';fs.writeFileSync(path.join(out,'showcase-weapon-queue.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:rows.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
