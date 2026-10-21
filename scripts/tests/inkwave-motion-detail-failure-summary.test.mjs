import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDetailRigFailure} from '../lib/inkwave-motion-detail-failure-summary.mjs';
const receipt=(m={})=>({data:[{name:'flow-squid',samples:[{form:'squid'}],renderMetrics:[{frame:0,renderClocksStable:true,rig:{changedPixels:0,maxChannelDifference:0},rigDiagnostic:{rootVisible:true,actorAlive:true,actorPosition:[1,2,3],visibleMeshes:10},...m}]}]});
test('known failed pair is sanitized and labels local visibility limitation',()=>{
 const input=receipt(),saved=JSON.stringify(input),out=summarizeDetailRigFailure(input);
 assert.equal(out.rows.length,1);assert.equal(out.rows[0].scenario,'flow-squid');assert.equal(out.rows[0].form,'squid');
 assert.equal(out.rows[0].rigDiagnostic.rootVisible,true);assert.deepEqual(out.rows[0].rigDiagnostic.actorPosition,[1,2,3]);
 assert.match(out.meshCountMeaning,/ancestor visibility is NOT established/);assert.equal(JSON.stringify(input),saved);
 out.rows[0].rigDiagnostic.actorPosition[0]=99;assert.equal(input.data[0].renderMetrics[0].rigDiagnostic.actorPosition[0],1);
});
test('missing structures and fields never throw or invent measurements',()=>{
 for(const input of [null,{}, {data:null},{data:[null]}])assert.deepEqual(summarizeDetailRigFailure(input).rows,[]);
 const out=summarizeDetailRigFailure({data:[{renderMetrics:[null]}]}).rows[0];
 assert.equal(out.changedPixels,null);assert.equal(out.scenario,null);assert.equal(out.rigDiagnostic.rootVisible,null);
});
test('nonfinite and wrong typed fields become null rather than misleading zeros',()=>{
 const input=receipt({frame:NaN,renderClocksStable:'yes',rig:{changedPixels:Infinity,maxChannelDifference:NaN},rigDiagnostic:{rootVisible:1,visibleMeshes:Infinity,actorPosition:[1,NaN,3]}});
 const row=summarizeDetailRigFailure(input).rows[0];
 for(const v of [row.frame,row.renderClocksStable,row.changedPixels,row.maxChannelDifference,row.rigDiagnostic.rootVisible,row.rigDiagnostic.visibleMeshes,row.rigDiagnostic.actorPosition])assert.equal(v,null);
 assert.doesNotMatch(JSON.stringify(row),/NaN|Infinity/);
});
test('only failed or invalid metric rows are emitted, exact gate boundary unchanged',()=>{
 assert.equal(summarizeDetailRigFailure(receipt({rig:{changedPixels:16}})).rows.length,0);
 assert.equal(summarizeDetailRigFailure(receipt({rig:{changedPixels:15}})).rows.length,1);
});
test('unknown fields and oversize labels cannot leak into stdout',()=>{
 const input=receipt();input.data[0].name='secret'.repeat(10000);input.data[0].secret='private';input.data[0].renderMetrics[0].rigDiagnostic.secret='private';
 const text=JSON.stringify(summarizeDetailRigFailure(input));assert.doesNotMatch(text,/secret|private/);assert.ok(text.length<8192);
});
test('row and scan budgets bound large receipts to under eight KiB',()=>{
 const input=receipt();input.data=Array.from({length:1000},()=>({...input.data[0],renderMetrics:Array.from({length:1000},()=>input.data[0].renderMetrics[0])}));
 const out=summarizeDetailRigFailure(input);assert.equal(out.rows.length,3);assert.equal(out.scanTruncated,true);assert.ok(JSON.stringify(out).length<8192);
 const good={name:'ok',renderMetrics:Array.from({length:1000},()=>({rig:{changedPixels:16}}))};
 const limited=summarizeDetailRigFailure({data:Array.from({length:1000},()=>good)});assert.equal(limited.rows.length,0);assert.equal(limited.casesScanned,32);assert.equal(limited.metricsScanned,32*64);assert.equal(limited.scanTruncated,true);
});
test('unsafe names and unsupported forms are not copied',()=>{
 const input=receipt();input.data[0].name='line\nbreak';input.data[0].samples[0].form='unexpected';const row=summarizeDetailRigFailure(input).rows[0];assert.equal(row.scenario,null);assert.equal(row.form,null);
});
