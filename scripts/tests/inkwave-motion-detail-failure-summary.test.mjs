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

test('catalog owner visibility and first hidden ancestors use known bounded role labels',()=>{
 const input=catalog(),d=input.data[0].renders[0].geometry.collectorDiagnostic;
 d.owners={modelVisible:true,kidVisible:false,squidVisible:false,modelScale:[1,1,1],formWeight:0,sourceActive:true,sourceStatus:'ready',form:'swim',sourceSquidClip:'Sqd_Walk',sourceSquidFrame:24,humanClips:[{name:'WaitHold_Nrml',frame:2,weight:1}]};
 d.hiddenAncestorChains=[{firstHidden:'squid-root',roles:[{role:'mesh',visible:true},{role:'squid-root',visible:false}],truncated:false}];
 const before=JSON.stringify(input),out=summarizeCatalogEmptyGeometry(input).rows[0].collector;
 assert.equal(out.owners.squidVisible,false);assert.equal(out.hiddenAncestorChains[0].firstHidden,'squid-root');assert.equal(JSON.stringify(input),before);
});
test('catalog oversized owners and unknown ancestor names are stripped below eight KiB',()=>{
 const input=catalog(),d=input.data[0].renders[0].geometry.collectorDiagnostic;
 d.owners={modelScale:[NaN,0,0],sourceSquidClip:'bad'.repeat(10000),humanClips:Array.from({length:1000},()=>({name:'x'.repeat(96),frame:1,weight:1,secret:'secret'}))};
 d.hiddenAncestorChains=Array.from({length:1000},()=>({firstHidden:'private-object-name',roles:Array.from({length:1000},()=>({role:'character-model',visible:false,name:'secret'})),truncated:true}));
 input.data=Array.from({length:100},()=>input.data[0]);
 const out=summarizeCatalogEmptyGeometry(input),text=JSON.stringify(out);assert.ok(text.length<8192);assert.doesNotMatch(text,/private-object-name|secret/);assert.equal(out.rows[0].collector.owners.modelScale,null);
});

test('maximum legal finite scalars and ASCII labels honor serialized stdout budget',()=>{
 const input=catalog(),r=input.data[0].renders[0],d=r.geometry.collectorDiagnostic,n=-Number.MAX_VALUE;
 for(const k of Object.keys(d))d[k]=k==='rootVisible'?true:n;
 r.frame=n;r.tick=n;r.geometry.triangles=n;r.geometry.skinnedVertices=n;r.geometry.meshes=n;r.rig.changedPixels=n;r.rig.maxChannelDifference=n;
 d.owners={modelVisible:true,kidVisible:true,squidVisible:true,modelScale:[n,n,n],kidScale:[n,n,n],squidScale:[n,n,n],kidWeight:n,squidWeight:n,formWeight:n,sourceActive:true,sourceStatus:'x'.repeat(64),form:'swim',sourceSquidClip:'x'.repeat(96),sourceSquidFrame:n,humanClips:Array.from({length:4},()=>({name:'x'.repeat(96),frame:n,weight:n}))};
 d.hiddenAncestorChains=Array.from({length:2},()=>({firstHidden:'character-model',truncated:false,roles:Array.from({length:8},()=>({role:'character-model',visible:false}))}));
 input.data=Array.from({length:3},()=>input.data[0]);const out=summarizeCatalogEmptyGeometry(input);
 assert.ok(JSON.stringify(out).length<8192);assert.equal(out.scanTruncated,true);assert.ok(out.rows.length<3);
});

test('detail preserves source owner and CPU bounds alongside bounded ancestor reasons',()=>{
 const input={data:[{name:'flow-squid',samples:[{form:'squid'}],renderMetrics:[{frame:0,rig:{changedPixels:0},rigDiagnostic:{sourceMotion:{status:'ready',active:true,sameOwner:true,variant:'Player00',squid:{name:'Sqd_Walk',frame:2}},cpuBounds:{indexedVertices:0,unsupportedMeshes:1,unsupportedReasons:{instanced:0,missingIndex:1,missingVertexApi:0},worldMin:null},ownerVisibility:{owners:{modelVisible:false,sourceSquidClip:'Sqd_Walk'},hiddenAncestorChains:[{firstHidden:'character-model',roles:[{role:'mesh',visible:true},{role:'character-model',visible:false}],truncated:false}]}}}]}]};
 const before=JSON.stringify(input),out=summarizeDetailRigFailure(input).rows[0].rigDiagnostic;
 assert.equal(out.sourceMotion.sameOwner,true);assert.equal(out.cpuBounds.unsupportedReasons.missingIndex,1);
 assert.equal(out.ownerVisibility.hiddenAncestorChains[0].firstHidden,'character-model');
 assert.equal(JSON.stringify(input),before);
});
test('detail maximal legal ancestor and CPU numeric records remain below eight KiB',()=>{
 const n=-Number.MAX_VALUE,clip={name:'x'.repeat(96),frame:n,weight:n};
 const owners={modelVisible:true,kidVisible:true,squidVisible:true,modelScale:[n,n,n],kidScale:[n,n,n],squidScale:[n,n,n],kidWeight:n,squidWeight:n,formWeight:n,sourceActive:true,sourceStatus:'x'.repeat(64),form:'swim',sourceSquidClip:clip.name,sourceSquidFrame:n,humanClips:Array.from({length:4},()=>clip)};
 const d={ownerVisibility:{owners,hiddenAncestorChains:Array.from({length:2},()=>({firstHidden:'character-model',truncated:false,roles:Array.from({length:8},()=>({role:'character-model',visible:false}))}))},sourceMotion:{status:'x'.repeat(64),active:true,sameOwner:true,variant:'Player00',squid:clip},cpuBounds:{worldMin:[n,n,n],worldMax:[n,n,n],ndcMin:[n,n,n],ndcMax:[n,n,n],unsupportedReasons:{instanced:n,missingIndex:n,missingVertexApi:n}}};
 for(const k of ['totalMeshes','visibleMeshes','colorWriteMeshes','withRigCalls','withoutRigCalls','projectileCount','inkBlobCount'])d[k]=n;
 for(const k of ['indexedVertices','eligibleMeshes','nonFiniteVertices','unsupportedMeshes'])d.cpuBounds[k]=n;
 const entry={name:'x'.repeat(64),renderMetrics:[{frame:n,rig:{changedPixels:n,maxChannelDifference:n},rigDiagnostic:d}]};
 const out=summarizeDetailRigFailure({data:[entry,entry,entry]});
 assert.ok(JSON.stringify(out).length<8192);assert.equal(out.scanTruncated,true);
});
