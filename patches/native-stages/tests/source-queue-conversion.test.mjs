import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceOBJ,buildSourceBVH,collision} from '../runtime/source-convert.mjs';
const parser=fs.readFileSync(new URL('./fixtures/source-parser-c0938a3.mjs.txt',import.meta.url),'utf8');
const before=new Function(parser.replace(/^export /gm,'')+'\nreturn parseSourceOBJ;')();
const bvhSource=fs.readFileSync(new URL('./fixtures/source-bvh-c0938a3.mjs.txt',import.meta.url),'utf8');
const bvhBefore=new Function('F',bvhSource.replace(/^export /gm,'')+'\nreturn buildSourceBVH;')(Math.fround);
function obj(count=20){let out='',offset=0,normal=0,uv=0;for(let i=0;i<count;i++){
 const size=3+i%9,hasUV=i%3!==0;out+='o Fld_Pnt_日本語_'+i+'\r\nusemtl Ground_'+i+'\r\n';
 for(let j=0;j<size;j++)out+=`v ${Math.fround(Math.sin(j+i)*5)} ${i%5} ${Math.fround(Math.cos(j)*5)}\r\n`;
 for(let j=0;j<size;j++)out+='vn 0 1 0\r\n';
 if(hasUV)for(let j=0;j<size;j++)out+=`vt ${j/size} ${j%2}\r\n`;
 out+='f '+Array.from({length:size},(_,j)=>`${offset+j+1}/${hasUV?uv+j+1:''}/${normal+j+1}`).join(i%2?'\t':'  ')+'\r\n';
 offset+=size;normal+=size;if(hasUV)uv+=size;
 }return out;}
test('streamed authenticated UTF-8 and tokenized OBJ preserve frozen parser buffers and descriptors',()=>{
 for(const size of [1,2,37,200]){const text=obj(size),expected=before(text);for(const input of [text,new TextEncoder().encode(text),new TextEncoder().encode('\ufeff'+text).buffer])assert.deepEqual(parseSourceOBJ(input),expected);}
});
test('OBJ validation remains fail closed for unsupported indices, incomplete attributes and malformed numbers',()=>{
 const base=obj(1);for(const text of [base.replace('1//1','1/7/1'),base.replace('2//2','-2//2'),base.replace('3//3','3//4'),base.replace('vn 0 1 0','vn NaN 1 0'),base.replace('f 1//1  2//2  3//3','f 1//1  2//2')]){
  let expected;try{before(text);}catch(e){expected=e.message;}assert.ok(expected,'frozen fixture must reject');
  assert.throws(()=>parseSourceOBJ(text),e=>e.message===expected);assert.throws(()=>parseSourceOBJ(new TextEncoder().encode(text)),e=>e.message===expected);
 }
});
test('typed BVH builder matches exact original nodes/order for random, equal-center and degenerate fixtures',()=>{
 let state=43;const rnd=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);
 for(const count of [0,1,12,13,24,25,99,1000,9000])for(const flat of [false,true]){
  const triangles=new Float32Array(count*9);for(let i=0;i<triangles.length;i++)triangles[i]=flat?i%3:(rnd()-.5)*100;
  assert.deepEqual(buildSourceBVH(triangles),bvhBefore(triangles),JSON.stringify({count,flat}));
 }
});
test('collision keeps compact byte-exact outputs including the no-degenerate full-capacity fast path',()=>{
 const geometry=parseSourceOBJ(obj(37)),out=collision(geometry);for(const key of ['triangles','normals','flags','objectIds','areas'])assert.equal(out[key].buffer.byteLength,out[key].byteLength,key+' must not retain overcapacity');
});
