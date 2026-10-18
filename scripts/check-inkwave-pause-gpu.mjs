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
      g.pause();g._frame(1/60);
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
      for(const undo of restore)undo();
      return pause;
    });
    assert.equal(row.stateUnchanged,true);assert.equal(row.paused,true);assert.equal(row.menu,'pause');assert.equal(row.glError,0);
    assert.equal(row.counts.world,0,'existing offline world cache stays idle');
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
    const lifecycle=await page.evaluate(()=>{const g=__G.game;g._setSettings({bloom:!g.settings.bloom});g._frame(1/60);const paused=g.hud._worldPaused;g.resume();g._frame(1/60);return {pausedBeforeResume:paused===true,resumed:!g.match.paused&&!g.hud._worldPaused,animationsRunning:document.getAnimations().some(a=>g.hud.el.contains(a.effect?.target)&&a.playState==='running')};});
    assert.equal(lifecycle.resumed,true);assert.equal(lifecycle.animationsRunning,true);
    if(!baseline)assert.equal(lifecycle.pausedBeforeResume,true);
    assert.deepEqual(errors,[]);
    result.runs.push({...spec,...row,lifecycle,errors});
    fs.writeFileSync(path.join(output,'pause-gpu.json'),JSON.stringify(result,null,2)+'\n');
    await context.close();
    console.log(spec.name+': pause/resume passed '+JSON.stringify(row.counts));
  }
} finally {await browser.close();server.close();}
