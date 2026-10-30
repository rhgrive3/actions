import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { createTowerModel } from '../runtime/ranked/tower-model.mjs';
test('presentation has one static draw and stays inside existing deck/pole collision silhouette', () => {
  for (const half of [.8, 1.4]) {
    const mesh = createTowerModel(THREE, half, half);
    assert.equal(mesh.isMesh, true); assert.equal(mesh.children.length, 0);
    assert.equal(mesh.material.vertexColors, true); assert.equal(mesh.material.transparent, false);
    const geometry = mesh.geometry, p = geometry.attributes.position;
    assert.ok(geometry.index.count / 3 < 600);
    for (let i = 0; i < p.count; i++) {
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      assert.ok([x,y,z].every(Number.isFinite));
      assert.ok(y >= -.120001 && y <= 2.010001);
      assert.ok(Math.abs(x) <= half + 1e-6 && Math.abs(z) <= half + 1e-6);
      if (y > .004001) assert.ok(Math.abs(x) <= .28 && Math.abs(z) <= .28, 'above floor stays in pole footprint');
    }
    assert.equal(geometry.attributes.normal.count,p.count); assert.equal(geometry.attributes.color.count,p.count);
    mesh.geometry.dispose(); mesh.material.dispose();
  }
});
test('instances own resources and can be disposed without affecting a later match', () => {
  const a=createTowerModel(THREE,1.4,1.4), b=createTowerModel(THREE,1.4,1.4);
  assert.notEqual(a.geometry,b.geometry); assert.notEqual(a.material,b.material);
  let geo=0,mat=0; a.geometry.addEventListener('dispose',()=>geo++); a.material.addEventListener('dispose',()=>mat++);
  a.geometry.dispose();a.material.dispose();assert.equal(geo,1);assert.equal(mat,1);
  assert.ok(b.geometry.attributes.position.count>0);b.geometry.dispose();b.material.dispose();
});
test('perimeter trim clears the deck without covering the paint or grate layers', () => {
  const mesh=createTowerModel(THREE,1.4,1.4), p=mesh.geometry.attributes.position;
  let trimTop=0;
  for(let i=0;i<p.count;i++) if(Math.abs(p.getX(i))>.28||Math.abs(p.getZ(i))>.28) {
    const y=p.getY(i);
    assert.notEqual(y,0,'no coplanar decorative top at the deck surface');
    if(y>0){trimTop++;assert.ok(y>=.002999 && y<=.004001 && y<.009);}
  }
  assert.ok(trimTop>0);mesh.geometry.dispose();mesh.material.dispose();
});
