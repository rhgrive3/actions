import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const IDS=['s3-saber-normal','s3-saber-lite','s3-saber-heavy','s3-stringer-normal','s3-stringer-short','s3-stringer-explosion'];
const MUZZLE=[[0,0,.36],[0,0,.4],[0,0,.375],[0,.085,.178],[0,.085,.15],[0,.085,.205]];
let promise;const prod=()=>promise??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports:"export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
test('rebuilt six keep existing gameplay sockets, cached definitions and bounded geometry',async()=>{
 const f=await prod();let report=[];
 for(let i=0;i<IDS.length;i++){
  const id=IDS[i],d=f.getWeaponDef(id);assert.deepEqual(Array.from(d.muzzle.toArray()),MUZZLE[i],id+' existing launch origin');assert.equal(f.getWeaponDef(id),d,id+' cached');
  const geo=[d.body,d.ink,d.drum,d.drumCaps,d.glow].filter(Boolean);let triangles=0,bytes=0;
  for(const g of geo){triangles+=g.index.count/3;for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;bytes+=g.index.array.byteLength;assert.equal(g.groups.length,0,id+' still merged draws');}
  assert.ok(triangles<16000,id+' bounded triangles '+triangles);assert.ok(bytes<1400000,id+' bounded static geometry '+bytes);
  d.body.computeBoundingBox();const b=d.body.boundingBox,size=b.getSize(new f.THREE.Vector3());assert.ok(size.x>.035,id+' volumetric cross section');
  report.push({id,triangles,bytes,size:size.toArray()});
 }
 console.log('CIRCLED_MODEL_METRICS '+JSON.stringify(report));
});
test('Stamper has a real open grip and independent side plates; Decavitator has raised loop',async()=>{
 const f=await prod();
 function hit(id,y,z){
  // Double-sided X ray against emitted indexed triangles. The production THREE tree-shaker
  // legitimately excludes Raycaster; testing the scalar triangles keeps this test build-native.
  const g=f.getWeaponDef(id).body,p=g.attributes.position,idx=g.index.array;let count=0;
  for(let j=0;j<idx.length;j+=3){const a=idx[j],b=idx[j+1],c=idx[j+2],ay=p.getY(a),az=p.getZ(a),uy=p.getY(b)-ay,uz=p.getZ(b)-az,vy=p.getY(c)-ay,vz=p.getZ(c)-az,det=uy*vz-uz*vy;if(Math.abs(det)<1e-14)continue;const u=((y-ay)*vz-(z-az)*vy)/det,v=(uy*(z-az)-uz*(y-ay))/det;if(u>=0&&v>=0&&u+v<=1)count++;}return count;
 }
 assert.equal(hit('s3-saber-normal',.020,-.032),0,'finger space is open through X');
 assert.ok(hit('s3-saber-normal',0,-.032)>0,'lower handle rail exists');
 assert.ok(hit('s3-saber-heavy',.074,.086)>0,'raised ring crown exists');
 assert.equal(hit('s3-saber-heavy',.053,.086),0,'ring opening stays empty');
});
test('all rebuilt bows preserve charge/release animation channels at 30/60/120 Hz without writing the input state',async()=>{
 const f=await prod();for(const id of IDS.slice(3))for(const hz of[30,60,120]){
  const d=f.getWeaponDef(id),parts={};for(const name of['string','stringL','nock','arrow']){const p=d.parts[name];assert.ok(p);parts[name]=new f.THREE.Object3D();parts[name].position.copy(p.pivot);parts[name].userData.rest=p.pivot.clone();}
  const w={def:d,parts,ps:{}};for(let j=0;j<2*hz;j++){const st=Object.freeze({charge:j<hz?j/hz:0,sinceRelease:j<hz?99:(j-hz)/hz,dt:1/hz});d.animate(w,st);for(const p of Object.values(parts))assert.ok([...p.position.toArray(),...p.rotation.toArray().slice(0,3),...p.scale.toArray()].every(Number.isFinite));}
  assert.ok(Math.abs(w.ps.draw)<.00001,id+' settles after release');assert.ok(parts.string.scale.y>=1);
 }
});
