import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {paintSlosherNearest,slosherNearestPaintSpec} from '../runtime/slosher-nearest-paint.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
test('source-valid missing Sloshing Machine collision subrecord survives cached foot paint and source mutations',()=>{
 const r=MAIN_WEAPON_CATALOG.records.find(r=>r.sourceActor==='WeaponSlosherLauncher');assert(r);
 const source=structuredClone(r.parameters);assert.equal(source.NearestParam.DrawSizeCollisionPaintParam.CollisionParam,undefined);
 const actor={pos:new THREE.Vector3(3,0,4),aimDir:new THREE.Vector3(1,.4,2),grounded:true,alive:true,team:0,weapon:r,addTurf(){}};
 const rows=[],G={physics:{raycast(from,down,len,hit){hit.hit=true;hit.point.set(3,0,4);hit.normal.set(0,1,0);return hit;}},paint:{splat(at,r,t,o){rows.push([at.toArray(),r,t,o.stretch.toArray(),o.stretchAmt]);return 1;}}};
 const expected=slosherNearestPaintSpec(source);
 for(let i=0;i<3;i++)assert.equal(paintSlosherNearest(G,actor,source),1);
 assert.equal(rows.length,3);for(const row of rows)assert.equal(row[1],expected.width);
 const paint=source.NearestParam.DrawSizeCollisionPaintParam;
 paint.CollisionParam={InitRadiusForPlayer:0,EndRadiusForPlayer:0};assert.equal(paintSlosherNearest(G,actor,source),1);
 paint.CollisionParam.InitRadiusForPlayer=1;assert.throws(()=>paintSlosherNearest(G,actor,source),/Unsupported Slosher/);assert.equal(rows.length,4);
 delete paint.CollisionParam;assert.equal(paintSlosherNearest(G,actor,source),1);assert.equal(rows.length,5);
});
