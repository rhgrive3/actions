#!/usr/bin/env node
// Bounded menu-only regression against two ACTUAL production build outputs.
// No screenshots, videos, room relay, gameplay or insecure browser fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {launchSandboxBrowser} from './lib/inkwave-sandbox-browser.mjs';
import {responsiveAnimationsSettled} from './lib/inkwave-responsive-animation-settle.mjs';
import {assertLandscapeWeaponHeader} from './lib/assert-landscape-weapon-header.mjs';

export const VIEWPORTS=[{width:844,height:390},{width:1133,height:744},{width:740,height:360},{width:915,height:412}];
const SCREENS=['main','settings','loadout','online'];
const ACTIVE='.iw-screen:not(.is-leaving)';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const REQUIRED=['styles/ui.css','styles/mobile.css','patches/splatoon3/ui.css','src/ui/menus.js','src/net/mock.js','patches/splatoon3/runtime/install.mjs','patches/splatoon3/profile.json','assets/fonts/TitanOne-latin.woff2','assets/fonts/Rubik-latin.woff2'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function fixtureHTML({variant,screen,lang}) {
 assert(['baseline','candidate'].includes(variant));assert(SCREENS.includes(screen));assert(['ja','en'].includes(lang));
 const p='/'+variant;
 return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,">
 <link rel="stylesheet" href="${p}/styles/ui.css"><link rel="stylesheet" href="${p}/styles/mobile.css"><link rel="stylesheet" href="${p}/patches/splatoon3/ui.css">
 <style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}#ui-root{position:fixed;inset:0}</style>
 <script type="importmap">{"imports":{"three":"${p}/vendor/three/build/three.module.js","three/addons/":"${p}/vendor/three/jsm/"}}</script><div id="ui-root"></div>
 <script>window.fixtureErrors=[];window.fixtureRequests=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));</script>
 <script type="module">
 localStorage.setItem('inkwave.settings',JSON.stringify({lang:'${lang}'}));
 const [{Menus},{G},{MockNet},config,{install},{LANG},{localizeGameContent}]=await Promise.all([import('${p}/src/ui/menus.js'),import('${p}/src/core/ctx.js'),import('${p}/src/net/mock.js'),import('${p}/src/config.js'),import('${p}/patches/splatoon3/runtime/install.mjs'),import('${p}/src/i18n.js'),import('${p}/patches/splatoon3/runtime/content-language.mjs')]);
 const tuning=await(await fetch('${p}/patches/splatoon3/profile.json')).json();install(tuning);localizeGameContent({...config,LANG});
 let settings={...config.DEFAULT_SETTINGS,lang:'${lang}'},profile={name:'Test Squidkid',level:5,xp:1200},loadout={weapon:'shooter'};
 G.settings=settings;G.net=new MockNet();window.G=G;window.menuState=()=>({settings,profile,loadout});
 for(const method of ['create','join']){const original=G.net[method].bind(G.net);G.net[method]=(...args)=>{const row={method,args,state:'pending'};fixtureRequests.push(row);const promise=original(...args);promise.then(()=>row.state='fulfilled',()=>row.state='rejected');return promise;};}
 window.menus=new Menus(document.getElementById('ui-root'),{getSettings:()=>settings,setSetting:(k,v)=>settings[k]=v,setSettings:v=>{settings={...v};G.settings=settings},getProfile:()=>profile,setProfile:v=>Object.assign(profile,v),setProfileName:v=>profile.name=v,setProfileStyle:v=>profile.style={...v},getLoadout:()=>loadout,setLoadout:v=>Object.assign(loadout,v)});
 menus.setInputMode('touch');
 window.addEventListener('keydown',e=>{if(menus.handleKey(e)&&document.activeElement?.tagName!=='INPUT')e.preventDefault()});
 menus.show('${screen}',{wipe:false,light:false,force:true});window.menuReady=true;
 </script></html>`;
}
export function createFixtureServer(roots, served=new Map()) {
 return http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/frame'){const html=fixtureHTML(Object.fromEntries(['variant','screen','lang'].map(k=>[k,url.searchParams.get(k)])));res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}
  const m=url.pathname.match(/^\/(baseline|candidate)\/(.+)$/);assert(m,'unknown route');
  const [,variant,relative]=m,root=path.resolve(roots[variant]),file=path.resolve(root,decodeURIComponent(relative));
  assert(file.startsWith(root+path.sep),'unsafe path');const bytes=fs.readFileSync(file);served.set(variant+'/'+relative,{sha256:sha(bytes),bytes:bytes.length});
  res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
 }catch(e){res.writeHead(404,{'content-type':'text/plain'});res.end('Fixture resource unavailable: '+e.message);}});
}
async function settle(page){
 await page.waitForFunction(()=>window.menuReady===true,null,{timeout:20000});
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>!document.querySelector('.iw-screen.is-leaving'),null,{timeout:5000});
 await page.waitForFunction(responsiveAnimationsSettled,null,{timeout:15000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function requiredFonts(page){
 return page.evaluate(async()=>{const results=[];for(const [font,text]of [['400 18px "Titan One"','Play'],['700 14px "Rubik"','Loadout'],['400 18px "IW JP Display"','ブキー'],['700 14px "IW JP Body"','ブキー']]){
  const faces=await document.fonts.load(font,text);results.push({font,count:faces.length,loaded:faces.every(f=>f.status==='loaded'),check:document.fonts.check(font,text)});
 }return results;});
}
async function measure(page){return page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.hidden;
 const target=e=>{const r=rect(e),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);let unclipped=true;for(let p=e.parentElement;p;p=p.parentElement){const cs=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(cs.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))unclipped=false;if(/auto|scroll|hidden|clip/.test(cs.overflowX)&&(r.left<b.left-1||r.right>b.right+1))unclipped=false;}return {unclipped,label:(e.getAttribute('aria-label')||e.textContent||e.placeholder||'').trim(),id:e.dataset.id||e._wid||'',class:e.className,rect:r,inView:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1,hit:!!h&&(e===h||e.contains(h))};};
 const root=document.querySelector('.iw-screen:not(.is-leaving)'),grid=root?.querySelector('.s3-wgrid'),tabs=[...root?.querySelectorAll('.iw-settings__panel .iw-tab')||[]],names=[...root?.querySelectorAll('.iw-wcard:not([hidden]) .iw-wcard__name')||[]];
 return {viewport:[innerWidth,innerHeight],screen:window.menus?.current,language:document.documentElement.lang,touch:document.documentElement.classList.contains('iw-touch'),mock:window.G?.net?.isMock===true,fonts:document.fonts.status,errors:window.fixtureErrors||[],root:root&&{rect:rect(root),client:[root.clientWidth,root.clientHeight],scroll:[root.scrollWidth,root.scrollHeight]},sheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(e=>({href:e.getAttribute('href'),loaded:!!e.sheet&&e.sheet.cssRules.length>0})),targets:[...root?.querySelectorAll('button,input,summary')||[]].filter(visible).map(target),settingsTabRows:[...new Set(tabs.map(e=>Math.round(e.getBoundingClientRect().top)))].length,grid:grid&&{rect:rect(grid),client:[grid.clientWidth,grid.clientHeight],scroll:[grid.scrollWidth,grid.scrollHeight],columns:getComputedStyle(grid).gridTemplateColumns,padding:getComputedStyle(grid).padding},visibleNames:names.filter(e=>{const r=rect(e),g=grid&&rect(grid);return visible(e)&&r.height>0&&r.top>=Math.max(0,g?.top||0)&&r.bottom<=Math.min(innerHeight,g?.bottom||innerHeight);}).map(e=>({text:e.textContent,rect:rect(e),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight],clamp:getComputedStyle(e).webkitLineClamp})),nativeCode:root?.querySelector('.iw-code-input')&&target(root.querySelector('.iw-code-input'))};
 });}
function horizontal(r,w,label){assert(r.left>=-1&&r.right<=w+1,`${label}: horizontal overflow ${JSON.stringify(r)}`);}
function usable(t,viewport,label,initial=false){assert(t&&t.rect.width>=43&&t.rect.height>=43,`${label}: missing/small touch target`);horizontal(t.rect,viewport.width,label);if(initial)assert(t.inView&&t.hit&&t.unclipped,`${label}: initially obscured/offscreen`);}
async function tap(page,selector){const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();await el.tap();await settle(page);}
async function targetNow(locator){return locator.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);let unclipped=true;for(let p=e.parentElement;p;p=p.parentElement){const cs=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(cs.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))unclipped=false;if(/auto|scroll|hidden|clip/.test(cs.overflowX)&&(r.left<b.left-1||r.right>b.right+1))unclipped=false;}return {unclipped,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},inView:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1,hit:!!h&&(e===h||e.contains(h))};});}
async function reachable(locator,page,viewport,label){for(let attempt=0;attempt<4;attempt++){await locator.scrollIntoViewIfNeeded();await settle(page);const t=await targetNow(locator);if(t.inView&&t.hit&&t.unclipped){usable(t,viewport,label,true);return t;}}throw Error(label+': not reachable after four settled content-visibility corrections');}
async function readable(locator,page,viewport,label){for(let attempt=0;attempt<4;attempt++){await locator.scrollIntoViewIfNeeded();await settle(page);const t=await targetNow(locator);const unclipped=await locator.evaluate(e=>{const r=e.getBoundingClientRect();for(let p=e.parentElement;p;p=p.parentElement){const cs=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(cs.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))return false;if(/auto|scroll|hidden|clip/.test(cs.overflowX)&&(r.left<b.left-1||r.right>b.right+1))return false;}return true;});if(t.rect.width>0&&t.rect.height>0&&t.inView&&t.hit&&unclipped){horizontal(t.rect,viewport.width,label);return t;}}throw Error(label+': complete notice not readable/paint-reachable');}
async function cardDetails(locator){return locator.evaluate(card=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const name=card.querySelector('.iw-wcard__name'),kit=card.querySelector('.s3-wkit'),style=getComputedStyle(name),lines=new Map(),walker=document.createTreeWalker(name,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode())for(let i=0;i<node.textContent.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(r.width&&r.height){const y=Math.round(r.top*2)/2;lines.set(y,(lines.get(y)||'')+node.textContent[i]);}}
 return {id:card._wid,name:name.textContent,ariaLabel:card.getAttribute('aria-label'),rect:rect(name),card:rect(card),kit:kit&&rect(kit),client:[name.clientWidth,name.clientHeight],scroll:[name.scrollWidth,name.scrollHeight],font:style.fontSize,lineHeight:style.lineHeight,lineBreak:style.lineBreak,clamp:style.webkitLineClamp,lines:[...lines.values()]};
 });}
function fullName(n){assert(n.rect.width>0&&n.rect.height>0,'dormant name measured');assert.equal(n.ariaLabel,n.name,'complete accessible name');assert(n.scroll[0]<=n.client[0]+1,`name horizontally clipped: ${n.name}`);assert(n.scroll[1]<=n.client[1]+1,`name vertically clipped: ${n.name}`);assert(!['1','2','3'].includes(n.clamp),`name remains clamped: ${n.name}`);assert.equal(n.lineBreak,'strict');assert(n.rect.bottom<=n.card.bottom+1,`name outside card: ${n.name}`);if(n.kit)assert(n.rect.bottom<=n.kit.top+1,`name overlaps kit: ${n.name}`);assert(n.lines.slice(1).every(l=>!/^\s*ー/.test(l)),`prolonged sound mark begins line: ${n.name}`);}
async function observeLongNames(page,v,requireFull=false){
 const found=[];for(const id of ['shooter','s3-shelter-wide-01','s3-shelter-wide-02','s3-spinner-hypershort-01','s3-spinner-downpour-01','charger_scope']){const index=await page.locator(ACTIVE+' .iw-wcard').evaluateAll((els,id)=>els.findIndex(e=>e._wid===id),id);assert(index>=0,'missing canonical long-name item '+id);const card=page.locator(ACTIVE+' .iw-wcard').nth(index);await reachable(card,page,v,id);const details=await cardDetails(card);if(requireFull)fullName(details);found.push(details);}return found;
}
async function warmGrid(page,viewport){
 const grid=page.locator(ACTIVE+' .s3-wgrid');await grid.scrollIntoViewIfNeeded();await settle(page);const samples=[];
 for(let step=0;step<96;step++){
  const a=await grid.evaluate(e=>({top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight}));samples.push(a);
  const last=samples.at(-2);if(a.top+a.client>=a.height-2&&last&&Math.abs(a.height-last.height)<1&&Math.abs(a.top-last.top)<1)return {steps:step,samples:samples.slice(-4)};
  const r=await grid.boundingBox();await page.mouse.move(Math.max(2,Math.min(viewport.width-2,r.x+r.width/2)),Math.max(2,Math.min(viewport.height-12,r.y+r.height/2)));await page.mouse.wheel(0,Math.max(80,a.client*.8));await settle(page);
 }
 throw Error('native grid warmup did not establish stable bottom within catalogue-bounded96 steps');
}
async function candidateChecks(page,screen,v,initial){
 const out={};assert.equal(initial.fonts,'loaded');assert(initial.mock&&initial.touch,'production touch profile/MockNet missing');assert.deepEqual(initial.errors,[]);assert(initial.root&&initial.targets.length>0,'empty page');assert(initial.root.scroll[0]<=initial.root.client[0]+1,'screen horizontal scroll');
 if(screen==='main'){
  const buttons=page.locator(ACTIVE+' .iw-main__menu button');assert.equal(await buttons.count(),7);out.initialVisibleActions=initial.targets.filter(t=>/iw-btn--menu/.test(t.class)&&t.inView&&t.hit).length;
  for(let i=0;i<7;i++)await reachable(buttons.nth(i),page,v,'home action'+i);
  for(let repeat=0;repeat<2;repeat++){await tap(page,ACTIVE+' [data-id="settings"]');assert.equal(await page.evaluate(()=>menus.current),'settings');await tap(page,ACTIVE+' .iw-backbtn');assert.equal(await page.evaluate(()=>menus.current),'main');}
  if(v.height<=500){await page.evaluate(()=>{const root=document.querySelector('.iw-screen:not(.is-leaving)');root.scrollTop=0;menus._setFocus(root.querySelector('[data-id="play"]'),{snap:true});});await settle(page);await page.keyboard.press('ArrowRight');await settle(page);assert.equal(await page.evaluate(()=>menus._focus?.dataset.id),'online','two-column spatial Right');await page.keyboard.press('Enter');await page.waitForFunction(()=>menus.current==='online');await settle(page);await page.keyboard.press('Escape');await page.waitForFunction(()=>menus.current==='main');await settle(page);}
  out.repeatNavigation='passed';
 }
 if(screen==='settings'){
  const tabs=page.locator(ACTIVE+' .iw-tab');assert.equal(await tabs.count(),5);if(v.height<=500)assert.equal(initial.settingsTabRows,1,'settings tabs wrap');
  for(let i=0;i<5;i++){await reachable(tabs.nth(i),page,v,'settings tab'+i);await tabs.nth(i).tap();await settle(page);assert.equal(await tabs.nth(i).getAttribute('aria-pressed'),'true');assert.equal(await page.locator(ACTIVE+' .iw-tab[aria-pressed="true"]').count(),1);}
  await reachable(page.locator(ACTIVE+' [data-id="reset"]'),page,v,'settings reset');out.tabs='5 selected/reachable';
 }
 if(screen==='online'){
  const input=page.locator(ACTIVE+' .iw-code-input'),go=page.locator(ACTIVE+' .iw-join__btns .is-go');assert.equal(await input.count(),1);if(v.height<=500){usable(initial.nativeCode,v,'native code',true);usable(initial.targets.find(t=>/iw-minibtn/.test(t.class)&&/is-go/.test(t.class)),v,'join',true);}
  await input.fill('b0c1ewfG');assert.equal(await input.inputValue(),'BCEFG');await input.press('Backspace');assert.equal(await input.inputValue(),'BCEF');assert.equal(await page.evaluate(()=>G.net.state),'offline','typing autojoined');
  out.errors=[];for(const code of ['ZZZZZ','FULLY','BUZYY','NETXX']){await input.fill(code);await reachable(go,page,v,'join action');await go.tap();await page.waitForFunction(()=>document.querySelector('.iw-jstat.is-on')&&G.net.state==='error',null,{timeout:7000});await settle(page);assert.equal(await page.evaluate(()=>G.net.error),({ZZZZZ:'Room not found',FULLY:'Room is full',BUZYY:'Match in progress',NETXX:'Could not connect'})[code],'wrong mock error for '+code);await reachable(input,page,v,'code after '+code);assert.equal(await input.isDisabled(),false);const notice=await readable(page.locator(ACTIVE+' .iw-jstat.is-on'),page,v,'error notice '+code);const text=await page.locator(ACTIVE+' .iw-jstat__txt').innerText();assert(text.trim().length>5);assert((await page.locator(ACTIVE+' .iw-jstat__txt b').innerText()).trim());assert((await page.locator(ACTIVE+' .iw-jstat__txt span').innerText()).trim());out.errors.push({code,text,notice});await input.fill('BCE');await settle(page);assert.equal(await page.locator(ACTIVE+' .iw-jstat.is-on').count(),0);}
  for(let i=0;i<2;i++){await tap(page,ACTIVE+' .iw-backbtn');assert.equal(await page.evaluate(()=>menus.current),'main');await tap(page,ACTIVE+' [data-id="online"]');assert.equal(await page.evaluate(()=>menus.current),'online');await input.fill('ZZZZZ');await reachable(go,page,v,'reopened join');await go.tap();await page.waitForFunction(()=>document.querySelector('.iw-jstat.is-on')&&G.net.state==='error',null,{timeout:7000});await settle(page);await readable(page.locator(ACTIVE+' .iw-jstat.is-on'),page,v,'reopened error notice');assert.equal(await page.evaluate(()=>fixtureRequests.length),5+i,'reopen duplicate room handlers');}
  const requests=await page.evaluate(()=>fixtureRequests);assert.equal(requests.length,6,'duplicate room handlers');assert(requests.every(r=>r.state==='rejected'),'unsettled mock error');out.repeatNavigation='passed';
 }
 if(screen==='loadout'){
  out.header=await assertLandscapeWeaponHeader(page,v);
  const grid=initial.grid;assert(grid,'production catalogue decorator missing');const columns=grid.columns.split(/\s+/).map(parseFloat);assert(columns.every(n=>n>=135),'136px grid defeated by later sheet');assert(initial.visibleNames.length>=columns.length,'less than one complete initially useful name row');out.initialRows=initial.visibleNames.length/columns.length;out.names=[];
  out.names=await observeLongNames(page,v,true);
  out.warmup=await warmGrid(page,v);const allCards=page.locator(ACTIVE+' .iw-wcard:not([hidden])');await reachable(allCards.last(),page,v,'last catalogue item');
  const filters=page.locator(ACTIVE+' .s3-wfilter__tab');assert(await filters.count()>=10,'empty/incomplete class filters');out.categories=[];
  for(let i=0;i<await filters.count();i++){const tab=filters.nth(i);await reachable(tab,page,v,'category'+i);await tab.tap();await settle(page);assert.equal(await tab.getAttribute('aria-selected'),'true');assert.equal(await page.locator(ACTIVE+' .s3-wfilter__tab[aria-selected="true"]').count(),1);const cards=page.locator(ACTIVE+' .iw-wcard:not([hidden])');assert(await cards.count()>0,'empty category');const card=cards.last();await reachable(card,page,v,'category last'+i);await card.tap();await settle(page);const id=await card.evaluate(e=>e._wid);assert.equal(await page.evaluate(()=>menuState().loadout.weapon),id);fullName(await cardDetails(card));out.categories.push({name:await tab.innerText(),equipped:id});}
  await tap(page,ACTIVE+' .iw-backbtn');assert.equal(await page.evaluate(()=>menus.current),'main');await tap(page,ACTIVE+' [data-id="loadout"]');assert.equal(await page.evaluate(()=>menus.current),'loadout');const equipped=page.locator(ACTIVE+' .iw-wcard.is-equipped');assert.equal(await equipped.count(),1);await reachable(equipped,page,v,'equipped after return');out.repeatNavigation='passed';
 }
 return out;
}
export function assertBaselineReproduction(cases){
 const find=(variant,screen,w,h,lang='ja')=>cases.find(c=>c.variant===variant&&c.screen===screen&&c.viewport.width===w&&c.viewport.height===h&&c.lang===lang);
 const home=find('baseline','main',844,390),settings=find('baseline','settings',844,390),online=find('baseline','online',844,390),weapons=find('baseline','loadout',1133,744);
 assert(home?.initial&&settings?.initial&&online?.initial&&weapons?.initial,'missing canonical baseline cases');
 const visible=c=>c.initial.targets.filter(t=>/iw-btn--menu/.test(t.class)&&t.inView&&t.hit).length;
 assert(visible(home)<7,'baseline home waste/hidden actions not reproduced');assert(settings.initial.settingsTabRows>1,'baseline settings tab wrap not reproduced');assert(online.initial.nativeCode&&!online.initial.nativeCode.inView,'baseline code visibility defect not reproduced');
 assert(weapons.initial.grid.columns.split(/\s+/).map(parseFloat).some(n=>n<135),'baseline narrow grid not reproduced');assert(weapons.initial.visibleNames.some(n=>n.clamp==='2'),'baseline clipped-name policy not reproduced');assert(weapons.baselineLongNames?.some(n=>n.clamp==='2'&&n.scroll[1]>n.client[1]+1),'baseline actual long-name clipping not reproduced');
 const improved=find('candidate','main',844,390);assert(visible(improved)>=visible(home)+2,'candidate home useful action visibility did not improve');
 return {home:{baselineVisible:visible(home),candidateVisible:visible(improved)},settingsRows:settings.initial.settingsTabRows,onlineCodeInitiallyInView:online.initial.nativeCode.inView,weaponColumns:weapons.initial.grid.columns,clippedLongNames:weapons.baselineLongNames.filter(n=>n.clamp==='2'&&n.scroll[1]>n.client[1]+1).map(n=>n.name)};
}
export async function runAcceptance({browser,roots,outDir,baselineSha,candidateSha}){
 fs.mkdirSync(outDir,{recursive:true});const report={kind:'production-packaged-menu-dom-offline-fixture',realDeviceVerified:false,screenshots:false,baselineSha,candidateSha,cases:[],errors:[],claimsExcluded:['Full-game boot','Gameplay','Real device','Virtual-keyboard occlusion']};
 for(const [variant,root]of Object.entries(roots))for(const relative of REQUIRED)assert(fs.statSync(path.join(root,relative)).size>0,variant+' missing required packaged resource '+relative);
 const served=new Map(),server=createFixtureServer(roots,served);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
 const save=()=>fs.writeFileSync(path.join(outDir,'landscape-result.json'),JSON.stringify(report,null,2)+'\n');
 try{for(const variant of ['baseline','candidate'])for(const viewport of VIEWPORTS)for(const screen of SCREENS)for(const lang of screen==='loadout'&&[844,1133].includes(viewport.width)?['ja','en']:['ja']){
  const row={variant,viewport,screen,lang,status:'running',resourceErrors:[],pageErrors:[]};report.cases.push(row);save();const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,reducedMotion:'reduce'});let closing=false;
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(!['data:','blob:'].includes(u.protocol)&&u.origin!==origin){row.resourceErrors.push('external request blocked: '+u.origin+u.pathname);await route.abort();}else await route.continue();});
  await context.routeWebSocket('**/*',async ws=>{row.resourceErrors.push('unexpected websocket intercepted before connection');await ws.close();});
  const page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));page.on('websocket',ws=>row.resourceErrors.push('unexpected websocket '+ws.url()));page.on('requestfailed',r=>{if(!closing)row.resourceErrors.push(r.url()+': '+r.failure()?.errorText);});page.on('response',r=>{if(r.status()>=400)row.resourceErrors.push(r.status()+' '+r.url());});
  try{await page.goto(origin+'/frame?'+new URLSearchParams({variant,screen,lang,netmock:'1',mockauto:'0',mocklat:'0',news:'0'}));await settle(page);row.fonts=await requiredFonts(page);assert(row.fonts.every(f=>f.count>0&&f.loaded&&f.check),'required production font unavailable');await settle(page);row.initial=await measure(page);assert.equal(row.initial.screen,screen);assert.equal(row.initial.language,lang);assert(row.initial.mock&&row.initial.touch,'missing real touch profile or offline fixture');assert.equal(row.initial.sheets.length,3);assert(row.initial.sheets.every(s=>s.loaded),'production stylesheet did not load');assert(row.initial.root&&row.initial.targets.length>0,'unloaded empty menu');if(variant==='candidate')row.interactions=await candidateChecks(page,screen,viewport,row.initial);else if(screen==='loadout')row.baselineLongNames=await observeLongNames(page,viewport);assert.deepEqual(row.resourceErrors,[],'resource/network failure');assert.deepEqual(row.pageErrors,[],'page errors');assert.deepEqual(await page.evaluate(()=>fixtureErrors),[],'fixture errors');row.status=variant==='baseline'?'observed':'passed';}
  catch(e){row.status='failed';row.error=String(e.stack||e);report.errors.push(`${variant}/${screen}/${viewport.width}x${viewport.height}/${lang}: ${e.message}`);}
  finally{closing=true;await context.close();save();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
 try{report.baselineReproduction=assertBaselineReproduction(report.cases);}catch(e){report.errors.push(e.message);}
 report.servedFiles=Object.fromEntries([...served].sort());report.status=report.errors.length?'failed':'passed';save();return report;
}
async function main(){const arg=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],'required '+n);return process.argv[i+1];};const outDir=path.resolve(arg('--out')),roots={candidate:path.resolve(arg('--candidate')),baseline:path.resolve(arg('--baseline'))};let browser;try{const require=createRequire(import.meta.url),{chromium}=require('playwright');browser=await launchSandboxBrowser(chromium);const report=await runAcceptance({browser,roots,outDir,baselineSha:arg('--baseline-sha'),candidateSha:arg('--candidate-sha')});console.log(JSON.stringify({status:report.status,cases:report.cases.length,errors:report.errors,outDir}));if(report.status!=='passed')process.exitCode=1;}catch(e){fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'landscape-launch-error.txt'),String(e.stack||e));throw e;}finally{await browser?.close();}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
