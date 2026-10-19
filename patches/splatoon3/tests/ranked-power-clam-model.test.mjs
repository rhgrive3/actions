import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
// Source and exact emitted runs must exercise the same namespace end to end.
const {context,THREE,createPowerClamResources,RankedWorld,ClamsRule}=await fixture({extraExports:`
 export {createPowerClamResources} from './patches/splatoon3/runtime/ranked/power-clam-model.mjs';
 export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';
 export {ClamsRule} from './patches/splatoon3/runtime/ranked/clams.mjs';
`});
context.structuredClone=structuredClone;

test('power silhouette, broad colors, bounded one-draw shared resources', () => {
 const r=createPowerClamResources(THREE),g=r.geometry,p=g.attributes.position,n=g.attributes.normal;
 assert.equal(g.index.count/3,288); assert.equal(g.groups.length,0);assert.equal(r.material.vertexColors,true);
 const size=g.boundingBox.getSize(new THREE.Vector3());assert.ok(size.x/size.y>1.9);assert.ok(size.x/size.z>1.8);
 for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
 let positive=0,total=0;
 for(const i of new Set(g.index.array.slice(0,216*3))){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(Math.abs(x)<.4){total++;if(y*n.getY(i)+z*n.getZ(i)>0)positive++;} }
 assert.equal(positive,total,'shell normals face out');
 const palette=new Set();for(let i=0;i<p.count;i++)palette.add([g.attributes.color.getX(i),g.attributes.color.getY(i),g.attributes.color.getZ(i)].join(','));assert.equal(palette.size,3);
 const a=new THREE.Mesh(g,r.material),b=new THREE.Mesh(g,r.material);assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);
 let gd=0,md=0;g.addEventListener('dispose',()=>gd++);r.material.addEventListener('dispose',()=>md++);g.dispose();r.material.dispose();assert.equal(gd,1);assert.equal(md,1);
 console.log(JSON.stringify({triangles:g.index.count/3,draws:1,geometryBytes:g.index.array.byteLength+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0),bounds:size.toArray()}));
});

function majorShape(g) {
 g.computeBoundingBox(); const s=g.boundingBox.getSize(new THREE.Vector3());
 assert.ok(s.x/s.y>1.9 && s.x/s.z>1.8,'pointed horizontal football silhouette');
 const p=g.attributes.position,c=g.attributes.color;assert.ok(c,'fixed shell and bands');
 const leather=new THREE.Color(0x77613c),white=new THREE.Color(0xe9e3d5);
 let brown=0,bands=0,laces=0;
 for(let i=0;i<p.count;i++){
  const x=Math.abs(p.getX(i));
  if(Math.abs(c.getX(i)-leather.r)<1e-6)brown++;
  if(Math.abs(c.getX(i)-white.r)<1e-6){if(x>.27)bands++;if(x<.27 && p.getZ(i)>.18)laces++;}
 }
 assert.ok(brown>20 && bands>20 && laces>20,'brown shell, pale end bands and broad front laces');
}
test('old octahedral marker fails major reference silhouette',()=>{
 const g=new THREE.OctahedronGeometry(.2,0);assert.throws(()=>majorShape(g),/football silhouette/);g.dispose();
});
test('uniform-color corruption loses fixed bands and is rejected',()=>{
 const r=createPowerClamResources(THREE);majorShape(r.geometry);
 r.geometry.attributes.color.array.fill(1);
 assert.throws(()=>majorShape(r.geometry),/brown shell/);r.geometry.dispose();r.material.dispose();
});
test('independent creations preserve exact geometry while resources are separate',()=>{
 const a=createPowerClamResources(THREE),b=createPowerClamResources(THREE);
 assert.notEqual(a.geometry,b.geometry);assert.notEqual(a.material,b.material);
 for(const k of Object.keys(a.geometry.attributes))assert.deepEqual(a.geometry.attributes[k].array,b.geometry.attributes[k].array);
 assert.deepEqual(a.geometry.index.array,b.geometry.index.array);majorShape(a.geometry);
 for(const r of[a,b]){r.geometry.dispose();r.material.dispose();}
});

for(const kind of ['small','power'])test(`real ${kind} throw keeps rule trajectory and reuses visual resources`,()=>{
 for(const team of[0,1]){
  const stage={clams:{spawns:[],goals:[[50,0,50],[-50,0,-50]]}},scene=new THREE.Scene();
  const actor={id:'carrier',nid:'carrier',team,alive:true,yaw:0,pos:new THREE.Vector3(2,0,-3)};
  const engine={event(){}};engine.rule=new ClamsRule(engine,stage);const r=engine.rule;
  r.state.inventories.carrier={team,small:kind==='small'?1:0,power:kind==='power'};
  const world=new RankedWorld({THREE,G:{scene,time:0}},{mode:'clams',actors:[actor]},stage);
  world.update(engine,1/60);assert.equal(world._inventoryMarkers.get('carrier').visible,true);
  const ruleActor={...actor,pos:actor.pos.toArray()},frame={floorAt:()=>0,blocked:()=>false,actors:[]};
  assert.equal(r._throw(ruleActor,{aim:[0,0,1]},frame),true);
  const c=r.state.clams[0];assert.equal(c.kind,kind);assert.equal(c.grounded,false);
  const control=new ClamsRule({event(){}},stage);control.restore(r.snapshot());
  for(let i=0;i<12;i++){
   r._advanceProjectiles(1/60,frame);control._advanceProjectiles(1/60,frame);
   const before=r.snapshot();world.update(engine,1/60);assert.deepEqual(r.snapshot(),before);assert.deepEqual(r.snapshot(),control.snapshot());
   const m=world._clamMarkers.get(c.id).mesh,res=kind==='power'?world.powerClamResources:world.smallClamResources;
   assert.equal(m.geometry,res.geometry);assert.equal(m.material,res.material);assert.equal(m.visible,true);
   assert.equal(m.position.x,c.pos[0]);assert.equal(m.position.z,c.pos[2]);assert.equal(m.position.y,c.pos[1]+(kind==='power'?.255:.066),'Held ball changes must preserve the existing main flight lift');assert.equal(JSON.stringify(m.scale.toArray()),'[1,1,1]');assert.ok(m.rotation.toArray().slice(0,3).every(Number.isFinite));
  }
  assert.equal(world._inventoryMarkers.get('carrier').visible,false);assert.ok(c.pos[2]>-3);
  r.state.clams=[];world.update(engine,1/60);assert.equal(world._clamMarkers.get(c.id).mesh.visible,false);
  world.dispose();assert.equal(scene.children.length,0);
 }
});

// Exercise the exact QA measurement body without starting a browser.
import {readFileSync} from 'node:fs';
test('native QA shell metric measures transformed triangles, not a rule-height proxy',()=>{
 const text=readFileSync(new URL('../../../tools/clam-production-qa/browser.mjs',import.meta.url),'utf8');
 const body=text.match(/const shellDistance=\(mesh,hand\)=>\{([\s\S]*?)\n  \};/);assert.ok(body,'bounded exact QA measurement body');
 assert.equal(text.includes('lowerShellResidual:'),false,'ambiguous proxy removed');
 const distance=new Function('THREE','assert',`return (mesh,hand)=>{${body[1]}}`)(THREE,(v,m)=>assert.ok(v,m));
 const r=createPowerClamResources(THREE),m=new THREE.Mesh(r.geometry,r.material);m.position.set(.7,1.405,-.3);m.rotation.set(.2,.4,.6);m.scale.set(1.2,.8,1.1);m.updateMatrixWorld(true);
 const p=r.geometry.attributes.position,ix=r.geometry.index,tri=new THREE.Triangle();const i=100*3;
 [tri.a,tri.b,tri.c].forEach((v,k)=>v.fromBufferAttribute(p,ix.getX(i+k)).applyMatrix4(m.matrixWorld));
 const center=tri.getMidpoint(new THREE.Vector3()),normal=tri.getNormal(new THREE.Vector3());if(normal.dot(center.clone().sub(m.position))<0)normal.negate();
 const hand=center.clone().addScaledVector(normal,.123),q=distance(m,hand);assert.ok(Math.abs(q.handToSurfaceDistance-.123)<1e-7);assert.equal(q.triangles,216);
 assert.ok(distance(m,tri.a).handToSurfaceDistance<1e-10,'actual shell vertex is surface contact');
 let low=Infinity;for(let k=0;k<216*3;k++)low=Math.min(low,new THREE.Vector3().fromBufferAttribute(p,ix.getX(k)).applyMatrix4(m.matrixWorld).y);assert.equal(q.lowestWorldY,low);
 r.geometry.dispose();r.material.dispose();
});
