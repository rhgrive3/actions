import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const f=await fixture({extraExports:"export {sphereTriangleEntry} from './patches/native-stages/runtime/sphere-triangle-entry.mjs';"});
const V=a=>new f.THREE.Vector3(...a);
const from=[-1.1029163644181494e-7,-5.6571220169459524e-8,0],delta=[1.0537703949066705e-7,0,0],radius=6.614618108166186e-8,change=-4.199653551258003e-8;
const evaluate=points=>f.sphereTriangleEntry(new f.THREE.Triangle(...points.map(V)),V(from),V(delta),radius,change,V([0,0,0]),V([0,0,0]));
// Ordinary area .5 triangles: the near feature is the origin vertex, not
// a degenerate point primitive. The shrinking sphere never reaches it.
for(const [label,points] of [['forward',[[0,0,0],[0,1,0],[1,0,0]]],['reverse',[[0,0,0],[1,0,0],[0,1,0]]]]){
 test('tiny shrinking sphere must miss ordinary triangle vertex ('+label+' winding)',()=>{
  const r=radius+1e-10,A=delta[0]**2-change**2,B=2*(from[0]*delta[0]-r*change),C=from[0]**2+from[1]**2-r*r;
  assert.ok(A>0&&A<1e-14);assert.ok(B*B-4*A*C<0,'independent vertex distance quadratic has no real root');
  assert.equal(evaluate(points),Infinity);
 });
}
test('tiny shrinking sphere enters ordinary triangle edge at the independent distance root',()=>{
 const points=[[0,-1,0],[0,1,0],[1,0,0]],expected=(-from[0]-(radius+1e-10))/(delta[0]+change),actual=evaluate(points);
 assert.ok(expected>0&&expected<1);assert.ok(Math.abs(actual-expected)<2e-12,`${actual} != ${expected}`);
 const x=from[0]+delta[0]*actual,r=radius+change*actual+1e-10;assert.ok(Math.abs(-x-r)<1e-20);
});
