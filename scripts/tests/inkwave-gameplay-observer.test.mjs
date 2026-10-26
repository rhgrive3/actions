import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installGameplayObserver} from '../lib/inkwave-gameplay-observer.mjs';

function fixture({timers=false}={}) {
 const extension={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
 const calls=[],queries=[];
 class GL {
  QUERY_RESULT_AVAILABLE=3;QUERY_RESULT=4;CURRENT_QUERY=5;
  active=null;disjoint=false;
  bufferData(...args){calls.push(['bufferData',this,...args]);return 17;}
  bufferSubData(...args){calls.push(['bufferSubData',this,...args]);return 19;}
  getExtension(){return timers?extension:null;}
  isContextLost(){return false;}
  createQuery(){const query={available:false,deleted:false};queries.push(query);return query;}
  deleteQuery(query){assert.equal(query.deleted,false);query.deleted=true;}
  beginQuery(target,query){assert.equal(this.active,null,'must not nest timer queries');this.active=query;}
  endQuery(){assert.ok(this.active);this.active=null;}
  getQuery(){return this.active;}
  getParameter(){return this.disjoint;}
  getQueryParameter(query,name){return name===this.QUERY_RESULT_AVAILABLE?query.available:2_500_000;}
 }
 const gl=new GL(),context=vm.createContext({WebGL2RenderingContext:GL,performance,WeakRef});
 vm.runInContext(`(${installGameplayObserver.toString()})()`,context);
 const owner=()=>({calls:0,update(dt){this.calls++;return dt;},flush(){this.calls++;},render(){this.calls++;return 23;}});
 const G={renderer:{getContext:()=>gl,info:{render:{calls:4,triangles:6}}},paint:owner(),match:owner(),fx:owner(),projectiles:owner()};
 const game={match:G.match,R:owner(),_frame(dt){G.paint.flush();this.match.update(dt);return this.R.render();}};
 context.__G=G;context.__inkwave=game;
 context.__startGameplayObserver();
 return {context,gl,calls,queries,G,game,owner,probe:context.__gameplayProbe};
}

test('upload receipt distinguishes allocation from transfer and preserves typed ranges and native arguments',()=>{
 const {gl,calls,probe}=fixture();
 const view=new DataView(new ArrayBuffer(24),4,16),typed=new Uint16Array(10);
 assert.equal(gl.bufferData(1,view,2),17);
 assert.equal(gl.bufferData(1,32,2),17);
 assert.equal(gl.bufferData(1,typed,2,2,3),17);
 assert.equal(gl.bufferSubData(1,0,typed,3,0),19); // zero length means remaining elements
 assert.equal(gl.bufferSubData(1,0,view,2,4),19); // DataView ranges use bytes
 assert.equal(probe.gpu.bufferAllocationBytes,54);
 assert.equal(probe.gpu.bufferUploadBytes,40);
 assert.equal(probe.gpu.bufferUploads,5);
 assert.equal(calls[0][1],gl);
 assert.equal(calls[0][3],view);
 assert.deepEqual(calls[2].slice(2),[1,typed,2,2,3]);
});

test('frame observation follows replaced match and paint owners without duplicate wrappers',()=>{
 const {context,G,game,owner,probe}=fixture();
 assert.equal(game._frame(.02),23);
 const oldMatch=game.match,oldPaint=G.paint;
 game.match=G.match=owner();G.paint=owner();
 assert.equal(game._frame(.03),23);
 assert.equal(game._frame(.04),23);
 assert.equal(oldMatch.calls,1);assert.equal(oldPaint.calls,1);
 assert.equal(game.match.calls,2);assert.equal(G.paint.calls,2);
 assert.equal(probe.owners.match.calls,3);assert.equal(probe.owners.paint.calls,3);
 assert.equal(probe.owners.render.calls,3);assert.equal(probe.windowFrames,3);
 assert.equal(context.__startGameplayObserver(),false);
 assert.equal(game._frame(.05),23);assert.equal(probe.owners.match.calls,4);
});

test('crab receipts observe native disposal and retain only weak actor and mesh handles',()=>{
 const {context,game,probe}=fixture();
 const geometry=new EventTarget(),materials=[new EventTarget(),new EventTarget()];
 const mesh={geometry,material:materials,parent:{}},actor={_s3AllSpecialState:{ballMesh:mesh}};
 context.__watchCrabBall(actor,7);game._frame(.02);game._frame(.02);
 const record=probe.crab[0];
 assert.ok(record.actor instanceof WeakRef);assert.ok(record.mesh instanceof WeakRef);
 assert.equal(record.actor.deref(),actor);assert.equal(record.mesh.deref(),mesh);
 for(const value of Object.values(record))assert.ok(value===null||typeof value!=='object'||value instanceof WeakRef,'observer record must not own game objects');
 let receipt=context.__crabReceipts()[0];
 assert.equal(receipt.created,1);assert.equal(receipt.inScene,true);assert.equal(receipt.seenInScene,true);
 geometry.dispatchEvent(new Event('dispose'));for(const material of materials)material.dispatchEvent(new Event('dispose'));
 mesh.parent=null;actor._s3AllSpecialState=null;
 game._frame(.02);receipt=context.__crabReceipts()[0];
 assert.equal(receipt.inScene,false);assert.equal(receipt.geometryDisposed,1);assert.equal(receipt.materialDisposed,2);
 assert.equal(receipt.created,1);
 for(const value of Object.values(receipt))assert.ok(['boolean','number'].includes(typeof value),'exported receipt must contain scalar evidence only');
});

test('GPU timer polls without waiting, drops disjoint results and deletes every owned query',()=>{
 const {context,game,gl,queries,probe}=fixture({timers:true});
 game._frame(.02);assert.equal(queries.length,1);assert.equal(gl.active,null);
 game._frame(.02);assert.equal(queries.length,1,'pending query must not allocate another');
 queries[0].available=true;game._frame(.02);
 assert.equal(queries[0].deleted,true);assert.equal(queries.length,2);assert.equal(probe.gpuRenderMs[0],2.5);
 gl.disjoint=true;queries[1].available=true;game._frame(.02);
 assert.equal(queries[1].deleted,true);assert.equal(probe.gpuRenderMs.length,1);assert.equal(probe.gpuTimer.disjointSamples,1);
 context.__stopGameplayObserver();context.__stopGameplayObserver();
 assert.equal(queries.every(query=>query.deleted),true);assert.equal(probe.gpu.resources.Query.live,0);
});

test('GPU timer avoids an existing query and ends its own query even if native render throws',()=>{
 const {context,game,gl,queries}=fixture({timers:true});
 const external={};gl.active=external;game._frame(.02);
 assert.equal(queries.length,0);assert.equal(gl.active,external);
 gl.active=null;
 const failure=new Error('render failure');game.R={render(){throw failure;}};
 assert.throws(()=>game._frame(.02),error=>error===failure);
 assert.equal(gl.active,null);assert.equal(queries.length,1);
 context.__stopGameplayObserver();assert.equal(queries[0].deleted,true);
});
