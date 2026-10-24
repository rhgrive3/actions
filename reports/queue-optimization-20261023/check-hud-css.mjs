import fs from 'node:fs';
import {chromium} from 'playwright';
import {adaptBuildSource} from '../../scripts/inkwave-source-composition.mjs';
const read=rel=>fs.readFileSync(new URL('../../inkwave-public/'+rel,import.meta.url),'utf8');
const method=(s,start)=>{const a=s.indexOf(start),b=s.indexOf('\n  }\n',a);if(a<0||b<0)throw Error('method anchor');return s.slice(a,b+5);};
const rawHud=read('src/ui/hud.js'),hud=adaptBuildSource('src/ui/hud.js',rawHud);
const rawBoss=read('src/ui/hud-boss.js'),boss=adaptBuildSource('src/ui/hud-boss.js',rawBoss);
const a=hud.indexOf('const QUEUE_TRANSFORMS'),b=hud.indexOf('\n}\n',a);
const inputs={helper:hud.slice(a,b+3),downs:[method(rawHud,'  _updDowns(dt) {'),method(hud,'  _updDowns(dt) {')],nums:[method(rawBoss,'  _updNums() {'),method(boss,'  _updNums() {')]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();const report=await page.evaluate(inputs=>{
  const rows=[];
  for(const kind of ['downs','nums'])for(const hz of [30,60,120])for(const mode of ['visible','hidden','transitions']){
   const G={camera:{}},states=[0,1].map(index=>{
    let writes=0;const dom=[],items=Array.from({length:kind==='downs'?4:6},()=>{
     const el=document.createElement('div');document.body.append(el);dom.push(el);
     const style=new Proxy(el.style,{get:(target,key)=>{const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set:(target,key,value)=>{writes++;return Reflect.set(target,key,value,target);}});
     return {el:{style,classList:el.classList,remove(){el.remove();}},x:0,y:0,z:0,t:0,last:0,born:0,jx:0,w:{}};
    });
    const owner=kind==='downs'?{_downs:items,_project:()=>null}:{S:{nums:items,combo:items[0]},_t:()=>0,_u:()=>10,_screen:()=>null};
    const fn=new Function('G','innerWidth','innerHeight',(index===1?inputs.helper:'')+`return ({${inputs[kind][index]}}).${kind==='downs'?'_updDowns':'_updNums'};`)(G,1280,720);
    return {owner,fn,dom,writes:()=>writes};
   });
   const n=Math.ceil((kind==='downs'?3.1:1.2)*hz);
   for(let tick=0;tick<n;tick++){
    const now=(tick+1)/hz,visible=mode==='visible'||mode==='transitions'&&tick%23<13;
    for(const s of states){
     const p={x:.1,y:-.2,z:visible?0:2,behind:!visible};s.owner._project=()=>p;s.owner._screen=()=>visible?{x:300,y:240}:null;s.owner._t=()=>now;
     if(mode==='transitions'&&tick%37===5){for(const el of s.dom){el.style.opacity='.23';el.style.transform='translateX(3px)';}}
     s.fn.call(s.owner,1/hz);
    }
    for(let i=0;i<states[0].dom.length;i++){
     const x=states[0].dom[i],y=states[1].dom[i];
     if(x.style.cssText!==y.style.cssText||x.className!==y.className||x.isConnected!==y.isConnected)throw Error(JSON.stringify({kind,hz,mode,tick,baseline:x.outerHTML,candidate:y.outerHTML}));
    }
    if(kind==='downs'&&states[0].owner._downs.length!==states[1].owner._downs.length)throw Error('lifetime');
    if(kind==='nums'&&states[0].owner.S.nums.length!==states[1].owner.S.nums.length)throw Error('lifetime');
   }
   rows.push({kind,hz,mode,frames:n,baselineSetters:states[0].writes(),candidateSetters:states[1].writes(),cssMismatches:0});for(const s of states)for(const el of s.dom)el.remove();
  }
  return {browser:navigator.userAgent,scope:'actual composed method bodies and real DOM CSSStyleDeclaration; no GPU/gameplay/device frame-time claim',rows};
 },inputs);fs.writeFileSync(new URL('./hud-css-chromium.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.rows));
}finally{await browser.close();}
