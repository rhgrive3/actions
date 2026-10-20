#!/usr/bin/env node
// Real installed Game/HUD/CSS evidence. SwiftShader verifies submitted work and
// animation lifetime, not a physical device's GPU utilization percentage.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const option = name => process.argv[process.argv.indexOf(name) + 1];
const site = fs.realpathSync(option('--site')), output = path.resolve(option('--evidence-dir'));
const baseline = process.argv.includes('--baseline');
fs.mkdirSync(output, { recursive:true });
const manifest = JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const file = fs.realpathSync(path.join(site,url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(site + '/')) throw Error('outside site');
    const key = path.relative(site,file), bytes = fs.readFileSync(file);
    if (key !== 'inkwave-build.json' && hash(bytes) !== manifest.artifacts[key]) throw Error('artifact mismatch');
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result = {baseline,contentHash:manifest.contentHash,revision:manifest.build.revision,browser:browser.version(),measurement:'actual browser work counts; software WebGL, no hardware GPU percentage',runs:[]};
try {
  for (const spec of [{name:'desktop',viewport:{width:960,height:540},touch:false},{name:'phone',viewport:{width:844,height:390},touch:true}]) {
    const context = await browser.newContext({viewport:spec.viewport,hasTouch:spec.touch,isMobile:spec.touch,deviceScaleFactor:spec.touch?2:1});
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,lang:'en',master:0,music:0,frameRate:60})));
    await page.goto('http://127.0.0.1:' + server.address().port + '/?range&skipTitle',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__G?.match?.range && __G.match.state === 'playing',null,{timeout:420000});
    console.log(spec.name + ': range booted');
    const row = await page.evaluate(async () => {
      const G=window.__G,g=G.game;
      g.debug.freeze();
      G.match.local.ink=50; g.hud._tank.wobble=1; g._frame(1/60);
      // Freeze CSS at its natural phase; no animation disabling/seeking fixture.
      const roots = [g.hud.el,g.hud.overLayer];
      const hudAnimations=()=>document.getAnimations().filter(a=>roots.some(root=>root===a.effect?.target||root.contains(a.effect?.target)));
      const before = hudAnimations().map(a=>({a,time:a.currentTime}));
      // #1659: raw default-framebuffer samples. The drawing buffer is only defined until the page is composited, so a
      // paused frame that is never redrawn can read back black later even though the DOM menu is still interactive.
      const sampleArena=()=>{
        const gl=G.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(4),cells=[];
        let nonblack=0;
        for(let iy=0;iy<8;iy++)for(let ix=0;ix<8;ix++){
          gl.readPixels(Math.floor((ix+.5)*w/8),Math.floor((iy+.5)*h/8),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
          cells.push(px[0],px[1],px[2]);if(px[0]+px[1]+px[2]>0)nonblack++;
        }
        return {nonblack,total:64,cells};
      };
      g.pause();g._frame(1/60);
      const capturedFrame=sampleArena();
      const retainedApi=typeof g.R.presentPausedFrame==='function';
      const presents={calls:0};
      if(retainedApi){const present=g.R.presentPausedFrame;g.R.presentPausedFrame=function(...args){presents.calls++;return present.apply(this,args);};}
      const counts={world:0,hud:0,minimap:0,tank:0};
      const restore=[];
      for (const [owner,key,name] of [[g.R,'render','world'],[g,'_updateHud','hud'],[g.minimap,'update','minimap'],[g.hud,'_drawTank','tank']]) {
        const fn=owner[key];owner[key]=function(...args){counts[name]++;return fn.apply(this,args);};restore.push(()=>owner[key]=fn);
      }
      const snapshot=()=>JSON.stringify({time:G.match.time,actors:G.match.actors.map(a=>({hp:a.hp,ink:a.ink,pos:a.pos.toArray()}))});
      const state=snapshot(),animations=hudAnimations();
      const preservedEntryPhases=before.every(({a,time})=>!animations.includes(a)||Math.abs(a.currentTime-time)<1);
      // CSS pause commits on the next animation frame. Compare steady times
      // after its ready promise, rather than mistaking a pending pause for drift.
      await Promise.all(animations.map(a=>a.ready));
      const phase=animations.map(a=>({a,time:a.currentTime}));
      for(let i=0;i<120;i++)g._frame(1/60);
      await new Promise(resolve=>setTimeout(resolve,350));
      const pause={counts:{...counts},stateUnchanged:state===snapshot(),paused:G.match.paused,menu:g.menus.current,
        animations:animations.map(a=>({name:a.animationName,playState:a.playState})),
        preservedEntryPhases,
        unchangedAnimationTimes:phase.every(({a,time})=>a.currentTime===time),glError:G.renderer.getContext().getError()};
      // Two animation frames let the browser composite (and clear) the drawing buffer; a paused frame must then
      // restore it from the retained snapshot within the same task, with no world/composer render.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const worldBefore=counts.world;
      g._frame(1/60);
      const presentedFrame=sampleArena();
      pause.retained={api:retainedApi,presentCalls:presents.calls,worldRendersForProbe:counts.world-worldBefore,
        snapshot:!!g.R._pauseSnapshot,capturedNonblack:capturedFrame.nonblack,presentedNonblack:presentedFrame.nonblack,
        total:presentedFrame.total,identicalToCapture:JSON.stringify(capturedFrame.cells)===JSON.stringify(presentedFrame.cells),
        glError:G.renderer.getContext().getError()};
      if(retainedApi)delete g.R.presentPausedFrame;
      for(const undo of restore)undo();
      return pause;
    });
    console.log(spec.name+': measured '+JSON.stringify(row));
    fs.writeFileSync(path.join(output,spec.name+'-measurement.json'),JSON.stringify(row,null,2)+'\n');
    assert.equal(row.stateUnchanged,true);assert.equal(row.paused,true);assert.equal(row.menu,'pause');assert.equal(row.glError,0);
    assert.equal(row.counts.world,0,'existing offline world cache stays idle');
    assert.equal(row.retained.glError,0);
    assert.ok(row.retained.capturedNonblack>=32,'the paused backdrop is a real arena frame, not a cleared buffer');
    if(!baseline){
      // 120 unchanged paused frames: one lightweight presentation each, zero world/composer renders, still the same image.
      assert.equal(row.retained.api,true);assert.equal(row.retained.snapshot,true);
      assert.equal(row.retained.presentCalls,121,'one retained-frame presentation per paused frame');
      assert.equal(row.retained.worldRendersForProbe,0);
      assert.equal(row.retained.presentedNonblack,row.retained.total,'the frozen arena is still visible after the buffer was composited');
      assert.equal(row.retained.identicalToCapture,true,'the presented frame is the retained frame');
    }
    assert.ok(row.animations.length>0,'HUD animation sensitivity');
    if(baseline) {
      assert.equal(row.counts.hud,120);assert.ok(row.animations.some(a=>a.playState==='running'));
      assert.equal(row.unchangedAnimationTimes,false);
    } else {
      assert.deepEqual(row.counts,{world:0,hud:0,minimap:0,tank:0});
      assert.ok(row.animations.every(a=>a.playState==='paused'));
      assert.equal(row.preservedEntryPhases,true);assert.equal(row.unchangedAnimationTimes,true);
    }
    await page.screenshot({path:path.join(output,spec.name+'-pause.png'),timeout:120000});
    const lifecycle=await page.evaluate(()=>{const g=__G.game;g._setSettings({bloom:!g.settings.bloom});g._frame(1/60);const paused=g.hud._worldPaused;g.resume();g._frame(1/60);return {pausedBeforeResume:paused===true,snapshotReleasedOnResume:!g.R._pauseSnapshot&&!g.R._pauseQuad,resumed:!g.match.paused&&!g.hud._worldPaused,animationsRunning:document.getAnimations().some(a=>g.hud.el.contains(a.effect?.target)&&a.playState==='running')};});
    assert.equal(lifecycle.resumed,true);assert.equal(lifecycle.animationsRunning,true);
    if(!baseline)assert.equal(lifecycle.pausedBeforeResume,true)
    if(!baseline)assert.equal(lifecycle.snapshotReleasedOnResume,true,'the retained frame is released on resume (no leaked texture)');
    assert.deepEqual(errors,[]);
    result.runs.push({...spec,...row,lifecycle,errors});
    fs.writeFileSync(path.join(output,'pause-gpu.json'),JSON.stringify(result,null,2)+'\n');
    await context.close();
    console.log(spec.name+': pause/resume passed '+JSON.stringify(row.counts));
  }
} finally {await browser.close();server.close();}
