import {createRequire} from 'node:module';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
function compileFunction(...parameters){
 let body=parameters.pop();
 if(process.env.QUEUE_FIXTURE_ESBUILD)body=compactModuleStrings(createRequire(import.meta.url)(process.env.QUEUE_FIXTURE_ESBUILD).transformSync('function fixtureBody(){'+body+'}',{loader:'js',minify:true,charset:'utf8',keepNames:true}).code).code+';return fixtureBody.apply(this,arguments);';
 return new Function(...parameters,body);
}
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {installIssue264PaintOwnership} from '../runtime/paint-ownership.mjs';
import {installMinimapDirty} from '../runtime/minimap-dirty.mjs';
const source=adaptBuildSource('src/world/paint.js',fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js',import.meta.url),'utf8'));
const draw=source.slice(source.indexOf('  _drawQuads() {'),source.indexOf('  // ------------------------------------------------------------ queries'));
const drawQuads=compileFunction('PAINT_GPU_ATTRIBUTE_NAMES','return ({'+draw+'})._drawQuads;')(['aPos','aLocal','aSplat','aStretch','aGrow']);
const clearPart=source.slice(source.indexOf('\n  clear() {'),source.indexOf('  // Camera position for ripple priorities'));
const clear=compileFunction('THREE','RIP_N','return ({'+clearPart+'}).clear;')(THREE,24);
test('actual composed paint draw restores renderer state and blocks retry after a partial pass',t=>{
 const previous={},target={},error=Error('injected render failure');let rt=previous,calls=0;
 const renderer={autoClear:true,getRenderTarget:()=>rt,setRenderTarget:v=>{rt=v;},render(){calls++;throw error;}};
 const geo=new THREE.BufferGeometry();
 for(const [name,size] of [['aPos',2],['aLocal',3],['aSplat',4],['aStretch',3],['aGrow',4]])geo.setAttribute(name,new THREE.BufferAttribute(new Float32Array(4*size),size));
 t.after(()=>geo.dispose());
 const paint={quads:1,dryMesh:{visible:true},mesh:{visible:false},geo,renderer,rt:{texture:{}},scene:{},cam:{},_mipRequested:true,clock:7};
 assert.throws(()=>drawQuads.call(paint),e=>e===error);assert.equal(rt,previous);assert.equal(renderer.autoClear,true);assert.equal(paint.rt.texture.generateMipmaps,false);assert.equal(paint.quads,1);assert.equal(paint._lastMipClock,undefined);
 assert.throws(()=>drawQuads.call(paint),e=>e===error);assert.equal(calls,1,'a partial atlas pass must not be applied twice');
});
test('actual composed clear restores target and clear colour when clearing fails',()=>{
 const previous={},error=Error('injected clear failure'),color=new THREE.Color(.2,.3,.4);let rt=previous,alpha=.7;
 const renderer={getRenderTarget:()=>rt,setRenderTarget:v=>{rt=v;},getClearColor:c=>c.copy(color),getClearAlpha:()=>alpha,setClearColor(c,a){color.set(c);alpha=a;},clear(){throw error;}};
 const paint={renderer,rt:{texture:{}}};assert.throws(()=>clear.call(paint),e=>e===error);assert.equal(rt,previous);assert.deepEqual(color.toArray(),[.2,.3,.4]);assert.equal(alpha,.7);
});
test('ancillary-only accepted ownership writes notify exact minimap cells; repeat and rejected orders do not',()=>{
 class Paint{splat(){}flush(){} _emitGrowth(){}}class Minimap{tickHidden(){}}
 const contract={kind:{speck:7},shapes:Array.from({length:8},()=>[5,3,3,3]),reach:Array(8).fill(4),dripReach:4};
 installIssue264PaintOwnership(Paint,contract);installMinimapDirty({PaintSystem:Paint,Minimap});
 const face={atlas:{ppm:32,pad:2},origin:new THREE.Vector3(-4,0,-4),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1),cu:.1,cv:.1,nu:80,nv:80,grid:0,turf:true,su:8,sv:8};
 const p=new Paint();p.grid=new Uint8Array(6400);p.dead=new Uint8Array(6400);p.counts=[0,0];p.version=0;p.level={native:false};
 const order=p._paintOrderId(),g={entries:[face,4,4,0,0,0,0],R:1.2,kind:3,seed:.37,team:0,age:.4,dur:.2,dripDur:0,paintOrder:order};
 p._advanceSplatOwnership(g,1.5,1);
 const changed=p.grid.reduce((n,x)=>n+Number(x===1),0);assert.ok(changed>0);assert.equal(p.inkDirty.gen,changed);assert.ok(p.inkDirty.x1>=p.inkDirty.x0&&p.inkDirty.z1>=p.inkDirty.z0);
 const before=p.inkDirty.gen;p._advanceSplatOwnership(g,1.5,1);assert.equal(p.inkDirty.gen,before);
 const newer=p._paintOrderId();p._paintOwnershipOrder.fill(newer);p.grid.fill(2);g.age=.5;p._advanceSplatOwnership(g,1.6,1);assert.equal(p.inkDirty.gen,before,'old reordered paint may not dirty or replace a newer owner');
});


test('released growth leases relinquish native/ordinary ancillary cache graphs',()=>{
 const code=fs.readFileSync(new URL('../paint-splat-pool-adapter.mjs',import.meta.url),'utf8');
 const a=code.indexOf('  _releaseSplatGrowth(g) {'),b=code.indexOf('  _disposeSplatPools()',a);
 const release=compileFunction('SPLAT_GROWTH_POOL_MAX','return ({'+code.slice(a,b)+'})._releaseSplatGrowth;')(64);
 const face={},g={entries:[face],_s3AncillaryCells:[[face]],_s3AncillaryTemplates:[face],_s3AncillaryTemplate:face,_s3Wobble:new Map([[1,face]]),_s3SettledAncillary:[face],_ancillaryAllDone:42,_ancillaryFloorDone:42};
 const paint={_splatGrowthPool:[],_releaseSplatEntries(entries){entries.length=0;}};release.call(paint,g);
 assert.equal(paint._splatGrowthPool[0],g);for(const name of ['entries','_s3AncillaryCells','_s3AncillaryTemplates','_s3AncillaryTemplate','_s3Wobble','_s3SettledAncillary'])assert.equal(g[name],null,name);
 assert.equal(g._ancillaryAllDone,0);assert.equal(g._ancillaryFloorDone,0);
});
