import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitTrizookaOrbitDelta as current} from '../runtime/trizooka-collision.mjs';
import {perpendicularBasis,VOLLEY_CONFIG,TRIZOOKA_ORBIT} from '../runtime/kit-trizooka.mjs';
const before=fs.readFileSync(new URL('./fixtures/trizooka-orbit-before-scalars-031426fc.mjs.txt',import.meta.url),'utf8').replace('export function','function');
const old=new Function('perpendicularBasis','VOLLEY_CONFIG','TRIZOOKA_ORBIT','isKitProjectile',before+';return kitTrizookaOrbitDelta;')(perpendicularBasis,VOLLEY_CONFIG,TRIZOOKA_ORBIT,p=>!!p&&p.wid==='trizooka');
test('actual orbit scalarization preserves final positions and accessor order, including axis changes and exceptional numbers',()=>{
 const values=[0,-0,1,-1,NaN,Infinity,-Infinity,1e-300,1e300];
 for(const hz of [30,60,120])for(let i=0;i<1500;i++)for(const mutate of [false,true]){
  const axis=[values[i%9],values[Math.floor(i/9)%9],values[Math.floor(i/81)%9]];
  const next=[axis[2],axis[0],axis[1]];
  function run(fn){const reads=[];let calls=0;const vel={lengthSq(){reads.push('length');calls++;return i%5===0?0:1;}};
   for(let k=0;k<3;k++)Object.defineProperty(vel,['x','y','z'][k],{get(){reads.push(k);return mutate&&calls>1?next[k]:axis[k];}});
   const p={wid:i%37?'trizooka':'other',vel,age:[0,10/60,10/60-1e-16,10/60+1e-16,.7,NaN,Infinity][i%7],s3VolleyIndex:i%3,s3Yaw:.3,pos:{x:i%2?-0:1,y:2,z:3}};
   return {result:fn(null,p,i%19?1/hz:0),pos:[p.pos.x,p.pos.y,p.pos.z],applied:p.s3OrbitApplied,reads};}
  assert.deepEqual(run(current),run(old),`${hz}/${i}/${mutate}`);
 }
});
