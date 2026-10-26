#!/usr/bin/env node
// Real production Menus and CSS with an offline API fixture. No game simulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';
import { createResponsiveAssetServer } from './lib/inkwave-responsive-server.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const source = path.resolve(arg('--source') || '_site');
const evidence = path.resolve(arg('--evidence-dir') || '.browser-evidence/mobile-menus');
const audit = process.argv.includes('--audit');
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
  ['small-phone',320,568], ['phone',390,844], ['android',360,640],
  ['short-landscape',568,320], ['landscape',844,390],
  ['tablet',768,1024], ['split-view',507,768], ['desktop',1440,900],
];
const selected = (arg('--cases') || '').split(',').filter(Boolean);
const result = { source, audit, engine:engineName,viewportModel:resizableViewport?'resizable-touch':'mobile-emulation',contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,realDeviceVerified:false, cases:[], errors:[] };
const server = createResponsiveAssetServer({ source, html });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const chromiumPath = process.env.CHROMIUM_PATH;
let context, page;
try {
  for (const [name,width,height] of cases.filter(([n])=>!selected.length || selected.includes(n))) {
    const touch = name !== 'desktop';
    context = await engine.launchPersistentContext(path.join(profile,name),{headless:true,...(touch ? devices['iPhone 13'] : {}),...(resizableViewport?{isMobile:false}:{}),viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',...(engineName==='chromium'?{...(chromiumPath?{executablePath:chromiumPath}:{}),args:['--no-sandbox','--disable-dev-shm-usage']}:{} )});
    page = context.pages()[0] || await context.newPage();
    page.on('pageerror',error=>result.errors.push({name,error:error.message}));
    await page.goto(`http://127.0.0.1:${server.address().port}/__menus?netmock=1&mockauto=0&mocklat=0&news=0`);
    await page.waitForFunction(()=>window.menuReady);
    const entry = {name,width,height,screens:{},checks:[]};result.cases.push(entry);
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
    const tickets=page.locator('.iw-ticket');
    const last=tickets.last(),id=await last.evaluate(el=>el._mid);
    await last.scrollIntoViewIfNeeded();await (touch?last.tap():last.click());
    check(await page.evaluate(()=>menus._setup.mapId)===id,'last stage selectable');
    if(!audit) {
      if(touch)check(await page.locator('[data-id="start"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'start stays visible after scrolling stages');
      await tap('[data-id="time"]');
      const saved=await page.evaluate(()=>({id:menus._setup.mapId,time:menus._setup.times[menus._setup.mapId]}));
      await tap('.iw-ss__foot [data-id="weapon"]');await page.waitForFunction(()=>menus._scr?.name==='loadout');
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
      await tap('[data-id="start"]');
      await page.evaluate(()=>document.querySelector('[data-id="start"]')?.click());
      await page.waitForFunction(()=>calls.some(c=>c.kind==='start'));
      check(await page.evaluate(()=>calls.filter(c=>c.kind==='start').length===1),'double start activates the existing match API once');
    }
    for(const boss of [false,true]) {
      await page.evaluate(boss=>{const d=menus._demoResults();if(boss){d.mode='boss';d.boss={defeated:true,time:142,hpLeft:0,phase:3};d.players=d.players.map((p,i)=>({...p,team:0,damage:5000-i*340,weakHits:12+i}));}menus._results=d;},boss);
      await show('results');
      await tap('.iw-res__title');
      await page.waitForFunction(()=>menus._scr.el.classList.contains('is-done'));
      const screen=boss?'boss-results':'results';await capture(screen,'.iw-res__foot button');
      if(touch)check(entry.screens[screen].every(r=>r.inViewport),'results actions visible without scrolling: '+screen);
      check(await page.locator('.iw-prow').count()===8,'all eight players retained: '+screen);
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
      // Rotation and changing browser chrome must preserve mounted screen state.
      if(touch && (engineName!=='webkit' || resizableViewport)) {
        await show('setup');
        const state=await page.evaluate(()=>JSON.stringify(menus._setup));
        await page.setViewportSize({width:height,height:width});
        // Wait for both the window and CSS media viewport before asserting.
        await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height&&matchMedia(`(width: ${width}px)`).matches&&matchMedia(`(height: ${height}px)`).matches,{width:height,height:width});
        await page.waitForFunction(()=>{const r=document.querySelector('[data-id="start"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;});
        check(await page.locator('[data-id="start"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;}),'start remains visible after rotation');
        check(await page.evaluate(()=>JSON.stringify(menus._setup))===state,'rotation preserves stage, time and match options');
        await page.screenshot({path:path.join(evidence,`${name}-rotated-setup.png`)});
      } else if(touch) {
        // Playwright WebKit mobile emulation changes innerWidth/innerHeight
        // without resizing visualViewport or CSS media queries. Both static
        // orientations run above; a separate resizable-touch run owns rotation.
        entry.rotation={status:'separate-resizable-viewport-check'};
      }
    }
    await context.close();console.log(`${name}: ${entry.checks.length} checks`);
  }
  assert.deepEqual(result.errors,[]);result.status='passed';
}catch(error){
  result.status='failed';result.failure=error.stack;process.exitCode=1;
  if(page&&!page.isClosed()) {
    await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});
    result.layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,nodes:[...document.querySelectorAll('.iw-screen:not(.is-leaving), .s3-setup-scroll, .iw-ss__foot, [data-id="start"]')].map(el=>({cls:el.className,rect:el.getBoundingClientRect().toJSON(),rows:getComputedStyle(el).gridTemplateRows,padding:getComputedStyle(el).padding}))})).catch(()=>null);
  }
}
finally{await context?.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(`${result.status}: ${evidence}`);if(result.failure)console.error(result.failure);}
