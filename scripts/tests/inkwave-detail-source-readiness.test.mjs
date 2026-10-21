import test from 'node:test';
import assert from 'node:assert/strict';
import {awaitDetailSourceOwner,detailSourceOwnerReceipt,detailCpuDrawBounds,detailOwnerVisibility} from '../lib/inkwave-detail-source-readiness.mjs';
function fixture(){
 const ch={sqScale:1};
 const owner={status:'ready',enabled:true,active:true,variant:'Player00',bank:{clips:new Map([['WaitHold_Nrml',{}]])},squidBank:{clips:new Map([['Sqd_Walk',{}],['Sqd_ToSquid',{}]])},currentClips:[{name:'WaitHold_Nrml',frame:2,weight:1}],debug:{squid:{name:'Sqd_Walk',frame:3}},squidRig:{character:ch}};
 owner.ready=Promise.resolve(owner);ch.sourceMotion=owner;return {ch,owner};
}
test('awaits actual replacement owner without advancing clocks or changing pose',async()=>{
 const {ch,owner}=fixture();let finish;ch.sourceMotion={status:'loading',ready:new Promise(r=>finish=r)};
 const promise=awaitDetailSourceOwner(ch,1000);ch.sourceMotion=owner;finish(owner);
 assert.equal(await promise,owner);assert.equal(detailSourceOwnerReceipt(ch,owner).squid.name,'Sqd_Walk');
});
test('load error, disabled owner and missing bank cannot fall back silently',async()=>{
 for(const change of [o=>o.status='error',o=>o.enabled=false,o=>o.error='load failed',o=>o.bank=null,o=>o.squidRig=null]){
 const {ch,owner}=fixture();change(owner);await assert.rejects(awaitDetailSourceOwner(ch,1000),/did not load/);
 }
 await assert.rejects(awaitDetailSourceOwner({},1000),/Missing actual/);
});
test('never-resolving readiness fails with timeout rather than settling fallback',async()=>{
 const ch={sourceMotion:{ready:new Promise(()=>{})}};
 await assert.rejects(awaitDetailSourceOwner(ch,1),/timeout/);
});
test('capture rejects owner replacement, inactive and missing or nonfinite clips',()=>{
 for(const change of [(c,o)=>c.sourceMotion={...o},(c,o)=>o.active=false,(c,o)=>o.currentClips=[],(c,o)=>o.currentClips[0].name='unloaded',(c,o)=>o.debug.squid.frame=NaN]){
 const {ch,owner}=fixture();change(ch,owner);assert.throws(()=>detailSourceOwnerReceipt(ch,owner),/owner|clips|clip/);
 }
});
test('owner receipt is a detached read-only record',()=>{
 const {ch,owner}=fixture();const out=detailSourceOwnerReceipt(ch,owner);out.human[0].frame=99;
 assert.equal(owner.currentClips[0].frame,2);assert.equal(owner.debug.squid.frame,3);
});
function draw(points,extra={}){
 const mesh={isMesh:true,geometry:{index:{count:points.length,getX:i=>i},groups:[],drawRange:{start:0,count:Infinity}},material:{visible:true,colorWrite:true},matrixWorld:{},
 getVertexPosition(i,v){[v.x,v.y,v.z]=points[i];return v;},...extra};
 const root={traverseVisible(fn){fn(mesh);}};
 const vector=()=>({x:0,y:0,z:0,applyMatrix4(){return this;},project(){return this;}});
 return {mesh,root,vector};
}
test('CPU bounds use native getVertexPosition without transform or geometry mutation',()=>{
 const {mesh,root,vector}=draw([[1,2,3],[-1,-2,-3]]);const prior=JSON.stringify(mesh);
 const b=detailCpuDrawBounds(root,vector,{});assert.deepEqual(b.worldMin,[-1,-2,-3]);assert.deepEqual(b.worldMax,[1,2,3]);
 assert.equal(b.indexedVertices,2);assert.equal(JSON.stringify(mesh),prior);assert.match(b.scope,/excludes GPU/);
});
test('empty, nonfinite and capped CPU bounds remain diagnostic, never invented finite extents',()=>{
 const empty=draw([[1,2,3]],{material:{visible:false}});assert.equal(detailCpuDrawBounds(empty.root,empty.vector,{}).worldMin,null);
 const bad=draw([[NaN,2,3]]);assert.equal(detailCpuDrawBounds(bad.root,bad.vector,{}).nonFiniteVertices,1);
 const cap=draw([[1,2,3],[4,5,6]]);assert.equal(detailCpuDrawBounds(cap.root,cap.vector,{},1).truncated,true);
});

test('a rejected native readiness promise is propagated, never accepted as fallback',async()=>{
 const {ch,owner}=fixture();owner.ready=Promise.reject(Error('native fetch failed'));
 await assert.rejects(awaitDetailSourceOwner(ch,1000),/native fetch failed/);
});
test('scalar material ignores groups while array material obeys groups',()=>{
 const a=draw([[1,2,3],[4,5,6]]);a.mesh.geometry.groups=[{start:0,count:1,materialIndex:0}];
 assert.equal(detailCpuDrawBounds(a.root,a.vector,{}).indexedVertices,2);
 a.mesh.material=[{visible:true,colorWrite:true}];
 assert.equal(detailCpuDrawBounds(a.root,a.vector,{}).indexedVertices,1);
 a.mesh.geometry.groups=[];assert.equal(detailCpuDrawBounds(a.root,a.vector,{}).indexedVertices,0);
});

test('owner visibility reads hidden ancestors without changing native flags or names',()=>{
 const scene={visible:true},root={visible:true,parent:scene},model={visible:false,parent:root,scale:{toArray:()=>[1,1,1]}};
 const mesh={isMesh:true,visible:true,parent:model,geometry:{index:{}}};
 root.traverse=fn=>[root,model,mesh].forEach(fn);
 const ch={root,model,sourceMotion:{status:'ready',active:true,currentClips:[]}};
 const before=JSON.stringify(ch),out=detailOwnerVisibility(ch,scene);
 assert.equal(out.localVisibleMeshes,1);assert.equal(out.nativeAncestorVisibleMeshes,0);
 assert.equal(out.hiddenAncestorChains[0].firstHidden,'character-model');
 assert.equal(out.owners.modelVisible,false);assert.equal(JSON.stringify(ch),before);
});
test('CPU unsupported reason counters distinguish API, index and instancing without pretending bounds exist',()=>{
 const mesh={isMesh:true,isInstancedMesh:true,geometry:{}};
 const root={traverseVisible:fn=>fn(mesh)};
 const out=detailCpuDrawBounds(root,()=>{throw Error('unsupported mesh must not evaluate vertices');},{});
 assert.deepEqual(out.unsupportedReasons,{instanced:1,missingIndex:1,missingVertexApi:1});
 assert.equal(out.unsupportedMeshes,1);assert.equal(out.indexedVertices,0);assert.equal(out.worldMin,null);
});
