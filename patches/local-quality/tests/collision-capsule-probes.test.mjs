import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptCollisionHotpath } from '../collision-hotpath-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const SOURCE = fs.readFileSync(new URL('../../../inkwave-public/src/game/physics.js', import.meta.url), 'utf8');
const unique = (code, before, after, label) => {
  assert.equal(code.split(before).length - 1, 1, label + ' unique protected anchor');
  return code.replace(before, after);
};
const OPTIMIZED = adaptCollisionHotpath('src/game/physics.js', SOURCE, unique);
class V {
  constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
  copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  lerp(v,t) { this.x+=(v.x-this.x)*t; this.y+=(v.y-this.y)*t; this.z+=(v.z-this.z)*t; return this; }
}
function getPhysics(source) {
  const begin=source.indexOf('  static pointCapsuleDist(');
  const end=source.indexOf('\n}',begin);
  assert.ok(begin>=0&&end>begin);
  const methods=source.slice(begin,end);
  return new Function('_p','class Physics {\n'+methods+'\n}\nreturn Physics;')(new V());
}
const BASE=getPhysics(SOURCE), FAST=getPhysics(OPTIMIZED);
const random=(seed)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

test('physics hotpath retains build-only source compatibility and syntax',()=>{
  assert.match(OPTIMIZED, /pos\.x \+ radius < b\.aabbMin\.x/);
  assert.match(OPTIMIZED, /Math\.sqrt\(d1\) < Math\.sqrt\(d2\)/);
  assert.doesNotMatch(OPTIMIZED, /const distance2 = \(t\)/);
  assert.doesNotThrow(()=>new vm.SourceTextModule(adaptBuildSource('src/game/physics.js',SOURCE)));
});

test('segment-capsule contact distance, hit threshold and near-tie order remain stable',()=>{
  const rand=random(0x15fea17c);
  let maxDist=0,maxT=0;
  for(let i=0;i<40000;i++){
    const a=new V(rand()*20-10,rand()*6-2,rand()*20-10);
    const b=new V(a.x+(rand()-.5)*8,a.y+(rand()-.5)*5,a.z+(rand()-.5)*8);
    const base=new V(rand()*20-10,rand()*6-2,rand()*20-10);
    const radius=.22+rand()*.5,height=.7+rand()*2.2;
    if(i%31===0){b.copy(a);}
    if(i%29===0){base.x=a.x;base.z=a.z;}
    const orig=BASE.segmentCapsuleDist(a,b,base,radius,height,{t:0,dist:0});
    const fast=FAST.segmentCapsuleDist(a,b,base,radius,height,{t:0,dist:0});
    assert.ok(fast.t>=0&&fast.t<=1, 'segment parameter bounded');
    const dt=Math.abs(orig.t-fast.t),dd=Math.abs(orig.dist-fast.dist);
    maxT=Math.max(maxT,dt);maxDist=Math.max(maxDist,dd);
    assert.ok(dd<=1e-8,'distance mismatch at sample '+i+': '+dd);
    if(Math.abs(orig.dist-(radius+.2))>1e-8)
      assert.equal(fast.dist<=radius+.2,orig.dist<=radius+.2,'threshold '+i);
  }
  // A flat minimum can admit several equally good segment parameters.
  assert.ok(maxT<.05,'no large contact-parameter jump: '+maxT);
  assert.ok(maxDist<1e-8,'max distance deviation '+maxDist);
});
