import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PaintDryRegions} from '../paint-dry-region-grid.mjs';
import {adaptPaintRenderRegions} from '../paint-render-regions-adapter.mjs';
import {nativeMipCompatibility} from '../paint-native-mip-guard.mjs';

test('build adapter preserves the existing source and installs all three owners exactly once',()=>{
 const source='export class PaintSystem { _drawQuads(){} _regenerateMipmaps(){} }\nconst blend=THREE.ReverseSubtractEquation;';
 const result=adaptPaintRenderRegions('src/world/paint.js',source);
 assert.equal(result.split(source).length,2);
 assert.ok(result.indexOf('installPaintRegionalMips(PaintSystem);')<result.indexOf('installPaintDryRegions(PaintSystem);'));
 assert.ok(result.indexOf('installPaintDryRegions(PaintSystem);')<result.indexOf('installPaintProfileBatch(PaintSystem);'));
 assert.equal(result.split('installPaintProfileBatch(PaintSystem);').length,2);
 assert.throws(()=>adaptPaintRenderRegions('src/world/paint.js',result),/already composed/);
 assert.throws(()=>adaptPaintRenderRegions('src/world/paint.js','class Unknown {}'),/contract missing/);
 assert.equal(adaptPaintRenderRegions('src/main.js',source),source);
});

test('sparse region coverage exactly preserves UNORM8 drying over 900 deterministic mixed frames',()=>{
 for(const top of [1,.73]){
  const N=64,t=new PaintDryRegions(N,top),base=new Uint8Array(N*N),fast=new Uint8Array(base.length);
  let rng=0x38fed;const random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);
  for(let f=0;f<900;f++){
   const drying=f%3===0,n=drying?2+(f%9):0,next=t.credit+(drying?n-1:0);
   if(drying)t.expire();
   let rect=null;
   if(f%5===0&&f<300||f>750&&f%6===0){
    const x0=Math.floor(random()*58),y0=Math.floor(random()*58),x1=Math.min(N,x0+2+Math.floor(random()*5)),y1=Math.min(N,y0+2+Math.floor(random()*5));
    rect=[x0,y0,x1,y1];const x=x0/N*2-1,X=x1/N*2-1,y=y0/N*2-1,Y=y1/N*2-1;
    t.markPositions(new Float32Array([x,y,X,y,X,Y,x,Y]),1,next);
   }
   if(drying){
    t.rebuild();
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){
     if(y+.5>=(top+1)*.5*N)continue;
     const k=y*N+x;base[k]=Math.max(0,base[k]-n);
     let covered=t.full;
     for(let q=0;!covered&&q<t.count;q++){const a=q*4;covered=x+.5>=t.rects[a]*t.tile&&x+.5<t.rects[a+2]*t.tile&&y+.5>=t.rects[a+1]*t.tile&&y+.5<t.rects[a+3]*t.tile;}
     if(covered)fast[k]=Math.max(0,fast[k]-n);
    }
   }
   if(rect){const [x0,y0,x1,y1]=rect;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)base[y*N+x]=fast[y*N+x]=255;}
   t.credit=next;assert.deepEqual(fast,base,'frame '+f+' top '+top);
  }
  t.reset();assert.equal(t.live,0);assert.equal(t.credit,0);assert.ok(t.expiry.every(x=>x===0));
 }
});

test('unknown bounds conservatively retain all cells instead of losing wetness',()=>{
 const t=new PaintDryRegions(2048);t.markPositions(new Float32Array([NaN,0,1,0,1,1,0,1]),1,0);t.rebuild();
 assert.equal(t.live,t.axis*t.axis);assert.equal(t.full,true);t.credit=255;t.expire();assert.equal(t.live,t.axis*t.axis);
 t.credit=256;t.expire();assert.equal(t.live,0);
 assert.throws(()=>new PaintDryRegions(0),RangeError);
 assert.equal(nativeMipCompatibility(null),false);assert.equal(nativeMipCompatibility({}),false);
});

test('normal frame path does not introduce a blocking GPU query or readback',()=>{
 const m=fs.readFileSync(new URL('../paint-regional-mips.mjs',import.meta.url),'utf8');
 const body=m.slice(m.indexOf('function generate(s,plan)'),m.indexOf('\nfunction release(p)'));
 assert.doesNotMatch(body,/readPixels|\.finish\(|getTexParameter|getQueryParameter/);
 const d=fs.readFileSync(new URL('../paint-dry-regions.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(d,/readPixels|\.finish\(|getQueryParameter|fetch\(/);
});
