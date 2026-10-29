import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{adaptWorldNative20261029}from'../queue-world-native-20261029-adapter.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-fx-before-20261029.json',import.meta.url)))['src/fx/fx.js'],after=adaptWorldNative20261029('src/fx/fx.js',before);
const compile=s=>{const a=s.indexOf('  _updateSprites(pool,'),b=s.indexOf('\n  // ---',a),method=s.slice(a,b).replace('_updateSprites(pool, dt, additive)','(pool, dt, additive)');return new Function('easeOut','markUpdated','return function '+method)(t=>1-(1-t)*(1-t),(_geo,n)=>{_geo.updated=n})};const pair=[compile(before),compile(after)];
function pool(seed,n){const cap=60,a=length=>Float32Array.from({length},(_,i)=>Math.sin(i*.29+seed)*2);const p={n,cap,P:a(cap*3),V:a(cap*3),C:a(cap*3),X:a(cap*14),geo:{attributes:Object.fromEntries(['aPosSize','aColA','aMisc'].map(k=>[k,{array:a(cap*4)}]))}},source=[{_qualityGeneration:2,pos:{x:9,y:8,z:7}},{_qualityDead:true,_qualityGeneration:2,pos:{x:4,y:5,z:6}}];p._netSource=Array.from({length:cap},(_,i)=>i%3?source[i%2]:null);p._netGeneration=Array.from({length:cap},(_,i)=>i%4);for(let i=0;i<cap;i++){p.X[i*14+2]=(i%9)/10;p.X[i*14+3]=.1+i%7/10;p.X[i*14+10]=i%3*.05;p.X[i*14+13]=i%2*.2;}return p}
test('fused actual sprite update retains complete CPU/GPU arrays and swap/recycle/network generation behavior',()=>{
 for(const count of [0,1,2,17,60])for(const additive of [false,true])for(const dt of [0,1/120,1/60,1/30,.1,.5]){
  const a=pool(4,count),b=pool(4,count);for(let i=0;i<5;i++){pair[0](a,dt,additive);pair[1](b,dt,additive);assert.deepEqual(b,a,`${count}/${additive}/${dt}/${i}`);}
 }
});
