import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {PaintDryRegions} from '../paint-dry-region-grid.mjs';

const context=vm.createContext({console});
const external=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
const module=new vm.SourceTextModule(fs.readFileSync(new URL('../paint-dry-regions.mjs',import.meta.url),'utf8'),{context});
await module.link(name=>name==='three'?external(THREE):external({PaintDryRegions}));await module.evaluate();
const install=module.namespace.installPaintDryRegions;

function dryGeometry(top=1){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0,1,-1,0,1,top,0,-1,top,0]),3));
 g.setIndex([0,1,2,0,2,3]);return g;
}
function make({native=true,size=128,top=1,type=THREE.UnsignedByteType}={}){
 class Paint {
  constructor(){this.level={native};this.size=size;this.grid=new Uint8Array([1,2,0,2]);this.counts=[1,2];this._initGPU();}
  _initGPU(){
   this.rt=new THREE.WebGLRenderTarget(this.size,this.size,{type,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false});
   this._dryU={uDry:{value:12/255}};
   this.dryMesh=new THREE.Mesh(dryGeometry(top),new THREE.ShaderMaterial({
    uniforms:this._dryU,vertexShader:'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader:'precision highp float; uniform float uDry; void main() { gl_FragColor = vec4(0.0, uDry, 0.0, 0.0); }',
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.CustomBlending,
    blendEquation:THREE.ReverseSubtractEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
    blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
   }));
   this.dryMesh.visible=false;this.quads=0;this.aPos=new Float32Array(8);
  }
  _drawQuads(){
   if(this.throwDraw)throw Error('draw failed');
   this.lastGeometry=this.dryMesh.geometry;this.quads=0;this.dryMesh.visible=false;return 42;
  }
  clear(){this.quads=0;this.dryMesh.visible=false;return 7;}
  dispose(){this.rt.dispose();this.dryMesh.geometry.dispose();this.dryMesh.material.dispose();return 9;}
 }
 install(Paint);return new Paint();
}
function stamp(p){p.aPos.set([-.1,-.1,.1,-.1,.1,.1,-.1,.1]);p.quads=1;p._drawQuads();}
function dry(p){p.dryMesh.visible=true;return p._drawQuads();}

test('native RGBA8 atlases use exact sparse dry geometry without changing ownership',()=>{
 for(const native of [true,false]){
  const p=make({native}),s=p._iwPaintDryRegions,grid=p.grid.slice(),counts=p.counts.slice();assert.ok(s);
  stamp(p);assert.equal(dry(p),42);assert.equal(p.lastGeometry,s.geometry);
  assert.equal(s.counters.sparsePasses,1);assert.ok(s.counters.coveredPixels<s.counters.baselinePixels*.1);
  assert.deepEqual(p.grid,grid);assert.deepEqual(p.counts,counts);assert.equal(p.rt.texture.type,THREE.UnsignedByteType);
  assert.equal(p.dispose(),9);
 }
});

test('native quality transfer tracks all preexisting wet pixels before returning to sparse drying',()=>{
 const p=make(),old=p._iwPaintDryRegions;stamp(p);dry(p);let originalDisposals=0;
 old.original.addEventListener('dispose',()=>originalDisposals++);
 p.size=256;p.rt=new THREE.WebGLRenderTarget(256,256,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat});
 p.dryMesh.geometry.dispose();p.dryMesh.geometry=dryGeometry(.75);dry(p);
 const s=p._iwPaintDryRegions;assert.notEqual(s,old);assert.equal(s.tracker.size,256);assert.equal(originalDisposals,1);
 assert.equal(s.counters.fullPasses,1);assert.equal(p.lastGeometry,s.original);
 // Eleven conservative credits per actual twelve-byte subtraction. Even
 // after the real wetness reached zero, old contents cannot expire early.
 for(let i=0;i<23;i++)dry(p);assert.equal(s.tracker.credit,264);assert.equal(s.counters.fullPasses,24);
 dry(p);assert.equal(s.tracker.live,0);assert.equal(s.counters.sparsePasses,1);assert.equal(s.geometry.drawRange.count,0);
 stamp(p);dry(p);assert.ok(s.tracker.live>0);assert.equal(s.counters.sparsePasses,2);p.dispose();
});

test('clear and native GPU reinitialization never retain prior wet-region state',()=>{
 const p=make();stamp(p);dry(p);const first=p._iwPaintDryRegions;assert.ok(first.tracker.live);
 assert.equal(p.clear(),7);assert.equal(first.tracker.live,0);assert.equal(first.tracker.credit,0);
 dry(p);assert.equal(p.lastGeometry.drawRange.count,0);
 let disposed=0;first.geometry.addEventListener('dispose',()=>disposed++);p._initGPU();
 assert.equal(disposed,1);assert.notEqual(p._iwPaintDryRegions,first);assert.equal(p._iwPaintDryRegions.tracker.live,0);p.dispose();
});

test('native unknown formats, blend mutations and dry shaders retain the canonical full draw',()=>{
 const floating=make({type:THREE.HalfFloatType});assert.equal(floating._iwPaintDryRegions,null);dry(floating);floating.dispose();
 for(const mutate of [p=>p.dryMesh.material.blendEquation=THREE.AddEquation,p=>p.dryMesh.material.fragmentShader+='\n// changed',
  p=>p.dryMesh.material.colorWrite=false,p=>p.dryMesh.material.depthTest=true,p=>p.rt.scissorTest=true,
  p=>p.rt.viewport.z--,p=>p.dryMesh.material.onBeforeCompile=()=>{}]){
  const p=make(),s=p._iwPaintDryRegions;stamp(p);dry(p);mutate(p);dry(p);
  assert.equal(p._iwPaintDryRegions,undefined);assert.equal(p.lastGeometry,s.original);p.dispose();
 }
});

test('a failed native atlas draw does not advance dry expiry credit',()=>{
 const p=make();stamp(p);dry(p);const s=p._iwPaintDryRegions,credit=s.tracker.credit;
 p.throwDraw=true;p.dryMesh.visible=true;assert.throws(()=>p._drawQuads(),/draw failed/);assert.equal(s.tracker.credit,credit);
 p.throwDraw=false;dry(p);assert.equal(s.tracker.credit,credit+11);p.dispose();
});

test('a transferred native atlas with an unknown dry polygon keeps its original geometry',()=>{
 const p=make();stamp(p);dry(p);
 p.rt=new THREE.WebGLRenderTarget(p.size,p.size,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat});
 const geometry=dryGeometry();geometry.attributes.position.setX(0,-.5);p.dryMesh.geometry=geometry;
 dry(p);assert.equal(p._iwPaintDryRegions,undefined);assert.equal(p.lastGeometry,geometry);p.dispose();
});
