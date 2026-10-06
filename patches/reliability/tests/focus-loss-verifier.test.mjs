import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {runFocusLossCase} from '../../../scripts/inkwave-focus-loss-case.mjs';

function page({reset=true,focusError=null}={}) {
 const events=[],mobile={pressed:new Set(['fire']),jumpTarget:2,lookDX:3,lookDY:2},intents=[];
 const context=vm.createContext({mobile,intents,Event,
  window:{dispatchEvent(e){events.push(e.type);if(e.type==='blur'&&reset){mobile.pressed.clear();mobile.jumpTarget=-1;mobile.lookDX=mobile.lookDY=0;}if(e.type==='focus'&&focusError)throw focusError;}},
  advance(){intents.push({fire:mobile.pressed.has('fire')});}});
 return {events,async evaluate(fn){const value=vm.runInContext('('+fn.toString()+')()',context);return value===undefined?undefined:JSON.parse(JSON.stringify(value));}};
}
test('focus is restored after the blur cancellation assertions succeed',async()=>{
 const p=page(),entry={checks:[]};await runFocusLossCase(p,entry);
 assert.deepEqual(p.events,['blur','focus']);assert.equal(entry.checks.length,1);
});
test('failed blur cancellation stays failed while focus is restored',async()=>{
 const p=page({reset:false}),entry={checks:[]};await assert.rejects(runFocusLossCase(p,entry),{code:'ERR_ASSERTION'});
 assert.deepEqual(p.events,['blur','focus']);assert.equal(entry.checks.length,0);
});
test('cleanup failure cannot hide an earlier cancellation assertion',async()=>{
 const cleanup=new Error('focus cleanup failed'),p=page({reset:false,focusError:cleanup});
 await assert.rejects(runFocusLossCase(p,{checks:[]}),e=>e instanceof AggregateError&&e.errors[0].code==='ERR_ASSERTION'&&e.errors[1]===cleanup&&e.cause===e.errors[0]);
});
test('cleanup failure is observable when the original assertions passed',async()=>{
 const cleanup=new Error('focus cleanup failed'),p=page({focusError:cleanup});
 await assert.rejects(runFocusLossCase(p,{checks:[]}),e=>e===cleanup);
});

const built=process.env.INKWAVE_INPUT_POLICY_SITE;
for(const variant of ['unfocused','focus-without-neutral','fixed'])test(`emitted menu fixture: ${variant}`,{skip:!built},async()=>{
 const {fixture}=await import('./input-policy-emitted-fixture.mjs');
 const h=await fixture(),input=new h.Input({}),a=h.make(),rig={yaw:0,pitch:0,mode:'follow',target:a},controller=new h.PlayerController(a,rig,input);
 controller.computeAim=()=>{};h.G.settings={...h.DEFAULT_SETTINGS,aimAssist:0};h.G.rig=rig;h.G.actors=[a];h.G.mode='match';h.G.projectiles.update=()=>{};h.installClock(h);
 const sim={input,rig,_padMenus(){},match:{paused:false,local:a,controller,updateController:dt=>controller.update(dt),update(){}}};
 const advance=dt=>h.runSimulation(sim,dt),env=input.constructor.constructor('return globalThis')();
 h.event('blur',new Event('blur'));advance(1/60);if(variant!=='unfocused')h.event('focus',new Event('focus'));
 let source=fs.readFileSync(new URL('../../../scripts/check-inkwave-reliability.mjs',import.meta.url),'utf8');
 if(variant==='focus-without-neutral')source=source.replace('buttons([]); input.pollPad(); input.endFrame();','');
 const marker='const menuPad = await page.evaluate(',start=source.indexOf(marker)+marker.length,end=source.indexOf('\n      });\n      assert.deepEqual(menuPad',start);
 assert.ok(start>=marker.length&&end>start,'native browser menu fixture found');
 const result=vm.runInNewContext('('+source.slice(start,end)+'\n      })()',{input,controller,sim,advance,navigator:env.navigator});
 assert.equal(result.startEdges,variant==='fixed'?2:variant==='unfocused'?0:1);
 assert.equal(result.menuAcceptOwned,true);assert.equal(result.nextGameplayPressRestored,variant!=='unfocused');
});
