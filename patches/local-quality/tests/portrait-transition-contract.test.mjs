import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPortraitAspectTransition,trackTouchSequence} from '../../../scripts/inkwave-touch-transition-cases.mjs';
const idle=()=>({fireDown:false,fireEdge:false,ptrSize:0,stickActive:false,resyncCalls:0});
const valid=()=>({portrait:idle(),landscape:idle(),fresh:{...idle(),fireDown:true,fireEdge:true,ptrSize:1},released:idle()});
test('portrait rejection plus fresh landscape input satisfies the transition contract',()=>assertPortraitAspectTransition(valid()));
for(const [phase,key,value] of [['portrait','fireDown',true],['portrait','ptrSize',1],['landscape','fireEdge',true],['landscape','ptrSize',1],['landscape','resyncCalls',1],['fresh','fireDown',false],['fresh','fireEdge',false],['fresh','ptrSize',2],['released','fireDown',true],['released','ptrSize',1]])test(`transition proof rejects ${phase} ${key}=${value}`,()=>{
 const receipt=valid();receipt[phase][key]=value;assert.throws(()=>assertPortraitAspectTransition(receipt));
});

test('finished native touch sequences are not ended twice by cleanup',async()=>{
 let browserActive=false,ends=0;const sequence=trackTouchSequence(async(type,points)=>{
  if(type==='touchStart')browserActive=true;
  else if(type==='touchEnd'){assert.equal(browserActive,true,'native protocol rejects end without start');browserActive=points.length>0;ends++;}
 });
 await sequence.send('touchStart',[{id:1}]);await sequence.send('touchEnd',[]);await sequence.finish();assert.equal(ends,1);
 await sequence.send('touchStart',[{id:2}]);await sequence.finish();await sequence.finish();assert.equal(ends,2);assert.equal(sequence.active,false);
});
test('stale moves are rejected before reaching the native gesture protocol',async()=>{
 let calls=0;const sequence=trackTouchSequence(async()=>{calls++;});await assert.rejects(sequence.send('touchMove',[{id:1}]),/requires touchStart/);assert.equal(calls,0);
});
test('cleanup reports its error without masking an earlier transition assertion',async()=>{
 const primary=new Error('original transition assertion'),cleanup=new Error('native touch protocol failure');
 const sequence=trackTouchSequence(async type=>{if(type==='touchEnd')throw cleanup;});await sequence.send('touchStart',[{id:1}]);
 await assert.rejects(sequence.finish(primary),error=>error instanceof AggregateError&&error.cause===primary&&error.errors[0]===primary&&error.errors[1]===cleanup);
});
test('cleanup failure without an earlier assertion is still reported',async()=>{
 const failure=new Error('cleanup failure');const sequence=trackTouchSequence(async type=>{if(type==='touchEnd')throw failure;});await sequence.send('touchStart',[{id:1}]);await assert.rejects(sequence.finish(),error=>error===failure);
});

test('live portrait evidence and tablet capture precede destructive transition coverage',()=>{
 const code=fs.readFileSync(new URL('../../../scripts/check-inkwave-reliability.mjs',import.meta.url),'utf8');
 const portrait=code.indexOf('entry.portraitGuard=await page.evaluate'),capture=code.indexOf("engineName + '-tablet-controls.png'"),destroySuite=code.indexOf('await runTouchTransitionCases({');
 assert(portrait>=0&&capture>portrait&&destroySuite>capture);
 const transitions=fs.readFileSync(new URL('../../../scripts/inkwave-touch-transition-cases.mjs',import.meta.url),'utf8');
 assert(transitions.includes('mobile.destroy();'));assert(transitions.includes('Post-destroy resize does not recreate elements'));
});
