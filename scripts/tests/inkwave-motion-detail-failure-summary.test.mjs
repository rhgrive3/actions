import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDetailRigFailure,assertCatalogGeometryPresent,summarizeCatalogEmptyGeometry} from '../lib/inkwave-motion-detail-failure-summary.mjs';
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

test('empty indexed geometry is explicitly a failure, never replaced with finite zero bounds',()=>{
 assert.throws(()=>assertCatalogGeometryPresent({indexedVertices:0,min:[Infinity,Infinity,Infinity]},'swim.renders.0'),/empty indexed geometry.*not a posed-vertex NaN/);
 assertCatalogGeometryPresent({indexedVertices:1,min:[NaN,0,0]},'vertex-nan');
 // Positive-count nonfinite bounds remain owned by the existing numericTree gate.
});
const catalog=()=>({data:[{name:'swim-turn-brake',renders:[{frame:1,tick:1,visible:true,rig:{changedPixels:42,maxChannelDifference:20},geometry:{indexedVertices:0,triangles:0,skinnedVertices:0,meshes:0,min:[Infinity,Infinity,Infinity],collectorDiagnostic:{rootVisible:true,totalMeshes:12,localVisibleMeshes:8,nativeAncestorVisibleMeshes:0,indexedMeshes:9,materialEligibleGroups:0,drawRangeEntries:0}}}]}]});
test('catalog diagnostic distinguishes RGB from empty CPU collector and local from ancestor visibility',()=>{
 const input=catalog(),before=JSON.stringify(input),out=summarizeCatalogEmptyGeometry(input),row=out.rows[0];
 assert.equal(row.rgb.changedPixels,42);assert.equal(row.collector.localVisibleMeshes,8);assert.equal(row.collector.nativeAncestorVisibleMeshes,0);
 assert.match(out.visibilityMeaning,/separately/);assert.match(row.reason,/still a failure/);assert.equal(JSON.stringify(input),before);
});
test('catalog missing/nonfinite/wrong-type fields are bounded null diagnostics',()=>{
 assert.deepEqual(summarizeCatalogEmptyGeometry(null).rows,[]);
 const input=catalog(),r=input.data[0].renders[0];r.rig.changedPixels=Infinity;r.visible='yes';r.geometry.collectorDiagnostic.totalMeshes=NaN;
 const out=summarizeCatalogEmptyGeometry(input).rows[0];assert.equal(out.rgb.changedPixels,null);assert.equal(out.visible,null);assert.equal(out.collector.totalMeshes,null);
});
test('catalog skips nonempty records and strips unknown/oversized data under eight KiB',()=>{
 const input=catalog();input.data[0].name='secret'.repeat(2000);input.data[0].renders[0].geometry.collectorDiagnostic.secret='private';
 input.data=Array.from({length:1000},()=>input.data[0]);const out=summarizeCatalogEmptyGeometry(input),text=JSON.stringify(out);
 assert.equal(out.rows.length,3);assert.ok(text.length<8192);assert.doesNotMatch(text,/secret|private/);
 assert.equal(summarizeCatalogEmptyGeometry({data:[{renders:[{geometry:{indexedVertices:100}}]}]}).rows.length,0);
});
