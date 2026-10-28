#!/usr/bin/env node
// Exact first-draw comparison for the #845 deferred-input path. Real emitted
// Character/SourceMotion/Renderer, isolated lighting and actor state. This is
// neither a full match benchmark nor physical mobile/Splatoon evidence.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {verifyRuntimeBuild,hash,persistentDirectory,persistentBrowserTemp} from './lib/inkwave-runtime-evidence.mjs';
import {runComposerLive} from './lib/inkwave-composer-live-browser.mjs';
import {launchSandboxBrowser} from './lib/inkwave-sandbox-browser.mjs';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const composerMode=process.argv.includes('--composer-lifecycle');
const root=path.resolve(new URL('../',import.meta.url).pathname);
const site=fs.realpathSync(arg('--site','_site')),out=persistentDirectory(arg('--out','.offscreen-hair-evidence'));
const sha=arg('--source-sha',''),manifest=verifyRuntimeBuild(site,root,sha),prefix='/_versions/'+manifest.build.revision+'/';
const temp=persistentBrowserTemp(path.join(root,'.hair-browser-tmp'));
for(const name of ['TMPDIR','TMP','TEMP'])process.env[name]=temp;
const served=new Set();
const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/review'){res.setHeader('content-type','text/html');res.end(`<link rel="icon" href="data:,"><script type="importmap">${JSON.stringify({imports:{three:prefix+'vendor/three/build/three.module.js','three/addons/':prefix+'vendor/three/jsm/'}})}</script><body style="margin:0"></body>`);return;}
  const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(site+'/'))throw Error('path');
  const body=fs.readFileSync(file),relative=path.relative(site,file);
  if(!manifest.artifacts[relative]||hash(body)!==manifest.artifacts[relative])throw Error('unverified runtime bytes');
  served.add(relative);
  res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const errors=[];
try{
  browser=await launchSandboxBrowser(chromium);
  const context=await browser.newContext({viewport:{width:240,height:180},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/review');
  const result=await page.evaluate(composerMode?runComposerLive:async prefix=>{
    Math.random=()=>.4;
    const THREE=await import('three'),{install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');
    const profile=await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()),api=install(profile),{G}=api;
    const {installQuality}=await import(prefix+'patches/local-quality/install.mjs');installQuality(profile);
    const {Renderer}=await import(prefix+'src/core/renderer.js');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,4/3,.05,50);
    const post=new Renderer(document.body,{quality:'high',shadows:true,bloom:true});post.setScene(scene,camera);
    const renderer=post.renderer,gl=renderer.getContext();renderer.debug.checkShaderErrors=true;
    scene.background=new THREE.Color('#273143');scene.add(new THREE.HemisphereLight(0xffffff,0x667788,3));
    const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,2);scene.add(key);
    G.scene=scene;G.camera=camera;G.renderer=renderer;G.post=post;G.settings={quality:'high'};G.mode='match';
    G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.env=null;
    G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};
    G.physics=new api.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={state:'playing',opts:{},local:null,playing:()=>true};
    const rows=[];
    for(const hz of [30,60,120]){
      const actors=[];
      for(let side=0;side<2;side++){
        const a=new api.Actor({team:0,name:'identical',weapon:'shooter',isLocal:false,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
        a.isBot=true;a.character.actor=a;a.character.onEvent=null;scene.add(a.character.root);actors.push(a);
        await a.character._sourceMotionLoader;await a.character.sourceMotion.ready;a.character.lod.force=-1;
      }
      G.actors=actors;
      const adds=[0,0];
      for(let side=0;side<2;side++){
        const m=actors[side].character.sourceMotion,h=m.hairTargets,add=h.add;
        h.add=function(...args){adds[side]++;return add.apply(this,args);};
      }
      // The control evaluates the same hidden hair inputs continuously; its
      // body, visual budget and first-render recovery remain unchanged.
      const control=actors[1].character,advance=control.sourceMotion.advance;
      control.sourceMotion.advance=function(...args){const hidden=control._oobBudget;control._oobBudget=false;try{return advance.apply(this,args);}finally{control._oobBudget=hidden;}};
      const state={isBot:true,form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},ink:1,hp:1};
      camera.position.set(0,1.2,4);camera.lookAt(0,1,0);camera.updateMatrixWorld();
      for(let frame=0;frame<40;frame++)for(const a of actors)a.character.update(1/hz,state);
      post.render();
      const initialFrames=actors.map(a=>a.character._camFrame);
      camera.lookAt(0,1.2,20);camera.updateMatrixWorld();
      for(let frame=0;frame<hz;frame++){
        G.time=(frame+1)/hz;
        for(const a of actors)a.character.update(1/hz,state);
        post.render();
      }
      const hiddenFrames=actors.map(a=>a.character._camFrame),hiddenTicks=actors.map(a=>a.character._oobBudgetTicks);
      camera.lookAt(0,1,0);camera.updateMatrixWorld();
      const captures=[];
      for(let side=0;side<2;side++){
        actors[side].character.root.visible=true;actors[1-side].character.root.visible=false;
        post.render();const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const c=actors[side].character;
        captures.push({pixels,png:renderer.domElement.toDataURL('image/png').split(',')[1],
          bones:c.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray()]),
          targets:c.sourceMotion.hairTargets.indices.map(i=>c.sourceMotion.hairTargets.q[i].toArray()),
          muzzle:c.getMuzzle(new THREE.Vector3()).toArray(),catchups:c._oobCatchUps,
          clock:c.sourceMotion.time,phase:c.sourceMotion.phase});
      }
      let changed=0;for(let i=0;i<captures[0].pixels.length;i++)if(captures[0].pixels[i]!==captures[1].pixels[i])changed++;
      const bytes=captures.map(c=>c.png);for(const c of captures){delete c.pixels;delete c.png;}
      rows.push({hz,adds,initialFrames,hiddenFrames,hiddenTicks,changedChannels:changed,
        bodyEqual:JSON.stringify(captures[0].bones)===JSON.stringify(captures[1].bones),
        targetsEqual:JSON.stringify(captures[0].targets)===JSON.stringify(captures[1].targets),
        muzzleEqual:JSON.stringify(captures[0].muzzle)===JSON.stringify(captures[1].muzzle),
        captures,bytes,glError:gl.getError()});
      for(const a of actors){scene.remove(a.character.root);a.character.dispose();}
    }
    post._disposeComposer(null);renderer.dispose();return {rows,contextLost:gl.isContextLost()};
  },prefix);
  for(const row of result.rows){row.bytes.forEach((png,i)=>fs.writeFileSync(path.join(out,`${row.hz??row.name}-${i}.png`),Buffer.from(png,'base64')));delete row.bytes;}
  const failures=composerMode?result.rows.filter(r=>!r.passed||r.glError||!result.resources.passed||!result.contextRecovery.passed):result.rows.filter(r=>r.changedChannels||!r.bodyEqual||!r.targetsEqual||!r.muzzleEqual||r.glError||r.hiddenTicks.some(n=>n<1)||r.initialFrames.some((n,i)=>n!==r.hiddenFrames[i]));
  verifyRuntimeBuild(site,root,sha);
  const report={sourceSha:sha,contentHash:manifest.contentHash,browser:browser.version(),node:process.version,
    harness:{runner:hash(fs.readFileSync(new URL(import.meta.url))),composerProbe:hash(Buffer.from(runComposerLive.toString()))},servedArtifacts:[...served].sort(),
    scope:composerMode?'actual emitted Renderer/ScreenFX precision edges; isolated deterministic scene, no device FPS claim':'isolated actual emitted Character/Renderer; exact first-draw recovery, no full-match/device FPS claim',...result,errors,status:failures.length||errors.length?'failed':'passed'};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,rows:report.rows.map(({captures,...r})=>r),errors}));
  if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
