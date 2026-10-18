import assert from 'node:assert/strict';
import {coverageFromPbr,applyVariant} from './variants.mjs';
const color=[],pbr=[];
for(let g=0;g<=4;g++)for(let k=0;k<=4-g;k++){
 const w=4-g-k,green=Math.trunc((94*g+105*k+90*w)/4),blue=Math.trunc((190*g+60*k+10*w)/4);
 assert.deepEqual(coverageFromPbr(green,blue),{g,k,w});
 color.push(...[238,238,218].map((v,c)=>Math.trunc((v*w+[185,163,78][c]*g+[22,77,88][c]*k)/4)),255);
 pbr.push(255,green,blue,255);
}
const c=new Uint8Array(color),p=new Uint8Array(pbr);
const rgb=v=>({value:[...v],clone(){return rgb(this.value)},copy(c){this.value=[...c.value]},setRGB(...v){this.value=v}});
let disposed=0;const tex=data=>({image:{data,width:15,height:1},colorSpace:'retained',clone(){return {...this,dispose(){disposed++}}}});
const map=tex(c),packed=tex(p),hook=()=>{},key=()=> 'original';
const shell={map,metalnessMap:packed,roughnessMap:packed,roughness:1,metalness:1,onBeforeCompile:hook,customProgramCacheKey:key};
const rim={color:rgb([.485,.366,.076]),metalness:.75,roughness:.32,onBeforeCompile:hook,customProgramCacheKey:key};
const gear={traverse(fn){fn({isMesh:true,name:'ivory-and-flat-goldfish-art',material:shell});fn({isMesh:true,name:'gold-rim',material:rim});}};
for(const [variant,r] of [['gold-roughness-012',.12],['gold-roughness-060',.60]]){
 const before=disposed,v=applyVariant(gear,variant);assert.equal(shell.map,map);assert.equal(rim.roughness,r);assert.equal(rim.metalness,.75);assert.equal(shell.metalness,1);assert.equal(shell.onBeforeCompile,hook);
 const changed=shell.roughnessMap.image.data;
 for(let i=0;i<p.length;i+=4){const {g}=coverageFromPbr(p[i+1],p[i+2]);assert.equal(changed[i+2],p[i+2]);assert.equal(changed[i],p[i]);assert.equal(changed[i+3],p[i+3]);if(!g)assert.equal(changed[i+1],p[i+1]);}
 assert.deepEqual([...map.image.data],color);assert.deepEqual([...p],pbr);v.restore();v.restore();assert.equal(disposed,before+1);assert.equal(shell.metalnessMap,packed);assert.equal(rim.roughness,.32);
}
console.log('PASS: both roughness variants, all 15 coverage classes, original color/metalness/non-gold unchanged, restore and exact-once clone disposal');
