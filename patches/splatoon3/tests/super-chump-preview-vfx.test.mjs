import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import * as VfxKit from '../runtime/special-vfx-kit.mjs';

// CPU presentation regression. Execute the shipped Super Chump handler,
// Director.disc wrapper and real ShapePool follow/upload records. The landing
// plan supplier is controlled input; gameplay admission has separate production
// tests. No browser, WebGL shader execution or screenshot claim is made here.
const source=fs.readFileSync(new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
const context=vm.createContext({console});
let suppliedPreview=null,previewReads=0;
const imports=new Map([...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm)]
  .map(([,names,spec])=>[spec,names.split(',').map(n=>n.trim().split(/\s+as\s+/)[0])]));
const module=new vm.SourceTextModule(source+'\nexport {Director as TestDirector,DIRECTORS as TestDirectors};',{context});
await module.link(spec=>{
 const names=imports.get(spec);assert.ok(names,`known static import ${spec}`);
 return new vm.SyntheticModule(names,function(){for(const name of names){
   const value=spec==='./special-vfx-kit.mjs'?VfxKit[name]
     :name==='superChumpLandingPreview'?()=>{previewReads++;return suppliedPreview;}
     :()=>{throw new Error(`Unexpected dependency in isolated VFX case: ${name}`);};
   this.setExport(name,value);
 }},{context});
});
await module.evaluate();
const {TestDirector,TestDirectors}=module.namespace;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} != ${b}`);
function plan(offset=0){return{target:new THREE.Vector3(offset,2,15),
 positions:Array.from({length:12},(_,i)=>new THREE.Vector3(offset+i,2+i/10,12+i))};}
function setup(){
 suppliedPreview=plan();previewReads=0;
 const root=new THREE.Group(),director=new TestDirector({THREE,G:{}},{root,q:.35});
 const actor={isLocal:true},track={id:'superChump',color:[1,.4,.1],d:{}};
 const frame=()=>TestDirectors.superChump.frame.call(director,actor,track);
 return{director,actor,track,frame,pool:director.kit.discs,close:()=>director.kit.dispose()};
}
function alpha(track,visible){
 near(track.d.center.v[11],visible ? .75 : 0,'center alpha');
 for(const r of track.d.marks)near(r.v[11],visible ? .7 : 0,'landing alpha');
}
function uploads(r,visible){
 r.pool.update(0);
 for(let i=0;i<13;i++)near(r.pool.buf[2].array[(i+1)*4+3],visible ? (i===0 ? .75 : .7) : 0,'uploaded alpha');
}
function sameRecords(actual,expected){assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert.equal(actual[i],expected[i]);}

test('Super Chump hold creates one retained center and twelve real shape records',()=>{
 const r=setup();try{
   r.frame();assert.equal(r.pool.recs.length,13);assert.equal(r.track.d.recs.length,13);
   assert.equal(new Set(r.track.d.recs).size,13);alpha(r.track,true);uploads(r,true);
   near(r.track.d.center.v[1],2.06,'center elevation');
   for(let i=0;i<12;i++)near(r.track.d.marks[i].v[0],i,'actual landing position');
   const handles=[...r.track.d.recs];r.frame();sameRecords(r.track.d.recs,handles);
   assert.equal(r.pool.recs.length,13,'held updates do not allocate duplicate shapes');
 }finally{r.close();}
});

test('a committed null preview hides immediately and stays hidden for all thirteen startup frames',()=>{
 const r=setup();try{
   r.frame();uploads(r,true);const handles=[...r.track.d.recs];
   suppliedPreview=null;r.frame();assert.equal(r.track.d.preview,null);alpha(r.track,false);
   for(let i=0;i<13;i++){r.pool.update(1/60);alpha(r.track,false);}
   uploads(r,false);sameRecords(r.track.d.recs,handles);assert.equal(r.pool.recs.length,13);
   for(const shape of handles){assert.equal(shape.life,0);assert.equal(shape.dead,false);assert.notEqual(shape.retired,true);}
 }finally{r.close();}
});

test('local ownership loss and resume reuse the same records and restore their original alpha',()=>{
 const r=setup();try{
   r.frame();const handles=[...r.track.d.recs],ownerList=r.track.d.recs;
   for(let cycle=0;cycle<3;cycle++){
     const reads=previewReads;r.actor.isLocal=false;r.frame();alpha(r.track,false);uploads(r,false);
     assert.equal(previewReads,reads,'nonlocal presentation does not query local landing guidance');
     suppliedPreview=plan(20+cycle);r.actor.isLocal=true;r.frame();alpha(r.track,true);uploads(r,true);
     near(r.track.d.center.v[0],20+cycle,'resumed center updates');
     near(r.track.d.marks[11].v[0],31+cycle,'resumed final landing updates');
     assert.equal(r.track.d.recs,ownerList);sameRecords(r.track.d.recs,handles);assert.equal(r.pool.recs.length,13);
   }
 }finally{r.close();}
});

test('shape follow callbacks independently hide and restore markers across paused update order',()=>{
 const r=setup();try{
   r.frame();const handles=[...r.track.d.recs];
   // Exercise pool-follow before another Director frame: it must not retain
   // old alpha or return false and retire a record owned by the active track.
   r.track.d.preview=null;
   for(const shape of handles)assert.notEqual(shape.follow(shape,0),false);
   alpha(r.track,false);uploads(r,false);
   r.track.d.preview=plan(40);
   for(const shape of handles)assert.notEqual(shape.follow(shape,0),false);
   alpha(r.track,true);uploads(r,true);near(r.track.d.center.v[0],40,'follow-only resumed center');
   sameRecords(r.track.d.recs,handles);assert.equal(r.pool.recs.length,13);
 }finally{r.close();}
});
