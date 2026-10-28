import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRetryResponsiveSessionLoss as admit} from '../lib/inkwave-responsive-session-retry.mjs';
const failure=()=>({engine:'webkit',name:'small-phone',processResult:{status:1,signal:null,error:null},
 fragment:{status:'failed',error:'page.evaluate: Target page, context or browser has been closed',errors:[],
 cases:[{engine:'webkit',name:'small-phone',status:'failed',diagnostics:{pageUnavailable:true,
 events:[{type:'page-crash'}]}}]}});
test('only explicit failed WebKit browser session loss admits one fresh-process verification',()=>{
 assert.equal(admit(failure()),true);
 for(const patch of [
  x=>x.engine='chromium',x=>x.processResult.status=0,x=>x.processResult.signal='SIGTERM',
  x=>x.processResult.error=Error('killed'),x=>x.fragment.status='passed',
  x=>x.fragment.error='AssertionError: viewport overflow',
  x=>x.fragment.errors.push('UI behavior mismatch'),
  x=>x.fragment.cases[0].name='tablet-landscape',
  x=>x.fragment.cases[0].status='passed',
  x=>x.fragment.cases[0].diagnostics.pageUnavailable=false,
  x=>x.fragment.cases[0].diagnostics.events=[{type:'first-error'}],
  x=>x.fragment.cases.push({...x.fragment.cases[0]}),
 ]){const x=failure();patch(x);assert.equal(admit(x),false);}
});
test('empty, malformed or code-failure receipts cannot authorize a browser retry',()=>{
 for(const x of [null,{},false,{engine:'webkit'}, {...failure(),fragment:null},
  {...failure(),fragment:{status:'failed',error:'Target closed',errors:[],cases:[]}}])assert.equal(admit(x),false);
});