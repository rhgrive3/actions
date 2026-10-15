#!/usr/bin/env node
// Controlled native Chromium/WebKit CSSOM comparison of the actual compiled
// INKWAVE lobby loop; this is DOM acceptance, not a whole-game FPS measurement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { adaptBuildSource } from './inkwave-source-composition.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const raw=fs.readFileSync(path.join(root,'inkwave-public/src/ui/menus.js'),'utf8');
function updateBlock(source) {
  const start=source.indexOf('          const bots = lob.bots !== false;\n          for (const O of open) {');
  const end=source.indexOf('\n        }\n        S.age += dt;',start);
  assert(start>=0&&end>start,'production lobby update boundaries');
  return source.slice(start,end);
}
const before=updateBlock(raw),after=updateBlock(adaptBuildSource('src/ui/menus.js',raw));
assert(before.includes('if (a) O.el.style.transform = '));
assert(after.includes('if (a) { const transform = '));
const dir=path.resolve(process.argv[2]||'.ci-scratch/lobby-slot-browser');fs.mkdirSync(dir,{recursive:true});
const report={scope:'actual adapted lobby-loop with browser-native DOM and CSSOM, no full-game FPS claim',results:[]};
for(const [name,tool] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await tool.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:844,height:390}});
  await page.goto('about:blank');
  const result=await page.evaluate(({before,after})=>{
   const make=(code,label)=>{
    const container=document.createElement('section');container.dataset.variant=label;document.body.append(container);
    const counts={writes:0,anchors:0};
    const slots=Array.from({length:8},(_,i)=>{
     const el=document.createElement('div'),plus=document.createElement('span');
     plus.className='iw-plate__plus';el.append(plus);container.append(el);
     const style=el.style;let proto=style,descriptor;
     while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,'transform');proto=Object.getPrototypeOf(proto);}
     if(!descriptor?.get||!descriptor?.set)throw Error('native CSSOM transform property missing');
     Object.defineProperty(style,'transform',{configurable:true,
      get(){return descriptor.get.call(style);},
      set(v){counts.writes++;descriptor.set.call(style,v);}
     });
     return{row:i>>2,i:i&3,el,txt:document.createElement('span')};
    });
    let frame={anchor:()=>null};
    const sc={lobbySlotAnchor(row,i){counts.anchors++;return frame.anchor(row*4+i);}};
    const fn=new Function('sc','open','lob','S','A','clamp','GLYPHS',code);
    const tick=f=>{
     frame=f;fn(sc,slots,{bots:f.bots},{launching:f.launching},{},
      (v,lo,hi)=>Math.max(lo,Math.min(hi,v)),{bot:'BOT',plus:'PLUS'});
    };
    const snapshot=()=>slots.map(o=>({transform:o.el.style.transform,
     cls:o.el.className,txt:o.txt.textContent,
     plus:o.el.querySelector('.iw-plate__plus').innerHTML,on:o.on,sig:o.sig}));
    return{container,slots,counts,tick,snapshot};
   };
   const a=make(before,'source'),b=make(after,'candidate');let frames=0;
   const step=f=>{
    a.tick(f);b.tick(f);frames++;
    if(JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot()))throw Error('lobby native DOM divergence at frame '+frames);
   };
   const fixed=()=>({x:10.1,y:20.2,s:1,vis:1});
   for(let i=0;i<180;i++)step({anchor:fixed});
   const stable={baselineWrites:a.counts.writes,candidateWrites:b.counts.writes};
   if(stable.baselineWrites!==1440||stable.candidateWrites!==8)throw Error('CSSOM write count mismatch: '+JSON.stringify(stable));
   for(const row of [a,b])for(const o of row.slots)o.el.style.transform='none';
   step({anchor:fixed});
   if(b.slots.some(o=>o.el.style.transform==='none'))throw Error('external CSSOM mutation not repaired');
   for(let i=0;i<120;i++)step({anchor:j=>i%7===0?null:{x:i*.52-j,y:j-i*.41,
    s:[0,.1,.9,1.4][i%4],vis:i%5?1:0},launching:i%11===0,bots:i%3!==0});
   const summary={frames,stable,after:{baselineWrites:a.counts.writes,candidateWrites:b.counts.writes},
    anchors:{baseline:a.counts.anchors,candidate:b.counts.anchors},
    sameDOM:JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot()),externalRestored:true};
   a.container.remove();b.container.remove();return summary;
  },{before,after});
  assert(result.sameDOM&&result.externalRestored);
  assert.equal(result.anchors.baseline,result.anchors.candidate);
  report.results.push({browser:name,...result});
  await page.close();
 }finally{await browser.close();}
}
report.status=report.results.length===2?'passed':'failed';
fs.writeFileSync(path.join(dir,'lobby-slot-native-dom.json'),JSON.stringify(report,null,2)+'\n');
assert.equal(report.status,'passed');console.log(JSON.stringify(report));
