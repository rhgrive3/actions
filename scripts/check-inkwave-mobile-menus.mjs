#!/usr/bin/env node
// Real production Menus and CSS with an offline API fixture. No game simulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';
import { createResponsiveAssetServer } from './lib/inkwave-responsive-server.mjs';
import { createResponsiveDiagnostics, createResponsiveProgressWriter } from './lib/inkwave-responsive-diagnostics.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const source = path.resolve(arg('--source') || '_site');
const evidence = path.resolve(arg('--evidence-dir') || '.browser-evidence/mobile-menus');
const audit = process.argv.includes('--audit');
const stageOnly = process.argv.includes('--stage-only');
const resizableViewport = process.argv.includes('--resizable-viewport');
const engineName = arg('--engine') || 'chromium';
const engine = {chromium,webkit}[engineName];
assert(engine, 'Unknown browser engine');
const profile = path.resolve(arg('--profile-dir') || `.browser-profile-mobile-menus-${engineName}`);
fs.mkdirSync(evidence, { recursive: true });
fs.mkdirSync(profile, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(source,'inkwave-build.json'),'utf8'));
const html = `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles/ui.css"><link rel="stylesheet" href="/styles/mobile.css">
<link rel="stylesheet" href="/patches/splatoon3/ui.css">
<style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}#ui-root{position:fixed;inset:0}</style>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
<div id="ui-root"></div><script type="module">
import { Menus } from '/src/ui/menus.js';
import { G } from '/src/core/ctx.js';
import { MockNet } from '/src/net/mock.js';
import { DEFAULT_SETTINGS } from '/src/config.js';
import { install } from '/patches/splatoon3/runtime/install.mjs';
install(await (await fetch('/patches/splatoon3/profile.json')).json());
let settings={...DEFAULT_SETTINGS}, profile={name:'スマホプレイヤー',level:5,xp:1200}, loadout={weapon:'shooter'};
G.settings=settings;G.net=new MockNet();window.G=G;window.calls=[];
window.menuState=()=>({settings,profile,loadout});
window.menus=new Menus(document.getElementById('ui-root'),{
 getSettings:()=>settings,setSetting:(k,v)=>settings[k]=v,
 setSettings:v=>{Object.assign(settings,v);G.settings=settings},
 getProfile:()=>profile,setProfile:v=>Object.assign(profile,v),
 setProfileName:v=>profile.name=v,setProfileStyle:v=>profile.style={...v},
 getLoadout:()=>loadout,setLoadout:v=>Object.assign(loadout,v),
 prepareMatch:()=>calls.push({kind:'prepare'}),
 startMatch:v=>calls.push({kind:'start',value:v}),
 rematch:()=>calls.push({kind:'rematch',weapon:loadout.weapon}),
 toMainMenu:()=>calls.push({kind:'home'}),
 netContinue:v=>{calls.push({kind:'netContinue',value:v});return true;},
 quitMatch:()=>calls.push({kind:'quit'})
});
window.addEventListener('keydown',e=>{if(menus.handleKey(e)&&document.activeElement?.tagName!=='INPUT')e.preventDefault()});
window.menuReady=true;
</script></html>`;
const cases = [
  ['small-phone',568,320], ['phone',844,390], ['android',740,360],
  ['standard',667,375], ['landscape',932,430], ['browser-bars',740,280],
  ['notched',844,390], ['tablet',1024,768], ['desktop',1440,900],
];
const selected = (arg('--cases') || '').split(',').filter(Boolean);
const result = { source, audit, engine:engineName,viewportModel:resizableViewport?'resizable-touch':'mobile-emulation',contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,realDeviceVerified:false, cases:[], errors:[] };
const server = createResponsiveAssetServer({ source, html });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const chromiumPath = process.env.CHROMIUM_PATH;
let context, page, diagnostics, activeCase, cleanupRecorded=false;
const markCleanup=()=>{if(diagnostics&&!cleanupRecorded){cleanupRecorded=true;diagnostics.record('context-close-start');}};
try {
  for (const [name,width,height] of cases.filter(([n])=>!selected.length || selected.includes(n))) {
    activeCase=name;cleanupRecorded=false;
    diagnostics=createResponsiveDiagnostics({onChange:createResponsiveProgressWriter(path.join(evidence,`${name}-diagnostic-progress.json`),{engine:engineName,name,contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision})});
    const caseDiagnostics=diagnostics;
    diagnostics.record('context-launch-start');
    const touch = name !== 'desktop';
    context = await engine.launchPersistentContext(path.join(profile,name),{headless:true,...(touch ? devices['iPhone 13'] : {}),...(resizableViewport?{isMobile:false}:{}),viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',...(engineName==='chromium'?{...(chromiumPath?{executablePath:chromiumPath}:{}),args:['--no-sandbox','--disable-dev-shm-usage']}:{} )});
    diagnostics.record('context-launch-complete');
    context.on('close',()=>caseDiagnostics.record('context-close'));
    context.browser()?.on('disconnected',()=>caseDiagnostics.record('browser-disconnected'));
    page = context.pages()[0] || await context.newPage();
    page.on('crash',()=>caseDiagnostics.unavailable('page-crash'));
    page.on('close',()=>caseDiagnostics.unavailable('page-close'));
    page.on('pageerror',error=>{result.errors.push({name,error:error.message});caseDiagnostics.record('page-error',error.message);});
    await page.goto(`http://127.0.0.1:${server.address().port}/__menus?netmock=1&mockauto=0&mocklat=0&news=0`);
    await page.waitForFunction(()=>window.menuReady);diagnostics.stage('menu-ready');
    if(name==='notched')await page.evaluate(()=>{
      for(const [key,value] of [['--sal','44px'],['--sar','44px'],['--sab','21px']])menus.el.style.setProperty(key,value);
    });
    const entry = {name,width,height,screens:{},checks:[]};result.cases.push(entry);
    const landscapePhone=touch&&height<=500;
    const check = (ok,label) => { entry.checks.push({label,ok});if(!audit)assert(ok,`${name}: ${label}`); };
    const show = async screen => {
      await page.evaluate(screen=>{menus.wipe.cancel();menus.show(screen,{wipe:false,light:false,force:true});},screen);
      await page.waitForFunction(()=>!document.querySelector('.iw-screen.is-leaving'));
      await page.waitForTimeout(250);
    };
    const capture = async (screen,selector) => {
      entry.screens[screen] = await page.locator(selector).evaluateAll(els=>els.map(el=>{
        const r=el.getBoundingClientRect();
        return {id:el.dataset.id,cls:el.className,x:r.x,y:r.y,width:r.width,height:r.height,inViewport:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};
      }));
      await page.screenshot({path:path.join(evidence,`${name}-${screen}.png`)});
    };
    const tap = async selector => {const el=page.locator(selector);await el.scrollIntoViewIfNeeded();if(touch)await el.tap();else await el.click();};
    await show('mode');await capture('mode','.iw-mode');
    if (touch) {
      check(entry.screens.mode.every(r=>r.x>=-1&&r.x+r.width<=width+1),'mode cards fit screen');
      check(entry.screens.mode.every(r=>r.height<=Math.max(290,height-110)),'mode cards fit short screens');
      if(landscapePhone)check(entry.screens.mode.length===6&&entry.screens.mode.every(r=>r.inViewport),'all six modes visible together in landscape');
    }
    if(!audit&&touch) {
      const expected = await page.locator('.iw-mode').evaluateAll(els=>{
        const cols=getComputedStyle(els[0].parentElement).gridTemplateColumns.trim().split(/\s+/).length;
        return els[cols]?.dataset.id;
      });
      await page.keyboard.press('ArrowDown');
      check(await page.evaluate(()=>menus._focus?.dataset.id)===expected,'keyboard follows the visible mode rows');
    }
    if(!audit && name==='phone') {
      const ids=await page.locator('.iw-mode').evaluateAll(els=>els.map(el=>el._mode));
      for(const id of ids) {
        await show('mode');await tap(`[data-id="mode-${id}"]`);
        await page.waitForFunction(()=>menus._scr?.name==='setup');
        check(await page.evaluate(()=>menus._setup.mode)===id,'mode selection retained: '+id);
      }
      await show('mode');
    }
    await tap('[data-id="mode-boss"]');await page.waitForFunction(()=>menus.current==='setup'&&menus._scr?.name==='setup');
    check(await page.evaluate(()=>menus._setup.mode==='boss'),'boss mode opens its own setup');
    await show('setup');await capture('setup','.iw-ss__foot button');
    if(touch)check(entry.screens.setup.every(r=>r.inViewport),'equipment and start visible without scrolling');
    if(touch) {
      check(await page.locator('.iw-daytgl, [data-id="match-options"]').evaluateAll(els=>els.every(el=>{
        const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=43&&(hit===el||el.contains(hit));
      })),'time and battle options have visible finger targets');
      check(await page.locator('.s3-setup-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1),'setup uses horizontal panels without page scrolling');
      if(landscapePhone)check(await page.locator('.iw-ss__hero').evaluate(el=>el.getBoundingClientRect().width>=innerWidth*.5),'stage preview is the main visual');
      check(await page.locator('.iw-ss__match').evaluate(el=>el.getBoundingClientRect().height===0),'match settings stay out of the stage composition');
      if(!audit) {
        await page.evaluate(()=>window.__stageMatchPanel=menus._scr.el.querySelector('.iw-ss__match'));
        await tap('[data-id="match-options"]');await page.waitForFunction(()=>menus._modal?.classList.contains('s3-stage-settings'));
        await page.waitForFunction(()=>Number(getComputedStyle(menus._modal).opacity)>.99);
        await capture('setup-settings','.s3-stage-settings .iw-seg__opt, .s3-stage-settings button');
        check(entry.screens['setup-settings'].every(r=>r.inViewport&&r.height>=43),'battle settings and Done fit the dialog');
        await tap('[data-id="difficulty"] .iw-seg__opt:last-child');
        await tap('[data-id="length"] .iw-seg__opt:last-child');
        const settings=await page.evaluate(()=>({difficulty:menus._setup.difficulty,duration:menus._setup.duration}));
        await page.evaluate(()=>window.__oldStageDone=menus._binds.get(document.querySelector('.s3-stage-settings [data-id="modal-0"]')).accept);
        await tap('.s3-stage-settings [data-id="modal-0"]');await page.waitForFunction(()=>!menus._modal);
        check(await page.evaluate(()=>menus._scr.el.querySelector('.iw-ss__match')===__stageMatchPanel),'settings reuse the original controls');
        check(await page.evaluate(value=>menus._setup.difficulty===value.difficulty&&menus._setup.duration===value.duration,settings),'Done preserves native settings');
        await page.waitForFunction(()=>!document.querySelector('.iw-modal.is-leaving'));
        await tap('[data-id="match-options"]');await page.waitForFunction(()=>!!menus._modal);
        await page.waitForFunction(()=>Number(getComputedStyle(menus._modal).opacity)>.99);
        await page.evaluate(()=>__oldStageDone('key'));
        check(await page.evaluate(()=>!!menus._modal),'stale Done cannot dismiss a newer settings dialog');
        await page.keyboard.press('ArrowDown');
        check(await page.evaluate(()=>menus._modal.contains(menus._focus)),'dialog navigation cannot focus the stage behind it');
        await page.keyboard.press('Escape');await page.waitForFunction(()=>!menus._modal);
        check(await page.evaluate(()=>menus.current==='setup'&&menus._focus?.dataset.id==='match-options'),'Back returns focus to battle options');
        await page.waitForFunction(()=>!document.querySelector('.iw-modal.is-leaving'));
        if(name==='phone') {
          await page.evaluate(()=>{menus._setFocus(document.querySelector('[data-id="start"]'));menus.nav('left');});
          check(await page.evaluate(()=>menus._focus?.dataset.id==='match-options'),'pad can reach battle options from Start');
          await page.keyboard.press('Enter');await page.waitForFunction(()=>!!menus._modal);
          await page.keyboard.press('ArrowDown');
          check(await page.evaluate(()=>menus._focus?.dataset.id==='length'&&menus._modal.contains(menus._focus)),'keyboard moves between the native settings rows');
          await page.keyboard.press('Escape');await page.waitForFunction(()=>!menus._modal);
          await page.waitForFunction(()=>!document.querySelector('.iw-modal.is-leaving'));
          await tap('[data-id="match-options"]');
          await page.evaluate(()=>{
            const stale=menus._binds.get(document.querySelector('[data-id="match-options"]')).accept;
            menus.wipe.cancel();menus.show('mode',{wipe:false,force:true});stale('key');
          });
          check(await page.evaluate(()=>menus.current==='mode'&&!menus._modal),'leaving an open dialog retires its old opener');
          await show('setup');
        }
      }
    }
    const tickets=page.locator('.iw-ticket');
    const last=tickets.last(),id=await last.evaluate(el=>el._mid);
    await last.scrollIntoViewIfNeeded();await (touch?last.tap():last.click());
    check(await page.evaluate(()=>menus._setup.mapId)===id,'last stage selectable');
    if(!audit) {
      if(touch)check(await page.locator('[data-id="start"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'start stays visible after scrolling stages');
      await tap('[data-id="time"]');
      const saved=await page.evaluate(()=>({id:menus._setup.mapId,time:menus._setup.times[menus._setup.mapId]}));
      diagnostics.operation('setup-loadout-tap','before');
      await tap('.iw-ss__foot [data-id="weapon"]');diagnostics.operation('setup-loadout-tap','after');
      diagnostics.operation('setup-loadout-wait','before');
      await page.waitForFunction(()=>menus._scr?.name==='loadout');diagnostics.operation('setup-loadout-wait','after');
      await page.waitForTimeout(400);await tap('.iw-loadout .iw-backbtn');await page.waitForFunction(()=>menus._scr?.name==='setup');
      await page.waitForTimeout(400);
      check(await page.evaluate(v=>menus._setup.mapId===v.id&&menus._setup.times[v.id]===v.time,saved),'stage and time survive equipment roundtrip');
      if(name==='phone') {
        for(const ticket of await page.locator('.iw-ticket').all()) {
          const id=await ticket.evaluate(el=>el._mid);await ticket.scrollIntoViewIfNeeded();await ticket.tap();
          check(await page.evaluate(()=>menus._setup.mapId)===id,'stage remains reachable: '+id);
        }
      }
      if(touch&&engineName==='chromium') {
        const list=page.locator('.iw-ss__list');await list.evaluate(el=>el.scrollTop=0);await list.scrollIntoViewIfNeeded();
        const before=await page.evaluate(()=>menus._setup.mapId);
        const box=await list.boundingBox(),cdp=await context.newCDPSession(page);
        const x=box.x+box.width/2,y=Math.min(box.y+box.height-20,height-150);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        for(let i=1;i<=8;i++) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*8}]});await page.waitForTimeout(20);
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
        check(await list.evaluate(el=>el.scrollTop>20),'native finger swipe scrolls the stage list');
        check(await page.evaluate(()=>menus._setup.mapId)===before,'scrolling does not select a different stage');
      }
      const requested=await page.evaluate(()=>({mode:menus._setup.mode,mapId:menus._setup.mapId,time:menus._stageTime(menus._setup.mapId),difficulty:menus._setup.difficulty,duration:menus._setup.duration}));
      await tap('[data-id="start"]');
      await page.evaluate(()=>document.querySelector('[data-id="start"]')?.click());
      await page.waitForFunction(()=>calls.some(c=>c.kind==='start'));
      check(await page.evaluate(()=>calls.filter(c=>c.kind==='start').length===1),'double start activates the existing match API once');
      check(await page.evaluate(expected=>{const actual=calls.find(c=>c.kind==='start').value;return Object.entries(expected).every(([key,value])=>actual[key]===value);},requested),'Start sends the selected stage, time and dialog settings to the match API');
    }
    if(stageOnly) {diagnostics.stage('stage-checks-complete');markCleanup();await context.close();console.log(`${name}: ${entry.checks.length} stage checks`);continue;}
    for(const mode of (name==='phone'?['turf','boss','zones','tower','rainmaker','clams']:['turf','boss','zones'])) {
      await page.evaluate(mode=>{const d=menus._demoResults();d.mode=mode;if(mode==='boss'){d.boss={defeated:true,time:142,hpLeft:0,phase:3};d.players=d.players.map((p,i)=>({...p,team:0,damage:5000-i*340,weakHits:12+i}));}else if(mode!=='turf'){d.counts=[0,65];d.penalties=[0,12];d.knockout=true;d.winner=0;}menus._results=d;},mode);
      await show('results');
      await tap('.iw-res__title');
      await page.waitForFunction(()=>menus._scr.el.classList.contains('is-done'));
      const screen=mode==='turf'?'results':mode+'-results';await capture(screen,'.iw-res__foot button');
      if(mode!=='turf'&&mode!=='boss') {
        check(JSON.stringify(await page.locator('.iw-ranked-result__team strong').allTextContents())===JSON.stringify(['0','65']),'ranked counts retained: '+mode);
        check(await page.locator('.iw-ranked-result__team small').nth(1).textContent().then(text=>text.includes('12')),'ranked penalty retained: '+mode);
        check(await page.locator('.iw-cover').count()===0,'ranked results do not show turf percentages: '+mode);
      }
      if(touch)check(entry.screens[screen].every(r=>r.inViewport),'results actions visible without scrolling: '+screen);
      check(await page.locator('.iw-prow').count()===8,'all eight players retained: '+screen);
      if(landscapePhone) {
        check(await page.locator('.iw-res__teams').evaluate(el=>{const [a,b]=el.children;return Math.abs(a.getBoundingClientRect().top-b.getBoundingClientRect().top)<2;}),'both teams share the landscape row: '+screen);
        if(height>=320)check(await page.locator('.iw-prow').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect(),foot=el.closest('.iw-results').querySelector('.iw-res__foot').getBoundingClientRect();return r.top>=0&&r.bottom<=foot.top;})),'all eight scores visible above actions: '+screen);
      }
      check(await page.locator('.iw-prow').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),'score rows do not clip: '+screen);
      if(!audit&&touch)check(await page.locator('.iw-res__foot button').evaluateAll(els=>els.every(el=>{
        const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return r.height>=44&&r.width>=44&&(hit===el||el.contains(hit));
      })),'results actions have unobstructed finger targets: '+screen);
    }
    if(!audit) {
      await page.evaluate(()=>{menus._results=menus._demoResults();});await show('results');await tap('.iw-res__title');
      await tap('[data-id="change-gear-continue"]');await page.waitForFunction(()=>menus._scr?.name==='loadout');
      await page.waitForTimeout(400);
      const changedWeapon=await page.locator('.iw-wcard').nth(1).evaluate(el=>el._wid);
      await tap(`[data-id="w-${changedWeapon}"]`);
      await tap('[data-id="continue-with-gear"]');
      check(await page.evaluate(()=>calls.filter(c=>c.kind==='rematch').length===1),'change gear continuation starts once');
      check(await page.evaluate(()=>calls.find(c=>c.kind==='rematch').weapon)===changedWeapon,'continuation uses the changed weapon');
      await page.evaluate(()=>{menus._results={...menus._demoResults(),online:true};});await show('results');await tap('.iw-res__title');
      if(touch)check(await page.locator('.iw-res__foot button').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})),'online keep/change/leave actions stay visible');
      await tap('[data-id="keep-going"]');
      check(await page.locator('[data-id="keep-going"]').isDisabled(),'online continue disables while waiting');
      await page.evaluate(()=>document.querySelector('[data-id="keep-going"]').click());
      check(await page.evaluate(()=>calls.filter(c=>c.kind==='netContinue'&&c.value==='keep').length===1),'online continue submits only once');
      await tap('[data-id="leave"]');
      check(await page.locator('.iw-modal__btns button').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})),'leave confirmation fits the viewport');
      await tap('[data-id="modal-0"]');await page.waitForFunction(()=>!menus._modal);
      check(await page.evaluate(()=>!calls.some(c=>c.kind==='quit')),'cancel leave preserves the room');
      // Browser bars change usable height while gameplay remains landscape.
      if(touch && (engineName!=='webkit' || resizableViewport)) {
        await show('setup');
        const state=await page.evaluate(()=>JSON.stringify(menus._setup));
        const resized={width,height:Math.max(240,height-40)};
        await page.setViewportSize(resized);
        // Wait for both the window and CSS media viewport before asserting.
        await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height&&matchMedia(`(width: ${width}px)`).matches&&matchMedia(`(height: ${height}px)`).matches,resized);
        await page.waitForFunction(()=>{const r=document.querySelector('[data-id="start"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;});
        check(await page.locator('[data-id="start"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}),'start remains visible with browser bars');
        check(await page.evaluate(()=>JSON.stringify(menus._setup))===state,'height changes preserve stage, time and match options');
        if(landscapePhone)check(await page.locator('.iw-ss__caption').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.querySelector('.iw-ss__time').getBoundingClientRect();return a.top>=b.bottom;}),'stage title and time switch remain separate with browser bars');
        await page.screenshot({path:path.join(evidence,`${name}-shorter-setup.png`)});
      } else if(touch) {
        // Playwright WebKit mobile emulation changes innerWidth/innerHeight
        // without resizing visualViewport or CSS media queries. Both static
        // orientations run above; a separate resizable-touch run owns rotation.
        entry.rotation={status:'separate-resizable-viewport-check'};
      }
    }
    diagnostics.stage('all-case-checks-complete');markCleanup();await context.close();console.log(`${name}: ${entry.checks.length} checks`);
  }
  assert.deepEqual(result.errors,[]);result.status='passed';
}catch(error){
  diagnostics?.fail(error);
  result.failedCase=activeCase??null;
  console.error(JSON.stringify({event:'mobile-menu-primary-failure',engine:engineName,name:activeCase??null,diagnostics:diagnostics?.snapshot()??null}));
  result.status='failed';result.failure=error.stack;process.exitCode=1;
  if(page&&!page.isClosed()) {
    await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});
    result.layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,nodes:[...document.querySelectorAll('.iw-screen:not(.is-leaving), .s3-setup-scroll, .iw-ss__foot, .iw-ss__caption, .iw-ss__time, [data-id="start"]')].map(el=>({cls:el.className,rect:el.getBoundingClientRect().toJSON(),rows:getComputedStyle(el).gridTemplateRows,padding:getComputedStyle(el).padding}))})).catch(()=>null);
  }
}
finally{markCleanup();await context?.close();if(diagnostics)result.diagnostics={name:activeCase,...diagnostics.snapshot()};await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(`${result.status}: ${evidence}`);if(result.failure)console.error(result.failure);}
