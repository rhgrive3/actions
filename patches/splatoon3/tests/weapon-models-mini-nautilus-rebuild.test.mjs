import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './source-fixture.mjs';
const TARGETS=['s3-spinner-quick','s3-spinner-serein'];
let loaded;const production=()=>loaded??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports:"export {getWeaponDef} from './inkwave-public/src/game/character-weapons.js';\nexport {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
function geometryHash(d){const h=createHash('sha256');for(const k of['body','ink','bodyStatic','inkStatic','drum','drumCaps','glow']){h.update(k);const g=d[k];if(!g)continue;for(const [key,a]of Object.entries(g.attributes)){h.update(key);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}}for(const[k,p]of Object.entries(d.parts)){for(const[key,a]of Object.entries(p.geo.attributes)){h.update(k+key);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}h.update(Buffer.from(p.geo.index.array.buffer));}return h.digest('hex');}
test('three untouched spinners preserve main geometry while Ballpoint owns its separate transparent-shell revision',async()=>{
 const f=await production(),hashes={splatling:'04476159da61b7eac3e3eaa6fce5954ac5cdac1dc81cd3bac3c4b27024171f9c','s3-spinner-hyper':'ce3f8b84582a538d44c30b43e828122a4a171b41306dba1bc4ab0cf0a6472ee9','s3-spinner-hypershort':'4ee5f5dd9acc1c355d31ee021d19b73098dd49edba8df33299a09438124c98a6'};
 for(const[id,hash]of Object.entries(hashes))assert.equal(geometryHash(f.getWeaponDef(id)),hash,id+' all geometry attributes/index including moving channels');
 // The transparent Ballpoint is intentionally NOT one of the unchanged four from PR1276.
 // Pin its actual post-integration opaque geometry and separately require a live, indexed shell.
 const ball=f.getWeaponDef('s3-spinner-downpour');
 assert.equal(geometryHash(ball),'c6202da579d5a2fd44d07a4063e10a4fb60487417c7d210cdc8eb4812617c827');
 assert.ok(ball.glass?.index?.count>0,'Ballpoint shell survives composition');
 assert.equal(ball.parts.barrels.mat,'ink','ink barrel remains visible through shell');
});
test('rebuilt Mini and Nautilus retain firing, grip and spin sockets without extra draw groups',async()=>{
 const f=await production();for(let i=0;i<TARGETS.length;i++){
  const id=TARGETS[i],d=f.getWeaponDef(id);assert.deepEqual(Array.from(d.muzzle.toArray()),[0,.07,[.334,.298][i]]);assert.deepEqual(Array.from(d.gripL.pos.toArray()),[0,0,.1515]);assert.deepEqual(Array.from(d.gripR.pos.toArray()),[0,0,0]);assert.deepEqual(Array.from(d.parts.barrels.pivot.toArray()),[0,.07,.3]);
  assert.deepEqual(Object.keys(d.parts).sort(),['barrels','trigger']);let triangles=0;for(const g of[d.body,d.ink,d.drum,d.drumCaps,d.glow].filter(Boolean)){triangles+=g.index.count/3;assert.equal(g.groups.length,0);}
  assert.ok(triangles<10000,id+' triangles '+triangles);assert.equal(f.getWeaponDef(id),d);console.log('MINI_NAUTILUS_GEOMETRY '+JSON.stringify({id,triangles,hash:geometryHash(d)}));
 }
});
test('actual Actor keeps two-hand attachment and barrel motion finite at 30, 60 and 120 Hz',async()=>{
 const f=await production(),{G,THREE}=f;G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,o)=>{o.length=0;return o;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const id of TARGETS)for(const hz of[30,60,120]){
  const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);let attacked=0,maxGrip=0;const shotStart=G.projectiles.list.length;
  for(let n=0;n<4*hz;n++){const fire=n>=hz&&n<3*hz;a.intent.fire=fire;a.ink=100;G.time+=1/hz;a.weaponRunner.update(1/hz,{fire,firePressed:n===hz});a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);assert.ok([...ch.P].every(Number.isFinite));assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));if(a.weaponRunner.charging||a.weaponRunner.streaming)attacked++;if(n>hz/2&&ch.P[f.CHARACTER_CHANNELS.IKL]>.99&&ch.P[f.CHARACTER_CHANNELS.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));}
  assert.ok(attacked>0);assert.ok(G.projectiles.list.length>shotStart,id+' actually emitted projectiles at '+hz+'Hz');assert.ok(maxGrip<.008,id+' '+hz+'Hz '+maxGrip);assert.ok(ch.weapon.parts.barrels.rotation.toArray().slice(0,3).every(Number.isFinite));a.weaponRunner.reset();G.scene.remove(ch.root);ch.dispose();
 }
});
// Scalar ray/triangle sampling also works against the tree-shaken emitted runtime (no Raycaster dependency).
function frontHit(g,x,y){const p=g.attributes.position,c=g.attributes.color,idx=g.index.array;let hit=null;for(let j=0;j<idx.length;j+=3){const a=idx[j],b=idx[j+1],d=idx[j+2],ax=p.getX(a),ay=p.getY(a),ux=p.getX(b)-ax,uy=p.getY(b)-ay,vx=p.getX(d)-ax,vy=p.getY(d)-ay,det=ux*vy-uy*vx;if(Math.abs(det)<1e-12)continue;const u=((x-ax)*vy-(y-ay)*vx)/det,v=(ux*(y-ay)-uy*(x-ax))/det;if(u<0||v<0||u+v>1)continue;const z=p.getZ(a)+u*(p.getZ(b)-p.getZ(a))+v*(p.getZ(d)-p.getZ(a));if(!hit||z>hit.z)hit={z,color:[c.getX(a),c.getY(a),c.getZ(a)]};}return hit;}
test('six Mini and three Nautilus nozzles have visible recessed dark throats, not plate-colored caps',async()=>{
 const f=await production();for(const[id,n,r,end]of[['s3-spinner-quick',6,.033,.332],['s3-spinner-serein',3,.026,.296]]){
  const d=f.getWeaponDef(id);for(let k=0;k<n;k++){const a=Math.PI/2+k*Math.PI*2/n,hit=frontHit(d.body,Math.cos(a)*r,.07+Math.sin(a)*r);assert.ok(hit,id+' nozzle '+k);assert.ok(hit.z<end-.003&&hit.z>end-.012,id+' recessed throat '+hit.z);assert.ok(Math.max(...hit.color)<.025,id+' no front plate closing the throat');}
 }
});
