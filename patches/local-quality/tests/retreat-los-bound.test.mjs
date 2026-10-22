import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js',import.meta.url),'utf8');
const a=source.indexOf('  _pickRetreat() {'),b=source.indexOf('\n  _range()',a);const current=source.slice(a,b).trim().replace(/^_pickRetreat\(/,'function(');
const before=current.replace('      const base = st.own * 6 + away * 0.8 - r * 0.15;\n      if (base + (t ? 4 : 0) <= bs) continue;\n      const score = base +','      const score = st.own * 6 + away * 0.8 - r * 0.15 +');assert.notEqual(current,before);
function run(code,seed,withTarget){let state=seed>>>0,draws=0,calls=0;const rand=()=>{draws++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 const math=Object.create(Math);math.random=rand;const G={paint:{regionStats(x,y,z){return {n:Math.abs(x+z)%7<1?0:3,own:Math.abs(Math.sin(x*2+z*3))};}},physics:{los(v,t){calls++;return Math.sin(v.x*3+v.z*7+t.x)>.15;}}};
 const fn=vm.runInNewContext('('+code+')',{THREE,G,Math:math,_v:new THREE.Vector3(),_v2:new THREE.Vector3(),_v3:new THREE.Vector3(),_stats:{}});
 const owner={a:{pos:new THREE.Vector3(seed%11,seed%4,seed%9),team:seed%2},target:withTarget?{pos:new THREE.Vector3(seed%13,seed%7,seed%17)}:null,path:'old',_pathTo(p,r){this.goal=[...p.toArray(),r];}};
 fn.call(owner);return{goal:owner.goal??null,path:owner.path,repath:owner.repath,draws,state,calls};}
test('actual retreat method preserves destination, route request and RNG over 5000 seeded cases',()=>{let oldCalls=0,newCalls=0;for(let seed=0;seed<5000;seed++){const old=run(before,seed,seed%3!==0),now=run(current,seed,seed%3!==0);oldCalls+=old.calls;newCalls+=now.calls;delete old.calls;delete now.calls;assert.deepEqual(now,old);}assert.ok(newCalls<oldCalls*.8,{oldCalls,newCalls});});
