import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Bone,Euler,Group,Quaternion,Vector3} from '../../inkwave-public/vendor/three/build/three.core.js';
const THREE={Bone,Euler,Group,Quaternion,Vector3};

// Numeric-only held-fit regression. No Character, model, geometry or renderer
// construction; the production fit function is extracted without importing it.
const ROOT=new URL('../../',import.meta.url);
const frozenBytes=fs.readFileSync(new URL('patches/local-quality/tests/fixtures/special-fit-7c94a8b-before-358.mjs.txt',ROOT));
assert.equal(createHash('sha256').update(frozenBytes).digest('hex'),'93e6391eeba0e869db0f02f8c5d505733d4de59e0173f89fbca1ef5c70dda530','unchanged frozen special-fit preimage');
const frozenFit=frozenBytes.toString('utf8').trimEnd();
const rng=()=>{let seed=358;return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);};
function fitSource(code){
 const anchor='  function fit(',endAnchor='\n  cp._buildPose=';
 assert.equal(code.split(anchor).length,2,'unique current numeric fit owner');
 const start=code.indexOf(anchor),end=code.indexOf(endAnchor,start);
 assert(end>start,'current fit ends before pose construction');
 return code.slice(start,end);
}

test('special held fit exits only after both constraints perform no projection',()=>{
 const code=fs.readFileSync(new URL('patches/splatoon3/runtime/special-motion.mjs',ROOT),'utf8'),fits=[frozenFit,fitSource(code)].map(s=>new Function(s+'\nreturn fit;')()),random=rng();let before=0,after=0,nonconverged=0;
 // Mirror the real held-prop hierarchy before fit measures refreshed world matrices.
 // Count full subtree passes, not localToWorld's parent-only ancestor refreshes.
 function run(fit,position,left,right,radius,rotation){
  let lengths=0,updates=0;const mk=side=>({a:radius,b:radius,up:{position:new THREE.Vector3(side*.18,0,0),parent:{position:new THREE.Vector3(0,1,0),quaternion:new THREE.Quaternion()}}}),m={shoulders:[new THREE.Vector3(),new THREE.Vector3()],handQ:new THREE.Quaternion(),a:new THREE.Vector3(),b:new THREE.Vector3(),p:new THREE.Vector3(),pole:new THREE.Vector3()},g=new THREE.Group(),kid=new THREE.Group();g.position.fromArray(position);g.quaternion.fromArray(rotation);g.userData={handL:new THREE.Vector3(...left),handR:new THREE.Vector3(...right),handQL:new THREE.Quaternion(),handQR:new THREE.Quaternion(),gripL:new THREE.Vector3(...left),gripR:new THREE.Vector3(...right),holeL:new THREE.Vector3(),holeR:new THREE.Vector3()};const trace=[],ch={limbs:{armL:mk(1),armR:mk(-1)},bones:{handL:new THREE.Bone(),handR:new THREE.Bone()},kid,_kidXform(p,out,q){out.copy(p.position);q.copy(p.quaternion);},_solveLimb(_limb,p,pole,q,w,side){trace.push([p.toArray(),pole.toArray(),q.toArray(),w,side]);}};kid.add(g,ch.bones.handL,ch.bones.handR);const update=kid.updateWorldMatrix;kid.updateWorldMatrix=function(updateParents,updateChildren){if(updateChildren)updates++;return update.call(this,updateParents,updateChildren);};const length=m.b.length;m.b.length=function(){lengths++;return length.call(this);};fit(ch,m,g);return{position:g.position.toArray(),trace,error:m.error,a:m.a.toArray(),b:m.b.toArray(),lengths,updates};
 }
 for(let i=0;i<12000;i++){const p=i<8?[[0,1,0],[-0,1,-0],[1e-12,1,-1e-12],[20,20,20],[NaN,1,0],[Infinity,0,0],[-Infinity,0,0],[0,0,0]][i]:[(random()-.5)*8,random()*5,(random()-.5)*8],left=[(random()-.5)*2,random()-.5,random()-.5],right=[(random()-.5)*2,random()-.5,random()-.5],r=.05+random(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(random()*3,random()*6,random()*3)).toArray();const rows=fits.map(f=>run(f,p,left,right,r,q));before+=rows[0].lengths;after+=rows[1].lengths;if(rows[1].lengths===40)nonconverged++;assert.equal(rows[0].lengths,40);const withoutCount=r=>({...r,lengths:0});assert.deepEqual(withoutCount(rows[1]),withoutCount(rows[0]),'fit case '+i);}
 const stable=fits.map(f=>run(f,[0,1,0],[0,0,0],[0,0,0],1,[0,0,0,1]));assert.deepEqual(stable.map(r=>r.lengths),[40,2]);assert.ok(nonconverged>0&&after<before);
 console.log(JSON.stringify({scope:'actual Three.js fit arithmetic, no rendered-device claim',cases:12000,before,after,nonconverged,stableChecks:stable.map(r=>r.lengths)}));
});
