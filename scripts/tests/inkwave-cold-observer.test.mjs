import test from 'node:test';
import assert from 'node:assert/strict';
import {observeColdEnvironment,inspectColdBoot} from '../check-inkwave-idle-resources.mjs';
let sequence=0;
async function rig(run){
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window={};globalThis.document={readyState:'loading',visibilityState:'visible',hasFocus:()=>false,querySelector:()=>null};
 const url='data:text/javascript,'+encodeURIComponent(`export const G={env:null,game:null,settings:{quality:'high'},mobile:{touch:true}}; // ${++sequence}`);
 const {G}=await import(url);
 try{await run(G,url);}finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
}
const environment=()=>({_marina:true,_cloudRT:{width:1024,height:320,texture:{uuid:'cloud'}},_farRT:{width:256,texture:{uuid:'far'}}});
test('cold allocation observer still captures before Game and restores the original property owner',()=>rig(async(G,url)=>{
 const original=Object.getOwnPropertyDescriptor(G,'env');await observeColdEnvironment(url);assert.equal(inspectColdBoot().observerPhase,'observing-environment');
 G.env=environment();assert.equal(window.__coldEnvironment.gamePublishedAtAllocation,false);assert.deepEqual(window.__coldEnvironment.cloud,[1024,320]);assert.equal(window.__coldEnvironment.farSize,256);
 const descriptor=Object.getOwnPropertyDescriptor(G,'env');assert.equal(descriptor.get,undefined);assert.equal(descriptor.writable,original.writable);assert.equal(descriptor.enumerable,original.enumerable);assert.equal(descriptor.configurable,original.configurable);
 G.game={};window.__G=G;const after=inspectColdBoot();assert.equal(after.hasPublicGame,true);assert.equal(after.context.hasGame,true);assert.equal(after.observerPhase,'captured');
 const first=window.__coldEnvironment;G.env=environment();assert.equal(window.__coldEnvironment,first,'later environment replacement cannot hide the cold allocation');
}));
test('an already allocated Environment is observed only before Game publication; late setup still fails closed',async()=>{
 await rig(async(G,url)=>{G.env=environment();await observeColdEnvironment(url);assert.equal(inspectColdBoot().hasColdEnvironment,true);assert.equal(window.__coldEnvironment.gamePublishedAtAllocation,false);});
 await rig(async(G,url)=>{G.env=environment();G.game={};await assert.rejects(observeColdEnvironment(url),/after Game publication/);assert.equal(inspectColdBoot().context.hasGame,true);assert.equal(inspectColdBoot().hasColdEnvironment,false);});
});
test('failed context imports retain their stage without inventing a cold allocation',()=>rig(async()=>{
 await assert.rejects(observeColdEnvironment('data:text/javascript,throw%20Error(%22context%20failure%22)'));
 const d=inspectColdBoot();assert.equal(d.observerPhase,'importing-context');assert.equal(d.context,null);assert.equal(d.hasColdEnvironment,false);assert.equal(d.visibility,'visible');assert.equal(d.focused,false);
}));
