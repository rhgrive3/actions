import test from 'node:test';
import assert from 'node:assert/strict';
import {startProjectileThroughMenu} from '../lib/inkwave-projectile-menu-start.mjs';

const canonicalConfig={mode:'turf',map:'tidewater',difficulty:'normal',duration:180,weapon:'shooter',time:'day'};
function harness({touch=false,config=canonicalConfig,touchReject=false}={}){
 const events=[],receipt=[];
 const page={
  locator(selector){return{
   async click(options){assert(options.timeout>0);events.push(['click',selector]);},
   async tap(options){assert(options.timeout>0);events.push(['tap',selector]);if(touchReject)throw Error('touch blocked');},
   async press(key,options){assert(options.timeout>0);events.push(['press',selector,key]);}
  };},
  mouse:{async move(x,y){events.push(['move',x,y]);}},
  async evaluate(fn){
   if(fn.toString().includes('navigator.maxTouchPoints'))return touch;
   if(fn.toString().includes('g.menus?._setup'))return config;
   throw Error('unexpected browser evaluation');
  }
 };
 const waitForPhase=async(_predicate,label)=>{events.push(['phase',label]);};
 return{events,receipt,page,waitForPhase};
}
for(const touch of [false,true]){
 test('Turf navigation uses only native '+(touch?'touch tap':'desktop keyboard')+' activation',async()=>{
  const h=harness({touch});
  await startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt});
  const activation=h.events.filter(e=>['tap','press'].includes(e[0]));
  assert.deepEqual(activation,touch?[['tap','.iw-modesel [data-id="mode-turf"]']]:[['press','.iw-modesel [data-id="mode-turf"]','Enter']]);
  assert.deepEqual(h.events.filter(e=>e[0]==='phase').map(e=>e[1]),['native main menu readiness','native mode menu','native setup menu']);
  assert.deepEqual(h.events.filter(e=>e[0]==='click').map(e=>e[1]),['.iw-main [data-id="play"]','.iw-setup [data-id="map-tidewater"]','.iw-setup [data-id="start"].iw-btn--start']);
  assert.equal(h.receipt.filter(r=>r.event==='native-start-clicked').length,1);
 });
}
test('native menu configuration mismatch fails closed before START',async()=>{
 const h=harness({touch:true,config:{...canonicalConfig,map:'range'}});
 await assert.rejects(startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt}),/configuration mismatch/);
 assert.equal(h.events.some(e=>e[0]==='click'&&e[1].includes('start')),false);
});
test('touch failure never falls back to synthetic keyboard input',async()=>{
 const h=harness({touch:true,touchReject:true});
 await assert.rejects(startProjectileThroughMenu(h.page,{waitForPhase:h.waitForPhase,remainingMs:()=>5000,receipt:h.receipt}),/touch blocked/);
 assert.equal(h.events.some(e=>e[0]==='press'),false);
});
