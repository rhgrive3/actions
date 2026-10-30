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
// Document overflow propagates to the viewport around the fixed UI root.
// A zero-height BODY box is NOT a clipping rectangle for that fixed subtree.
export function clippingVisibility(element){
 // Compare in each clipping ancestor's local coordinates. A rotated card's
 // viewport bounding box cannot be combined with its untransformed clientWidth.
 const quad=e=>{
  // Hover/focus can add perspective plus X/Y tilt. Keep homogeneous points
  // until they reach the clipping ancestor; an axis-aligned viewport box has
  // already lost the depth needed to undo that transform.
  if(typeof DOMMatrix!=='undefined'){
   const layout=node=>{let x=0,y=0;for(let n=node;n;n=n.offsetParent){x+=n.offsetLeft||0;y+=n.offsetTop||0;if(n.offsetParent){x+=n.offsetParent.clientLeft||0;y+=n.offsetParent.clientTop||0;}}
    for(let n=node?.parentElement;n;n=n.parentElement){x-=n.scrollLeft||0;y-=n.scrollTop||0;}return {x,y};};
   const matrix=node=>{let result=new DOMMatrix();
    for(let n=node;n;n=n.parentElement){const style=getComputedStyle(n),at=layout(n),parentAt=layout(n.parentElement),origin=style.transformOrigin.split(/\s+/).map(parseFloat);
     const length=(value,size)=>String(value).endsWith('%')?parseFloat(value)*size/100:parseFloat(value)||0;
     const translation=(style.translate&&style.translate!=='none'?style.translate:'0 0 0').split(/\s+/),scale=(style.scale&&style.scale!=='none'?style.scale:'1 1 1').split(/\s+/).map(Number);
     const rotation=(style.rotate&&style.rotate!=='none'?style.rotate:'0deg').split(/\s+/),angleText=rotation.pop(),angle=parseFloat(angleText)*(angleText.endsWith('rad')?180/Math.PI:angleText.endsWith('turn')?360:angleText.endsWith('grad')?.9:1);
     let axis=rotation.length===3?rotation.map(Number):rotation[0]==='x'?[1,0,0]:rotation[0]==='y'?[0,1,0]:[0,0,1];
     const individual=new DOMMatrix().translate(length(translation[0],n.offsetWidth),length(translation[1],n.offsetHeight),length(translation[2],0)).rotateAxisAngle(...axis,angle).scale(scale[0],scale[1]??scale[0],scale[2]??1);
     let step=new DOMMatrix().translate(at.x-parentAt.x,at.y-parentAt.y).translate(origin[0]||0,origin[1]||0,origin[2]||0)
      .multiply(individual).multiply(new DOMMatrix(style.transform==='none'?undefined:style.transform)).translate(-(origin[0]||0),-(origin[1]||0),-(origin[2]||0));
     const parent=n.parentElement;if(parent){const ps=getComputedStyle(parent),distance=parseFloat(ps.perspective);
      if(Number.isFinite(distance)&&distance>0){const po=ps.perspectiveOrigin.split(/\s+/).map(parseFloat),perspective=new DOMMatrix();perspective.m34=-1/distance;
       step=new DOMMatrix().translate(po[0]||0,po[1]||0).multiply(perspective).translate(-(po[0]||0),-(po[1]||0)).multiply(step);}}
     result=step.multiply(result);
    }return result;};
   const width=e.offsetWidth,height=e.offsetHeight,raw=matrix(e),outer=e.getBoundingClientRect();
   const project=p=>{if(!Number.isFinite(p.w)||Math.abs(p.w)<1e-9)throw Error('invalid clipping projection');return {x:p.x/p.w,y:p.y/p.w};};
   const corners=[[0,0],[width,0],[width,height],[0,height]],projected=corners.map(([x,y])=>project(raw.transformPoint({x,y,z:0,w:1}))),xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
   // Anchor the composed transform to the browser's measured viewport position.
   // Fixed descendants and containing-block scroll offsets do not follow a
   // simple offsetParent walk. Keep the orientation and homogeneous depth.
   if(Math.abs(Math.max(...xs)-Math.min(...xs)-outer.width)>1.5||Math.abs(Math.max(...ys)-Math.min(...ys)-outer.height)>1.5)throw Error('clipping transform dimensions disagree with browser: '+JSON.stringify({tag:e.tagName,class:e.className,expected:[outer.width,outer.height],actual:[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],width,height}));
   const m=new DOMMatrix().translate(outer.left-Math.min(...xs),outer.top-Math.min(...ys)).multiply(raw),inverse=m.inverse();
   if(![...m.toFloat64Array(),...inverse.toFloat64Array(),width,height].every(Number.isFinite))throw Error('singular clipping transform');
   const points=corners.map(([x,y])=>m.transformPoint({x,y,z:0,w:1}));
   return {points:points.map(p=>({...project(p),homogeneous:p})),local:p=>project(inverse.transformPoint(p.homogeneous||{x:p.x,y:p.y,z:0,w:1}))};
  }
  const outer=e.getBoundingClientRect(),style=getComputedStyle(e);let a=1,b=0,c=0,d=1;
  for(let p=e;p;p=p.parentElement){
   const transform=getComputedStyle(p).transform;
   if(!transform||transform==='none')continue;
   const match=transform.match(/^matrix\(([^)]+)\)$/),flat3d=transform.match(/^matrix3d\(([^)]+)\)$/);
   let values=match?.[1].split(',').map(Number);
   if(flat3d){const m=flat3d[1].split(',').map(Number);if(m.length!==16||![2,3,6,7,8,9,14].every(i=>m[i]===0)||m[10]!==1||m[15]!==1)throw Error('unsupported perspective clipping transform: '+transform);values=[m[0],m[1],m[4],m[5],m[12],m[13]];}
   if(values?.length!==6)throw Error('unsupported clipping transform: '+transform);
   const [pa,pb,pc,pd]=values,next=[pa*a+pc*b,pb*a+pd*b,pa*c+pc*d,pb*c+pd*d];
   if(!next.every(Number.isFinite))throw Error('invalid clipping transform');[a,b,c,d]=next;
  }
  const number=k=>parseFloat(style[k])||0;
  let width=parseFloat(style.width),height=parseFloat(style.height);
  if(Number.isFinite(width)&&style.boxSizing==='content-box')width+=number('paddingLeft')+number('paddingRight')+number('borderLeftWidth')+number('borderRightWidth');
  if(Number.isFinite(height)&&style.boxSizing==='content-box')height+=number('paddingTop')+number('paddingBottom')+number('borderTopWidth')+number('borderBottomWidth');
  if(!Number.isFinite(width))width=e.offsetWidth??outer.width??outer.right-outer.left;
  if(!Number.isFinite(height))height=e.offsetHeight??outer.height??outer.bottom-outer.top;
  const points=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>({x:a*x+c*y,y:b*x+d*y}));
  const x=outer.left-Math.min(...points.map(p=>p.x)),y=outer.top-Math.min(...points.map(p=>p.y)),det=a*d-b*c;
  if(!Number.isFinite(det)||Math.abs(det)<1e-9)throw Error('singular clipping transform');
  return {points:points.map(p=>({x:p.x+x,y:p.y+y})),local:p=>({x:(d*(p.x-x)-c*(p.y-y))/det,y:(a*(p.y-y)-b*(p.x-x))/det})};
 };
 const points=quad(element).points,clippedBy=[];let fixedSubtree=getComputedStyle(element).position==='fixed';
 for(let p=element.parentElement;p;p=p.parentElement){const style=getComputedStyle(p),x=/auto|scroll|hidden|clip/.test(style.overflowX),y=/auto|scroll|hidden|clip/.test(style.overflowY);if(style.position==='fixed')fixedSubtree=true;if(!x&&!y)continue;
  const root=p===document.documentElement||(p===document.body&&fixedSubtree),b=root?{left:0,top:0,right:innerWidth,bottom:innerHeight}:{left:p.clientLeft,top:p.clientTop,right:p.clientLeft+p.clientWidth,bottom:p.clientTop+p.clientHeight};
  const measured=root?points:points.map(quad(p).local);
  const rejectX=x&&measured.some(r=>r.x<b.left-1||r.x>b.right+1),rejectY=y&&measured.some(r=>r.y<b.top-1||r.y>b.bottom+1);
  if(rejectX||rejectY)clippedBy.push({tag:p.tagName,class:String(p.className||''),documentViewport:root,overflow:[style.overflowX,style.overflowY],position:style.position,bounds:b,axes:[rejectX?'x':null,rejectY?'y':null].filter(Boolean)});
 }return {unclipped:clippedBy.length===0,clippedBy};
}
export function groupGlyphLines(glyphs, lineHeight, matrix = {a:1,b:0,c:0,d:1}) {
  if (!(lineHeight > 0 && Number.isFinite(lineHeight))) throw Error('finite positive line-height required');
  const {a,b,c,d} = matrix, determinant = a*d-b*c;
  if (!Number.isFinite(determinant) || Math.abs(determinant)<1e-9) throw Error('invertible card transform required');
  const lines = [];
  for (const [index, glyph] of glyphs.entries()) {
    if (!(glyph.width > 0 && glyph.height > 0)) continue;
    // Project centers through the inverse card 2D linear transform. A global
    // translation/transform-origin adds the same constant to every local Y,
    // so does not affect line identity. This exactly removes native Z tilt.
    const x = (glyph.left || 0) + glyph.width/2, y = glyph.top + glyph.height/2;
    const center = (-b*x+a*y) / determinant;
    const nearest = lines.map(line => ({line,delta:Math.abs(center-line.center)})).sort((a,b)=>a.delta-b.delta)[0];
    // Less than half a physical line: handles native tilt/fallback metrics,
    // but cannot merge successive real rows separated by one line-height.
    let line = nearest?.delta <= lineHeight * .45 ? nearest.line : null;
    if (!line) { line = {center,glyphs:[]}; lines.push(line); }
    line.glyphs.push({index,char:glyph.char,center});
    line.center = line.glyphs.reduce((sum,g)=>sum+g.center,0) / line.glyphs.length;
  }
  return lines.sort((a,b)=>a.center-b.center).map(line=>line.glyphs.sort((a,b)=>a.index-b.index).map(g=>g.char).join(''));
}

export function fixtureHTML({variant,screen,lang}) {
 assert(['baseline','candidate'].includes(variant));assert(SCREENS.includes(screen));assert(['ja','en'].includes(lang));
 const p='/'+variant;
 return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,">
 <link rel="stylesheet" href="${p}/styles/ui.css"><link rel="stylesheet" href="${p}/styles/mobile.css"><link rel="stylesheet" href="${p}/patches/splatoon3/ui.css">
 <style>html,body{margin:0;overflow:hidden;background:#0d1020;touch-action:none}#ui-root{position:fixed;inset:0}</style>
 <script type="importmap">{"imports":{"three":"${p}/vendor/three/build/three.module.js","three/addons/":"${p}/vendor/three/jsm/"}}</script><div id="ui-root"></div>
 <script>window.fixtureGroupGlyphLines=${groupGlyphLines.toString()};window.fixtureClip=${clippingVisibility.toString()};window.fixtureErrors=[];window.fixtureRequests=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));</script>
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
 await page.waitForFunction(()=>!window.menus?.wipe?.running,null,{timeout:8000});
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
 const target=e=>{const r=rect(e),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return {...window.fixtureClip(e),hitOwner:h&&{tag:h.tagName,class:String(h.className?.baseVal||h.className||'')},label:(e.getAttribute('aria-label')||e.textContent||e.placeholder||'').trim(),id:e.dataset.id||e._wid||'',class:e.className,rect:r,inView:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1,hit:!!h&&(e===h||e.contains(h))};};
 const root=document.querySelector('.iw-screen:not(.is-leaving)'),grid=root?.querySelector('.s3-wgrid'),tabs=[...root?.querySelectorAll('.iw-settings__panel .iw-tab')||[]],names=[...root?.querySelectorAll('.iw-wcard:not([hidden]) .iw-wcard__name')||[]];
 return {viewport:[innerWidth,innerHeight],screen:window.menus?.current,language:document.documentElement.lang,touch:document.documentElement.classList.contains('iw-touch'),mock:window.G?.net?.isMock===true,fonts:document.fonts.status,errors:window.fixtureErrors||[],root:root&&{rect:rect(root),client:[root.clientWidth,root.clientHeight],scroll:[root.scrollWidth,root.scrollHeight]},sheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(e=>({href:e.getAttribute('href'),loaded:!!e.sheet&&e.sheet.cssRules.length>0})),targets:[...root?.querySelectorAll('button,input,summary')||[]].filter(visible).map(target),settingsTabRows:[...new Set(tabs.map(e=>Math.round(e.getBoundingClientRect().top)))].length,grid:grid&&{rect:rect(grid),client:[grid.clientWidth,grid.clientHeight],scroll:[grid.scrollWidth,grid.scrollHeight],columns:getComputedStyle(grid).gridTemplateColumns,padding:getComputedStyle(grid).padding},visibleNames:names.filter(e=>{const r=rect(e),g=grid&&rect(grid);return visible(e)&&r.height>0&&r.top>=Math.max(0,g?.top||0)&&r.bottom<=Math.min(innerHeight,g?.bottom||innerHeight);}).map(e=>({text:e.textContent,rect:rect(e),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight],clamp:getComputedStyle(e).webkitLineClamp})),nativeCode:root?.querySelector('.iw-code-input')&&target(root.querySelector('.iw-code-input'))};
 });}
function horizontal(r,w,label){assert(r.left>=-1&&r.right<=w+1,`${label}: horizontal overflow ${JSON.stringify(r)}`);}
function usable(t,viewport,label,initial=false){assert(t&&t.rect.width>=43&&t.rect.height>=43,`${label}: missing/small touch target`);horizontal(t.rect,viewport.width,label);if(initial)assert(t.inView&&t.hit&&t.unclipped,`${label}: initially obscured/offscreen`);}
async function tap(page,selector){const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();await el.tap();await settle(page);}
async function targetNow(locator){return locator.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),scrollOwners=[];for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+1)scrollOwners.push({tag:p.tagName,class:String(p.className||''),top:p.scrollTop,clientHeight:p.clientHeight,scrollHeight:p.scrollHeight});}return {scrollOwners,...window.fixtureClip(e),hitOwner:h&&{tag:h.tagName,class:String(h.className?.baseVal||h.className||'')},rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},inView:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1,hit:!!h&&(e===h||e.contains(h))};});}
export function stickyRevealDelta(target,header){return Math.min(0,target.top-header.bottom-8);}
async function reachable(locator,page,viewport,label){const attempts=[];for(let attempt=0;attempt<4;attempt++){await locator.scrollIntoViewIfNeeded();await settle(page);const t=await targetNow(locator);attempts.push({attempt,...t});if(t.inView&&t.hit&&t.unclipped){usable(t,viewport,label,true);return t;}
 // The drawer's real sticky header is not a viewport clip. Nearest scrolling
 // may place an otherwise visible card underneath it; exercise a normal wheel
 // correction, then keep exactly the same full-box/paint-hit requirements.
 if(t.unclipped&&!t.hit&&/\biw-ldr__head\b/.test(t.hitOwner?.class||'')){const head=page.locator('.iw-ldr:not(.is-leaving) .iw-ldr__head');const b=await head.boundingBox();if(b){const delta=stickyRevealDelta(t.rect,{bottom:b.y+b.height});if(delta<0){await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.wheel(0,delta);attempts.push({kind:'native-wheel-clear-sticky-header',delta,offsetsBefore:t.scrollOwners});await settle(page);}}}
 }throw Error(label+': not reachable after four settled content-visibility corrections: '+JSON.stringify(attempts));}
async function readable(locator,page,viewport,label){const attempts=[];for(let attempt=0;attempt<4;attempt++){await locator.scrollIntoViewIfNeeded();await settle(page);const t=await targetNow(locator);attempts.push(t);if(t.rect.width>0&&t.rect.height>0&&t.inView&&t.hit&&t.unclipped){horizontal(t.rect,viewport.width,label);return t;}}throw Error(label+': complete notice not readable/paint-reachable: '+JSON.stringify(attempts));}
async function cardDetails(locator){return locator.evaluate(card=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const name=card.querySelector('.iw-wcard__name'),kit=card.querySelector('.s3-wkit'),style=getComputedStyle(name),glyphs=[],walker=document.createTreeWalker(name,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode())for(let i=0;i<node.textContent.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(r.width&&r.height)glyphs.push({char:node.textContent[i],left:r.left,top:r.top,width:r.width,height:r.height});}
 const transform=getComputedStyle(card).transform,m=transform==='none'?new DOMMatrixReadOnly():new DOMMatrixReadOnly(transform),lineMatrix={a:m.a,b:m.b,c:m.c,d:m.d};
 return {id:card._wid,name:name.textContent,ariaLabel:card.getAttribute('aria-label'),rect:rect(name),card:rect(card),kit:kit&&rect(kit),client:[name.clientWidth,name.clientHeight],scroll:[name.scrollWidth,name.scrollHeight],font:style.fontSize,lineHeight:style.lineHeight,lineBreak:style.lineBreak,clamp:style.webkitLineClamp,lineMatrix,glyphs,lines:window.fixtureGroupGlyphLines(glyphs,parseFloat(style.lineHeight),lineMatrix)};
 });}
function fullName(n){assert(n.rect.width>0&&n.rect.height>0,'dormant name measured');assert.equal(n.ariaLabel,n.name,'complete accessible name');assert(n.scroll[0]<=n.client[0]+1,`name horizontally clipped: ${n.name}`);assert(n.scroll[1]<=n.client[1]+1,`name vertically clipped: ${n.name}`);assert(!['1','2','3'].includes(n.clamp),`name remains clamped: ${n.name}`);assert.equal(n.lineBreak,'strict');assert(n.rect.bottom<=n.card.bottom+1,`name outside card: ${n.name}`);if(n.kit)assert(n.rect.bottom<=n.kit.top+1,`name overlaps kit: ${n.name}`);assert(n.lines.slice(1).every(l=>!/^\s*ー/.test(l)),`prolonged sound mark begins line: ${n.name} ${JSON.stringify({lines:n.lines,matrix:n.lineMatrix,glyphs:n.glyphs,lineHeight:n.lineHeight})}`);}
async function observeLongNames(page,v,requireFull=false,scope=ACTIVE){
 const found=[];for(const id of ['shooter','s3-shelter-wide-01','s3-shelter-wide-02','s3-spinner-hypershort-01','s3-spinner-downpour-01','charger_scope']){const index=await page.locator(scope+' .iw-wcard').evaluateAll((els,id)=>els.findIndex(e=>e._wid===id),id);assert(index>=0,'missing canonical long-name item '+id);const card=page.locator(scope+' .iw-wcard').nth(index);await reachable(card,page,v,id);const details=await cardDetails(card);if(requireFull)fullName(details);found.push(details);}return found;
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
async function drawerAcceptance(page,v,candidate){
 // Existing canonical loadout cases only: actual UI navigation into MockNet,
 // never a relay, match launch, direct modal injection or screenshot.
 assert([844,1133].includes(v.width),'drawer acceptance outside canonical matrix');
 await tap(page,ACTIVE+' .iw-backbtn');assert.equal(await page.evaluate(()=>menus.current),'main');await tap(page,ACTIVE+' [data-id="online"]');
 const input=page.locator(ACTIVE+' .iw-code-input'),go=page.locator(ACTIVE+' .iw-join__btns .is-go');await reachable(input,page,v,'drawer fixture code');await input.fill('BCEFG');await reachable(go,page,v,'drawer fixture join');await go.tap();
 await page.waitForFunction(()=>menus.current==='lobby'&&G.net.isMock===true&&G.net.state==='lobby',null,{timeout:10000});await settle(page);
 const scope='.iw-ldr:not(.is-leaving)',chip=ACTIVE+' .iw-lob__wchip',open=async()=>{await reachable(page.locator(chip),page,v,'lobby weapon chip');await tap(page,chip);await page.waitForFunction(()=>menus._modal?.classList.contains('iw-ldr'));await settle(page);assert.equal(await page.locator('.iw-ldr').count(),1,'duplicate/stale drawers');};
 const closed=async()=>{await page.waitForFunction(()=>!menus._modal&&!document.querySelector('.iw-ldr'),null,{timeout:5000});await settle(page);assert.equal(await page.evaluate(()=>G.net.state),'lobby','drawer dismissal left room');};
 await open();const columns=await page.locator(scope+' .iw-ldr__grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns);const names=await observeLongNames(page,v,candidate,scope);
 if(candidate)assert(columns.split(/\s+/).map(parseFloat).every(n=>n>=135),'drawer136px grid lost to later CSS');
 const out={columns,names};await reachable(page.locator(scope+' .iw-touch-close'),page,v,'drawer touch close');await tap(page,scope+' .iw-touch-close');await closed();
 if(candidate){
  await open();await page.keyboard.press('Escape');await closed();out.escapeDismissal='passed';
  await open();const last=page.locator(scope+' .iw-wcard').last();await reachable(last,page,v,'drawer last weapon');await readable(last.locator('.iw-wcard__name'),page,v,'drawer last full name');fullName(await cardDetails(last));const id=await last.evaluate(e=>e._wid);await last.tap();await closed();
  await page.waitForFunction(id=>menuState().loadout.weapon===id&&G.net.lobby.players.find(p=>p.you)?.weapon===id,id,{timeout:5000});assert.equal(await page.locator(chip).evaluate(e=>e._wid),id,'lobby weapon chip stale after equip');out.equipped=id;
  await open();const equipped=page.locator(scope+' .iw-wcard.is-equipped');assert.equal(await equipped.count(),1);assert.equal(await equipped.evaluate(e=>e._wid),id,'reopened drawer lost equipped state');await reachable(equipped,page,v,'reopened equipped weapon');fullName(await cardDetails(equipped));await tap(page,scope+' .iw-touch-close');await closed();out.reopen='passed';
 }
 await tap(page,ACTIVE+' .iw-lob__leave');await page.waitForFunction(()=>menus._modal?.classList.contains('iw-modal'));await tap(page,'.iw-modal:not(.is-leaving) [data-id="modal-1"]');await page.waitForFunction(()=>menus.current==='online'&&G.net.state==='offline');await settle(page);assert.equal(await page.locator('.iw-ldr').count(),0);out.roomCleanup='offline';return out;
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
  await input.fill('b0c1e');assert.equal(await input.inputValue(),'BCE','native maxlength precedes sanitizer');await input.fill('bcefg');assert.equal(await input.inputValue(),'BCEFG');await input.press('Backspace');assert.equal(await input.inputValue(),'BCEF');assert.equal(await page.evaluate(()=>G.net.state),'offline','typing autojoined');
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
  await tap(page,ACTIVE+' .iw-backbtn');assert.equal(await page.evaluate(()=>menus.current),'main');await tap(page,ACTIVE+' [data-id="loadout"]');assert.equal(await page.evaluate(()=>menus.current),'loadout');const equipped=page.locator(ACTIVE+' .iw-wcard.is-equipped');assert.equal(await equipped.count(),1);await reachable(equipped,page,v,'equipped after return');out.repeatNavigation='passed';if([844,1133].includes(v.width))out.drawer=await drawerAcceptance(page,v,true);
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
 assert(weapons.baselineDrawer?.columns.split(/\s+/).map(parseFloat).some(n=>n<135),'baseline drawer narrow grid not reproduced');assert(weapons.baselineDrawer?.names.find(n=>n.id==='shooter')?.lines.slice(1).some(l=>/^\s*ー/.test(l)),'baseline drawer orphan prolonged mark not reproduced');
 const improved=find('candidate','main',844,390);assert(visible(improved)>=visible(home)+2,'candidate home useful action visibility did not improve');
 return {home:{baselineVisible:visible(home),candidateVisible:visible(improved)},settingsRows:settings.initial.settingsTabRows,onlineCodeInitiallyInView:online.initial.nativeCode.inView,weaponColumns:weapons.initial.grid.columns,drawerColumns:weapons.baselineDrawer.columns,drawerFirstNameLines:weapons.baselineDrawer.names.find(n=>n.id==='shooter').lines,clippedLongNames:weapons.baselineLongNames.filter(n=>n.clamp==='2'&&n.scroll[1]>n.client[1]+1).map(n=>n.name)};
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
  try{await page.goto(origin+'/frame?'+new URLSearchParams({variant,screen,lang,netmock:'1',mockauto:'0',mocklat:'0',news:'0'}));await settle(page);row.fonts=await requiredFonts(page);assert(row.fonts.every(f=>f.count>0&&f.loaded&&f.check),'required production font unavailable');await settle(page);row.initial=await measure(page);console.log(JSON.stringify({event:'landscape-case-initial',variant,viewport,screen,lang,fonts:row.fonts,root:row.initial.root,settingsTabRows:row.initial.settingsTabRows,grid:row.initial.grid,nativeCode:row.initial.nativeCode,visibleHomeActions:row.initial.targets.filter(t=>/iw-btn--menu/.test(t.class)&&t.inView&&t.hit).length,firstTargets:row.initial.targets.slice(0,2)}));assert.equal(row.initial.screen,screen);assert.equal(row.initial.language,lang);assert(row.initial.mock&&row.initial.touch,'missing real touch profile or offline fixture');assert.equal(row.initial.sheets.length,3);assert(row.initial.sheets.every(s=>s.loaded),'production stylesheet did not load');assert(row.initial.root&&row.initial.targets.length>0,'unloaded empty menu');if(variant==='candidate')row.interactions=await candidateChecks(page,screen,viewport,row.initial);else if(screen==='loadout'){row.baselineLongNames=await observeLongNames(page,viewport);if([844,1133].includes(viewport.width))row.baselineDrawer=await drawerAcceptance(page,viewport,false);}assert.deepEqual(row.resourceErrors,[],'resource/network failure');assert.deepEqual(row.pageErrors,[],'page errors');assert.deepEqual(await page.evaluate(()=>fixtureErrors),[],'fixture errors');row.status=variant==='baseline'?'observed':'passed';}
  catch(e){row.status='failed';row.error=String(e.stack||e);report.errors.push(`${variant}/${screen}/${viewport.width}x${viewport.height}/${lang}: ${e.message}`);console.log(JSON.stringify({event:'landscape-case-failed',variant,viewport,screen,lang,error:row.error,resourceErrors:row.resourceErrors,pageErrors:row.pageErrors}));}
  finally{closing=true;await context.close();save();}
 }}finally{await new Promise(resolve=>server.close(resolve));}
 try{report.baselineReproduction=assertBaselineReproduction(report.cases);}catch(e){report.errors.push(e.message);}
 report.servedFiles=Object.fromEntries([...served].sort());report.status=report.errors.length?'failed':'passed';save();return report;
}
async function main(){const arg=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],'required '+n);return process.argv[i+1];};const outDir=path.resolve(arg('--out')),roots={candidate:path.resolve(arg('--candidate')),baseline:path.resolve(arg('--baseline'))};let browser;try{const require=createRequire(import.meta.url),{chromium}=require('playwright');browser=await launchSandboxBrowser(chromium);const report=await runAcceptance({browser,roots,outDir,baselineSha:arg('--baseline-sha'),candidateSha:arg('--candidate-sha')});console.log(JSON.stringify({status:report.status,cases:report.cases.length,errors:report.errors,outDir}));if(report.status!=='passed')process.exitCode=1;}catch(e){fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'landscape-launch-error.txt'),String(e.stack||e));throw e;}finally{await browser?.close();}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
