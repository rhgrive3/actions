import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPortraitAspectTransition} from '../../../scripts/inkwave-touch-transition-cases.mjs';
const idle=()=>({fireDown:false,fireEdge:false,ptrSize:0,stickActive:false,resyncCalls:0});
const valid=()=>({portrait:idle(),landscape:idle(),fresh:{...idle(),fireDown:true,fireEdge:true,ptrSize:1},released:idle()});
test('portrait rejection plus fresh landscape input satisfies the transition contract',()=>assertPortraitAspectTransition(valid()));
for(const [phase,key,value] of [['portrait','fireDown',true],['portrait','ptrSize',1],['landscape','fireEdge',true],['landscape','ptrSize',1],['landscape','resyncCalls',1],['fresh','fireDown',false],['fresh','fireEdge',false],['fresh','ptrSize',2],['released','fireDown',true],['released','ptrSize',1]])test(`transition proof rejects ${phase} ${key}=${value}`,()=>{
 const receipt=valid();receipt[phase][key]=value;assert.throws(()=>assertPortraitAspectTransition(receipt));
});
