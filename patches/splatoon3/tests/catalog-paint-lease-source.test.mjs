import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {catalogPaintEllipse} from '../runtime/catalog-splash-paint.mjs';

test('source catalogue paint leases unwind on throw and keep only eight nested scratch slots',()=>{
 assert.equal(!!process.env.INKWAVE_BUILT_SITE,false,'source owner test cannot target an emitted artifact');
 const source=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8');
 const anchor='  const _paintTangent = new THREE.Vector3(), _paintCross = new THREE.Vector3(), _paintCentre = new THREE.Vector3(), _impactHorizDir = new THREE.Vector3();\n';
 const start=source.indexOf(anchor),paintStart=source.indexOf('  function paint(',start),end=source.indexOf('  function floorPaint(',paintStart);
 assert.ok(start>=0&&paintStart>start&&end>paintStart,'actual lexical owner and paint boundaries');
 const prelude=source.slice(start,paintStart);assert.match(prelude,/const _paintScratch = \[\{tangent:_paintTangent,cross:_paintCross,centre:_paintCentre\}\];\n  let _paintDepth = 0;\n$/);
 let allocations=0;class CountVector extends T.Vector3{constructor(...args){super(...args);allocations++;}}
 const three={...T,Vector3:CountVector},owner={remote:false,team:0,addTurf(){}},G={level:{faces:[{n:new T.Vector3(0,1,0)}]}};
 let paint,depth=0,limit=0,throwAt=-1,seen=0;G.paint={splat(center,r,team,opts){
  const before=[...center.toArray(),...opts.stretch.toArray()];seen++;const here=depth++;
  try{if(here===throwAt)throw Error('injected callback failure');if(depth<limit)paint(owner,new T.Vector3(depth*7,1,depth*9),.7,.5,new T.Vector3(.4,.2,.9),0,'shot',.37);
   assert.deepEqual([...center.toArray(),...opts.stretch.toArray()],before,'live lease survives nested calls');return 7;
  }finally{depth--;}
 }};
 paint=new Function('THREE','G','paintFallbackUp','EPS','SOURCE_SHOT_PAINT_KIND','catalogPaintEllipse',prelude+'return ('+source.slice(paintStart,end)+')')(three,G,new T.Vector3(0,1,0),1e-9,3,catalogPaintEllipse);
 function invoke(n,fail=-1){limit=n;throwAt=fail;seen=0;return paint(owner,new T.Vector3(2,1,4),.7,.5,new T.Vector3(.4,.2,.9),0,'shot',.37);}
 invoke(8);assert.equal(seen,8);const warm=allocations;invoke(8);assert.equal(allocations,warm,'warmed nesting reuses vectors');
 assert.throws(()=>invoke(8,3),/injected callback failure/);invoke(8);assert.equal(allocations,warm,'throw restores every lease');
 invoke(12);assert.equal(seen,12,'overflow never drops work');const overflow=allocations;assert.equal(overflow-warm,12,'four overflow slots use transient vectors');
 invoke(12);assert.equal(allocations-overflow,12,'overflow is not retained');
});
