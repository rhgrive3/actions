import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const source=fs.readFileSync(new URL('../layout-sample.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
try {
 const page=await browser.newPage({viewport:{width:1024,height:768}});
 await page.setContent('<style>body{margin:0} #parent{position:absolute;width:90%;height:90%;top:12px;left:8px} #layer{position:absolute;inset:0}canvas{position:absolute;width:80%;height:70%;top:10%;left:5%}.other{position:absolute;width:3px;height:3px}</style><div id="parent"><canvas></canvas><div id="layer"><svg id="ignored"></svg></div></div>');
 const result=await page.evaluate(async source=>{
  const LayoutSample=new Function(source+';return LayoutSample;')();
  const layer=document.querySelector('#layer'),canvas=document.querySelector('canvas'),ignored=document.querySelector('#ignored'),parent=document.querySelector('#parent');
  const old=new LayoutSample(layer,ignored),rects=(l,c)=>[l.left,l.top,l.width,l.height,c.left,c.top,c.width,c.height];
  let reads=0;const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){reads++;return rect.call(this)};
  let queries=0;const animation=Element.prototype.getAnimations;Element.prototype.getAnimations=function(...args){queries++;return animation.apply(this,args)};
  const before=()=>{old.begin();return rects(old.rect(layer),old.rect(canvas));},after=()=>rects(layer.getBoundingClientRect(),canvas.getBoundingClientRect());
  const equal=(a,b)=>a.every((x,i)=>Object.is(x,b[i]));let comparisons=0,mismatches=0;
  for(const kind of ['static','parent-transform','canvas-transform','sibling-width','scroll','zoom']){
   const sibling=document.createElement('div');parent.prepend(sibling);sibling.style.cssText='height:4px;width:1px';
   let moving;if(kind==='parent-transform')moving=parent.animate([{transform:'translate(0px,0px)'},{transform:'translate(120px,32px)'}],{duration:500,fill:'both'});
   if(kind==='canvas-transform')moving=canvas.animate([{transform:'scale(1)'},{transform:'scale(.7)'}],{duration:500,fill:'both'});
   if(kind==='sibling-width')moving=sibling.animate([{width:'1px'},{width:'60px'}],{duration:500,fill:'both'});
   for(let n=0;n<12;n++){
    if(moving){moving.pause();moving.currentTime=n*40;moving.play();}
    if(kind==='scroll')parent.scrollTop=n;
    if(kind==='zoom')parent.style.zoom=String(1+n*.01);
    const a=before(),b=after();comparisons++;if(!equal(a,b))mismatches++;
   }
   moving?.cancel();sibling.remove();parent.style.zoom='';
  }
  const timings=[];
  for(const count of [0,1,20,100]){
   const elements=[],animations=[];for(let i=0;i<count;i++){const el=document.createElement('div');el.className='other';document.body.append(el);elements.push(el);animations.push(el.animate([{opacity:.2},{opacity:.8}],{duration:1000,iterations:Infinity}));}
   before();after();const phases=[];
   for(let run=0;run<5;run++)for(const [mode,fn]of [['before',before],['after',after]]){
    reads=queries=0;const start=performance.now();for(let i=0;i<5000;i++)fn();phases.push({mode,milliseconds:performance.now()-start,reads,queries});
   }
   timings.push({count,phases});for(const a of animations)a.cancel();for(const e of elements)e.remove();
  }
  old.dispose();Element.prototype.getBoundingClientRect=rect;Element.prototype.getAnimations=animation;
  return {comparisons,mismatches,timings};
 },source);
 result.browser=await browser.version();result.conditions='Headless Chromium comparison; two live geometry reads replace document enumeration only for Tenta. Device FPS/energy unmeasured.';
 if(process.env.QA_REPORT)fs.writeFileSync(process.env.QA_REPORT,JSON.stringify(result,null,2));
 assert.equal(result.mismatches,0);console.log(JSON.stringify({comparisons:result.comparisons,mismatches:result.mismatches,browser:result.browser,timings:result.timings.map(x=>({animations:x.count,before:x.phases.filter(p=>p.mode==='before').map(p=>p.milliseconds),after:x.phases.filter(p=>p.mode==='after').map(p=>p.milliseconds)}))}));
}finally{await browser.close();}
