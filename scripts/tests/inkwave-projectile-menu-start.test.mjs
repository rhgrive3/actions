import test from 'node:test';
import assert from 'node:assert/strict';
import {startProjectileThroughMenu} from '../lib/inkwave-projectile-menu-start.mjs';

const canonicalConfig={mode:'turf',map:'tidewater',difficulty:'normal',duration:180,weapon:'shooter',time:'day'};
function harness({touch=false,config=canonicalConfig,blockedFocus=false}={}){
 const events=[],receipt=[];let focus='mode-range';
 const page={
  locator(selector){return{async click(){events.push(['click',selector]);},async press(key){events.push(['press',key]);},async tap(){throw Error('touch tap is not a performance admission');}};},
  mouse:{async move(x,y){events.push(['move',x,y]);}},
  keyboard:{async press(key){events.push(['key',key]);if(key==='ArrowLeft'&&!blockedFocus)focus=focus==='mode-range'?'mode-boss':'mode-turf';}},
  async evaluate(fn){
   const src=fn.toString();
   if(src.includes('navigator.maxTouchPoints'))return touch;
   if(src.includes('m?._focus'))return {screen:'mode',button:focus};
   if(src.includes('g.menus?._setup'))return config;
   throw Error('unknown page evaluation');
  }
 };
 return{page,events,receipt,waitForPhase:async(_fn,label)=>events.push(['phase',label])};
}
test('desktop follows existing Turf Enter button admission',async()=>{
 const h=harness();
 await startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt});
 assert.deepEqual(h.events.filter(e=>e[0]==='press'),[['press','Enter']]);
 assert.equal(h.receipt.filter(e=>e.event==='native-start-clicked').length,1);
});
test('touch-sized performance scenario reaches Turf via native Range/Boss/Turf navigation',async()=>{
 const h=harness({touch:true});
 await startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt});
 assert.deepEqual(h.events.filter(e=>e[0]==='key').map(e=>e[1]),['ArrowLeft','ArrowLeft','Enter']);
 assert.deepEqual(h.events.filter(e=>e[0]==='phase').map(e=>e[1]),['native main menu readiness','native mode menu','native setup menu']);
 assert.equal(h.receipt.filter(e=>e.event==='native-start-clicked').length,1);
});
test('unfocused Turf rejects without Enter or START',async()=>{
 const h=harness({touch:true,blockedFocus:true});
 await assert.rejects(startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt}),/Native Turf keyboard focus mismatch/);
 assert.deepEqual(h.events.filter(e=>e[0]==='key').map(e=>e[1]),['ArrowLeft','ArrowLeft']);
 assert.equal(h.events.some(e=>e[0]==='click'&&e[1].includes('start')),false);
});
test('invalid map still rejects before START',async()=>{
 const h=harness({touch:true,config:{...canonicalConfig,map:'range'}});
 await assert.rejects(startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt}),/configuration mismatch/);
 assert.equal(h.events.some(e=>e[0]==='click'&&e[1].includes('start')),false);
});
