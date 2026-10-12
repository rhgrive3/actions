import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
const IDS=['s3-maneuver-stepper','s3-slosher-washtub'];
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/quad-explosher-main-contracts.json',import.meta.url)));
let promise;const production=()=>promise??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports:"export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
const plain=x=>JSON.parse(JSON.stringify(x));
function signature(d){const h=crypto.createHash('sha256');for(const g of[d.body,d.ink]){for(const a of Object.values(g.attributes))h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));h.update(Buffer.from(g.index.array.buffer));}return h.digest('hex');}
test('both families preserve main hand/muzzle/channel contracts',async()=>{
 const f=await production();for(const [id,b]of Object.entries(baseline.models)){
  const d=f.getWeaponDef(id),socket=k=>({pos:Array.from(d[k].pos.toArray()),quat:Array.from(d[k].quat.toArray())});
  const current={muzzle:Array.from(d.muzzle.toArray()),handR:socket('handR'),handL:socket('handL'),inHand:socket('inHand'),dual:d.dual??false,channels:Object.fromEntries(Object.entries(d.parts).map(([k,p])=>[k,{pivot:Array.from(p.pivot.toArray()),mat:p.mat}]))};
  const {geometryHash,...contract}=b;assert.deepEqual(plain(current),contract,id+' no gameplay frame or animation channel change');

 }
});
// Floating-point tessellation can vary by Node/V8 version. Geometry equality must be
// measured against the actual immutable before build on THIS runner, never another CPU's hash.
const comparison=process.env.QUAD_EXPLOSHER_BASELINE;
test('ten untouched models remain byte-identical to the same-runner before build',{skip:!comparison},async()=>{
 const before=JSON.parse(fs.readFileSync(comparison)),f=await production();
 for(const id of Object.keys(baseline.models))if(!IDS.includes(id))assert.equal(signature(f.getWeaponDef(id)),before[id].geometryHash,id+' untouched geometry');
});
test('rebuilds are bounded merged volumetric assemblies with open loop and recessed burner',async()=>{
 const f=await production();const rows=[];
 for(const id of IDS){const d=f.getWeaponDef(id);let tris=0,bytes=0;for(const g of[d.body,d.ink]){assert.equal(g.groups.length,0);tris+=g.index.count/3;for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;bytes+=g.index.array.byteLength;}
  assert.ok(tris<12000,id+' static triangle budget');assert.ok(bytes<320000,id+' static memory budget');d.body.computeBoundingBox();const size=d.body.boundingBox.getSize(new f.THREE.Vector3());assert.ok(size.x>.07,id+' genuine lateral volume');rows.push({id,tris,bytes,size:Array.from(size.toArray())});}
 // X-ray intersection count through each authored solid, avoiding renderer-specific raycaster exports.
 const hit=(id,y,z)=>{const g=f.getWeaponDef(id).body,p=g.attributes.position,idx=g.index.array;let count=0;for(let j=0;j<idx.length;j+=3){const a=idx[j],b=idx[j+1],c=idx[j+2],ay=p.getY(a),az=p.getZ(a),uy=p.getY(b)-ay,uz=p.getZ(b)-az,vy=p.getY(c)-ay,vz=p.getZ(c)-az,det=uy*vz-uz*vy;if(Math.abs(det)<1e-14)continue;const u=((y-ay)*vz-(z-az)*vy)/det,v=(uy*(z-az)-uz*(y-ay))/det;if(u>=0&&v>=0&&u+v<=1)count++;}return count;};
 assert.equal(hit(IDS[0],.163,.156),0,'quad pull-loop aperture is not a filled silhouette');
 assert.ok(hit(IDS[0],.176,.157)>0,'quad loop crown exists');
 assert.ok(hit(IDS[0],.047,.015)>0,'quad receiver connects to grip');
 assert.ok(hit(IDS[0],-.068,-.022)>0,'quad heel connects to grip');
 assert.equal(hit(IDS[0],-.024,.060),0,'quad open space between grip and front stem');
 console.log('QUAD_EXPLOSHER_METRICS '+JSON.stringify(rows));
});
test('real Actors carry and fire both rebuilds at 30, 60 and 120 Hz with finite pose and unchanged launch sockets',async()=>{
 const f=await production(),{G,THREE}=f;G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const id of IDS)for(const hz of[30,60,120]){const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);let active=0,maxGrip=0;
  for(let n=0;n<2*hz;n++){const fire=n>=hz/2&&n<hz*1.7;a.intent.fire=fire;a.ink=100;G.time+=1/hz;a.weaponRunner.update(1/hz,{fire,firePressed:n===hz/2});a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);assert.ok([...ch.P].every(Number.isFinite));assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));if(a.weaponRunner.busy?.()||a.weaponRunner.firingT>0)active++;const C=f.CHARACTER_CHANNELS;if(n>hz/3&&!ch.dual&&ch.P[C.IKL]>.99&&ch.P[C.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));}
  assert.ok(active>0,id+' really attacks at '+hz);assert.ok(maxGrip<.008,id+' support hand at '+hz);a.weaponRunner.reset();G.scene.remove(ch.root);ch.dispose();
 }
});
