// Actual composed HUD methods and CSS in Chromium. Scene/runner/projection
// inputs are controlled fixtures; this is component QA, not a live-match test.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {parse} from '../patches/loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {applyShotGuide} from '../patches/splatoon3/runtime/weapons-fidelity.mjs';
const root=new URL('../',import.meta.url);
const read=rel=>fs.readFileSync(new URL(rel,root),'utf8');
const source=adaptBuildSource('src/ui/hud.js',read('inkwave-public/src/ui/hud.js'));
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const cls=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.body.body.some(m=>m.key?.name==='_updCrosshair'));
assert(cls,'composed HUD owner');
let executable=source;const imports=[];
for(const n of [...ast.body].reverse()){
 if(n.type==='ImportDeclaration'){imports.push(...n.specifiers.map(s=>[s.local.name,s.imported?.name]));executable=executable.slice(0,n.start)+executable.slice(n.end);}
 else if(n.type==='ExportNamedDeclaration')executable=executable.slice(0,n.start)+(n.declaration?executable.slice(n.declaration.start):executable.slice(n.end));
}
const css=adaptBuildSource('styles/hud.css',read('inkwave-public/styles/hud.css'))+'\n'+read('patches/splatoon3/ui.css');
const splatling=read('patches/local-quality/splatling-reticle.mjs').replaceAll('export function ','function ');
const out=path.resolve(process.argv[2]||'reports/reticle-viewport-20261025');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const rows=[];
try{
 const page=await browser.newPage();
 await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#273b48;color:white;font:14px sans-serif;--u:10px;--self-light:white}*{transition:none!important;animation:none!important}</style>');
 await page.addStyleTag({content:css});
 await page.evaluate(({executable,imports,cls,guide,splatling})=>{
  const local={alive:true,form:'kid',invuln:0,weaponRunner:{charging:true,chargeT:.5,charge:.5},weapon:{}};
  const G={match:{local},camera:{},projectiles:{s3DualiesGuides:()=>[{x:.1,y:.1,z:0},{x:-.13,y:.1,z:0}],s3WeaponGuide:()=>null}};
  const kinds=['shooter','blaster','dualies','slosher','splatling','charger','roller'];
  const WEAPONS=Object.fromEntries(kinds.map(kind=>[kind,{kind,chargeTime:1,firstChargeTime:.5,reticleDelayF:5,special:'slam'}]));
  const values={G,WEAPONS,SUB:{bomb:{inkCost:70}},PLAYER:{},MATCH:{},clamp:(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),
   applyShotGuide:Function('return ('+guide+')')(),updateSplatlingStages:Function(splatling+'\nreturn updateSplatlingStages')(),
   selectedSub:()=> 'bomb',selectedSubCost:()=>70,chargerScopeFactor:()=>0,specialIcon:()=>'',t:s=>s};
  const bindings={...values};for(const [name,origin] of imports)bindings[name]=values[origin]||(()=>{});
  const HUD=Function(...Object.keys(bindings),executable+'\nreturn '+cls)(...Object.values(bindings));
  const el=html=>{const d=document.createElement('div');d.innerHTML=html||'';return d;};
  function make(kind,index){
   local.weapon=WEAPONS[kind];
   const h=Object.assign(Object.create(HUD.prototype),{_L:{},_fxTime:0,_bloom:0,_kick:0,_visible:true,
    ret:el(),hitEl:el('<i></i><i></i><i></i><i></i>'),killEl:el(),xh:el(),spIcon:el(),scopeMask:el(),shield:el(),
    subChip:el('<i></i><span><i></i></span><b></b>'),tank:el(),_restart(){},_live:()=>true,_local:()=>local});
   h.xh.className='iw-xh';h.hitEl.className='iw-hit';h.killEl.className='iw-kill';h.tank.className='iw-tank';h.subChip.className='iw-subaim';
   h.xh.append(h.ret,h.hitEl,h.killEl,h.tank,h.subChip);document.body.append(h.xh);
   const col=index%3,row=Math.floor(index/3);h.xh.style.left=(innerWidth*(col+.5)/3)+'px';h.xh.style.top=(55+row*110)+'px';
   const label=document.createElement('span');label.textContent=kind;label.style.cssText=`position:absolute;left:${innerWidth*(col+.5)/3-40}px;top:${90+row*110}px`;document.body.append(label);
   h._project=(_cam,x,y,z)=>({x,y,z});return h;
  }
  globalThis.viewportProbe={local,G,kinds,WEAPONS,make};
 },{executable,imports,cls:cls.id.name,guide:applyShotGuide.toString(),splatling});
 for(const viewport of [{width:1280,height:720},{width:1024,height:600},{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  const result=await page.evaluate(()=>{
   for(const node of [...document.body.children])if(node.tagName!=='STYLE')node.remove();
   const {local,kinds,WEAPONS,make}=viewportProbe,records=[];
   const center=el=>{const b=el.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height};};
   for(const [index,kind] of kinds.entries()){
    const h=make(kind,index),frame={weapon:kind,charge:.5,crosshair:{spread:0,guide:{x:innerWidth/2+37,y:innerHeight/2-19},
     chargerCurrent:{x:.1,y:.1,z:0},chargerFull:{x:.2,y:-.1,z:0}}};
    h._updCrosshair(frame,1/60);const anchor=center(h.xh),art=center(h.ret.querySelector('svg')),zero=center(h.ret.querySelector('.iw-ret__tick')||h.ret);
    frame.crosshair.spread=18.3;h._updCrosshair(frame,1/120);
    const scale=h._L.reticleScale,expanded=center(h.ret.querySelector('.iw-ret__tick')||h.ret),ret=center(h.ret);
    h.hitMarker('hit',{damage:36});const hit=center(h.hitEl),style=getComputedStyle(h.ret);
    const twins=kind==='dualies'?h._twin.map(center):null;
    const reach=kind==='charger'?['--crx','--cry','--cfx','--cfy'].map(k=>parseFloat(h.ret.style.getPropertyValue(k))*scale):null;
    records.push({kind,scale,art,anchor,ret,hit,zero,expanded,twins,reach,spread:h._L.spread,cssSpread:+h.ret.style.getPropertyValue('--sp'),transform:style.transform,tank:center(h.tank)});
    if(kind==='shooter')viewportProbe.resized=h;
   }
   return records;
  });
  for(const row of result){
   const scale=Math.min(1,Math.max(.5,Math.min(viewport.height/720,viewport.width/1280)));
   assert.equal(row.scale,scale);assert.ok(Math.abs(row.art.width-80*scale)<.03,`${row.kind}: SVG art scale`);
   assert.ok(Math.abs(row.ret.x-row.anchor.x-37)<.03&&Math.abs(row.ret.y-row.anchor.y+19)<.03,'projected guide remains in screen pixels');
   assert.ok(Math.abs(row.hit.x-row.ret.x)<.03&&Math.abs(row.hit.y-row.ret.y)<.03,'confirmed hit follows projected position');
   if(row.kind==='shooter')assert.ok(Math.abs(Math.abs(row.expanded.x-row.zero.x)-18.3)<.07,'projected spread must not shrink twice');
   if(row.twins){
    for(const [i,x] of [.1,-.13].entries())assert.ok(Math.abs(row.twins[i].x-row.ret.x-x*viewport.width/2)<.04,'dualies guide remains at projected impact');
   }
   if(row.reach){const expected=[.1*viewport.width/2,-.1*viewport.height/2,.2*viewport.width/2,.1*viewport.height/2];row.reach.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.06,'charger reach remains at projected impact'));}
  }
  rows.push({viewport,result});
  await page.screenshot({path:path.join(out,`reticles-${viewport.width}x${viewport.height}.png`)});
 }
 // Resize the same dirty-checked HUD while spread stays unchanged.
 await page.setViewportSize({width:844,height:390});
 const resized=await page.evaluate(()=>{const h=viewportProbe.resized;h._updCrosshair({weapon:'shooter',crosshair:{spread:18.3}},1/60);return{scale:h._L.reticleScale,sp:+h.ret.style.getPropertyValue('--sp'),raw:h._L.spread};});
 assert.ok(Math.abs(resized.sp*resized.scale-18.3)<.06);assert.equal(resized.raw,18.3);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({kind:'composed HUD component browser QA',rows,resized},null,2)+'\n');
 console.log(JSON.stringify({pass:true,viewports:rows.length,weaponViews:rows.reduce((n,r)=>n+r.result.length,0),out}));
}finally{await browser.close();}
