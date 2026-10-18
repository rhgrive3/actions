import assert from 'node:assert/strict';
import {transformMaps,coverageFromPbr,applyVariant,GOLD_F0,GOLD_SRGB} from './variants.mjs';
const color=[],pbr=[];
for(let g=0;g<=4;g++)for(let k=0;k<=4-g;k++){
 const w=4-g-k,green=Math.trunc((94*g+105*k+90*w)/4),blue=Math.trunc((190*g+60*k+10*w)/4);
 assert.deepEqual(coverageFromPbr(green,blue),{g,k,w});
 color.push(...[238,238,218].map((v,c)=>Math.trunc((v*w+[185,163,78][c]*g+[22,77,88][c]*k)/4)),255);
 pbr.push(255,green,blue,255);
}
const c=new Uint8Array(color),p=new Uint8Array(pbr),result=transformMaps(c,p);
assert.deepEqual([...c],color);assert.deepEqual([...p],pbr);
let count=0;
for(let i=0;i<p.length;i+=4){const {g}=coverageFromPbr(p[i+1],p[i+2]);assert.equal(result.pbr[i+1],p[i+1]);assert.equal(result.pbr[i+3],255);if(!g){assert.deepEqual(result.color.slice(i,i+4),c.slice(i,i+4));assert.deepEqual(result.pbr.slice(i,i+4),p.slice(i,i+4));}else count++;}
assert.equal(result.changed,count);assert.equal(result.pbr.at(-2),255);assert.deepEqual([...result.color.slice(-4,-1)],GOLD_SRGB.map(Math.trunc));
const rgb=v=>({value:[...v],clone(){return rgb(this.value)},copy(c){this.value=[...c.value]},setRGB(...v){this.value=v}});
let disposed=0;const tex=data=>({image:{data,width:15,height:1},colorSpace:'retained',clone(){return {...this,dispose(){disposed++}}}});
const map=tex(c),packed=tex(p),hook=()=>{},key=()=> 'original';
const shell={map,metalnessMap:packed,roughnessMap:packed,roughness:1,metalness:1,onBeforeCompile:hook,customProgramCacheKey:key};
const rim={color:rgb([.485,.366,.076]),metalness:.75,roughness:.32,onBeforeCompile:hook,customProgramCacheKey:key};
const gear={traverse(fn){fn({isMesh:true,name:'ivory-and-flat-goldfish-art',material:shell});fn({isMesh:true,name:'gold-rim',material:rim});}};
let v=applyVariant(gear,'measured-gold-f0');assert.notEqual(shell.map,map);assert.deepEqual(rim.color.value,GOLD_F0);assert.equal(rim.metalness,1);assert.equal(rim.roughness,.32);assert.equal(shell.roughness,1);assert.equal(shell.onBeforeCompile,hook);v.restore();v.restore();assert.equal(disposed,2);assert.equal(shell.map,map);assert.equal(shell.metalnessMap,packed);assert.equal(rim.metalness,.75);
v=applyVariant(gear,'neutral-hook-disabled');assert.notEqual(shell.onBeforeCompile,hook);assert.equal(shell.map,map);v.restore();assert.equal(shell.onBeforeCompile,hook);assert.equal(shell.customProgramCacheKey,key);
assert.throws(()=>coverageFromPbr(0,0));
console.log('PASS: all 15 coverage classes, source bytes immutable, non-gold bytes unchanged, roughness preserved, restored hooks/maps, exact-once clone disposal');
