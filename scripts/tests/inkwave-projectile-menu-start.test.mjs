import test from 'node:test';
import assert from 'node:assert/strict';
import {startProjectileThroughMenu} from '../lib/inkwave-projectile-menu-start.mjs';
const config={mode:'turf',map:'tidewater',difficulty:'normal',duration:180,weapon:'shooter',time:'day'};
const ids=['mode-turf','mode-zones','mode-tower','mode-rainmaker','mode-clams','mode-boss','mode-range'];
function harness({touch=true,cols=3,blocked=false,settings=config}={}){
 const events=[],receipt=[];let focus=6;
 const page={
  locator(sel){return{
   async click(opts){assert(opts.timeout>0);events.push(['click',sel]);},
   async press(key,opts){assert(opts.timeout>0);events.push(['press',key]);}
  };},
  mouse:{async move(x,y){events.push(['move',x,y]);}},
  keyboard:{async press(key){
   events.push(['key',key]);if(blocked)return;
   if(key==='ArrowLeft')focus=focus===6?5:focus%cols===0?focus:focus-1;
   else if(key==='ArrowUp'&&focus>=cols)focus-=cols;
  }},
  async evaluate(fn){
   const s=fn.toString();
   if(s.includes('navigator.maxTouchPoints'))return touch;
   if(s.includes("getComputedStyle(row)"))return{screen:'mode',button:ids[focus],focused:focus,target:0,columns:cols};
   if(s.includes('g.menus?._setup'))return settings;
   throw Error('Unexpected page evaluation');
  }
 };
 return{page,events,receipt,waitForPhase:async(_,label)=>events.push(['phase',label])};
}
for(const cols of [2,3]){
 test('touch native Turf selection navigates verified '+cols+'-column grid',async()=>{
  const h=harness({cols});
  await startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt});
  const keys=h.events.filter(e=>e[0]==='key').map(e=>e[1]);
  assert.equal(keys[0],'ArrowLeft');
  assert.equal(keys.at(-1),'Enter');
  assert.equal(h.receipt.filter(x=>x.event==='native-focus-step').length,keys.length-1);
  assert.equal(h.receipt.filter(x=>x.event==='native-start-clicked').length,1);
  assert.deepEqual(h.events.filter(e=>e[0]==='phase').map(e=>e[1]),['native main menu readiness','native mode menu','native setup menu']);
 });
}
test('desktop retains original Turf Enter without keyboard navigation',async()=>{
 const h=harness({touch:false});
 await startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt});
 assert.deepEqual(h.events.filter(e=>e[0]==='press').map(e=>e[1]),['Enter']);
 assert.equal(h.events.some(e=>e[0]==='key'),false);
});
test('focus failure rejects before entering any alternative mode',async()=>{
 const h=harness({blocked:true});
 await assert.rejects(startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt}),/focus navigation stalled/);
 assert.equal(h.events.some(e=>e[0]==='key'&&e[1]==='Enter'),false);
 assert.equal(h.events.some(e=>e[0]==='click'&&e[1].includes('start')),false);
});
test('invalid map is still rejected before START',async()=>{
 const h=harness({settings:{...config,map:'range'}});
 await assert.rejects(startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt}),/configuration mismatch/);
 assert.equal(h.events.some(e=>e[0]==='click'&&e[1].includes('start')),false);
});