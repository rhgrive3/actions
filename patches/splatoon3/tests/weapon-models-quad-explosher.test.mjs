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
 assert.ok(hit(IDS[0],.047,.004)>0,'quad receiver connects to grip');
 assert.ok(hit(IDS[0],-.067,-.048)>0,'quad heel connects to grip');
 assert.equal(hit(IDS[0],-.024,.060),0,'quad open space between grip and front stem');
 // The swept deck is a closed volume: its top faces must face outward, not disappear by back-face culling.
 const deck=f.getWeaponDef(IDS[0]).body,dp=deck.attributes.position,di=deck.index.array;let tops=0;
 for(let j=0;j<di.length;j+=3){const a=new f.THREE.Vector3().fromBufferAttribute(dp,di[j]),b=new f.THREE.Vector3().fromBufferAttribute(dp,di[j+1]),c=new f.THREE.Vector3().fromBufferAttribute(dp,di[j+2]);const center=a.clone().add(b).add(c).multiplyScalar(1/3);if(Math.abs(center.x)<.020&&center.z>-.010&&center.z<.025&&center.y>-.085&&center.y<-.079){const n=b.clone().sub(a).cross(c.clone().sub(a));assert.ok(n.y>0,'quad swept deck top has outward winding');tops++;}}
 assert.ok(tops>=2,'quad swept deck top witnesses exist');
 // The Dark receiver has a broad cover around one recessed mechanical band, with real depth.
 let cheekArea=0;const dc=deck.attributes.color;
 for(let j=0;j<di.length;j+=3){const ids=[di[j],di[j+1],di[j+2]],v=ids.map(i=>new f.THREE.Vector3().fromBufferAttribute(dp,i)),c=v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3),n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(Math.abs(c.x)>.0162&&c.z>.018&&c.z<.100&&c.y>.035&&c.y<.096&&dc.getX(ids[0])>.6&&Math.abs(n.x)>n.length()*.99)cheekArea+=n.length()/2;}
 assert.ok(cheekArea>.005,'Dark chamber has broad planar side-cover area');
 assert.ok(hit(IDS[0],-.068,.100)>0,'front rebound blades connect back into the sole');
 let receiverHalfWidth=0;for(let i=0;i<dp.count;i++)if(dp.getZ(i)>.033&&dp.getZ(i)<.052&&dp.getY(i)>.041&&dp.getY(i)<.096)receiverHalfWidth=Math.max(receiverHalfWidth,Math.abs(dp.getX(i)));assert.ok(receiverHalfWidth>.022,'rounded receiver has real front-view thickness');
 // Bent blade thickness must follow its surface normal rather than invert into the opposite cap.
 const tangentY=Math.cos(-.45)-.5,tangentZ=Math.sin(-.45)+2.575;
 for(const sx of[-1,1]){const normal=new f.THREE.Vector3(0,-tangentZ,tangentY).normalize(),worldNormal=normal.clone().applyAxisAngle(new f.THREE.Vector3(0,1,0),sx*.52);let witnesses=0;
  for(let j=0;j<di.length;j+=3){const ids=[di[j],di[j+1],di[j+2]],world=ids.map(i=>new f.THREE.Vector3().fromBufferAttribute(dp,i)),local=world.map(p=>p.clone().sub(new f.THREE.Vector3(sx*.036,-.044,.153)).applyAxisAngle(new f.THREE.Vector3(0,1,0),-sx*.52));
   if(!local.every(p=>Math.abs(p.x)<.025&&p.y<-.019&&p.y>-.034))continue;
   const thickness=local.map(p=>(p.y+.007)*normal.y+(p.z-.03605)*normal.z);
   if(!thickness.every(w=>Math.abs(w-.005)<2e-5))continue;
   const n=world[1].clone().sub(world[0]).cross(world[2].clone().sub(world[0]));assert.ok(n.dot(worldNormal)>0,'bent black blade outer cap winding');witnesses++;
  }assert.ok(witnesses>=2,'both bent blade lower outer caps have measurable thickness');
 }

 let heelWidth=0;for(let i=0;i<dp.count;i++)if(dp.getY(i)>-.060&&dp.getY(i)<-.020&&dp.getZ(i)>-.063&&dp.getZ(i)<-.012)heelWidth=Math.max(heelWidth,Math.abs(dp.getX(i)));assert.ok(heelWidth>.040,'quad rear heel has real transverse flare');
 const ex=f.getWeaponDef(IDS[1]).body,ep=ex.attributes.position,em=ex.attributes.aMat;let cageMetal=0;for(let i=0;i<ep.count;i++)if(Math.abs(ep.getX(i))>.084&&ep.getZ(i)>.06&&ep.getZ(i)<.245&&Math.round(em.getX(i))===3)cageMetal++;assert.ok(cageMetal>50,'explosher exposed cage uses existing brushed-metal class');
 console.log('QUAD_EXPLOSHER_METRICS '+JSON.stringify(rows));
});
test('angle-only Explosher trial keeps the fe242 mouth centre fixed',async()=>{
 const f=await production(),g=f.getWeaponDef(IDS[1]).body,p=g.attributes.position,c=g.attributes.color;
 const centre=new f.THREE.Vector3(0,.069+Math.sin(.48)*.05472,.249+Math.cos(.48)*.05472),axis=new f.THREE.Vector3(0,Math.sin(.70),Math.cos(.70));
 const brass=new f.THREE.Color('#d1b76e'),bounds=new f.THREE.Box3();let witnesses=0;
 for(let i=0;i<p.count;i++){
  if(Math.max(Math.abs(c.getX(i)-brass.r),Math.abs(c.getY(i)-brass.g),Math.abs(c.getZ(i)-brass.b))>1e-6)continue;
  const point=new f.THREE.Vector3().fromBufferAttribute(p,i),delta=point.clone().sub(centre),axial=delta.dot(axis),radius=Math.sqrt(Math.max(0,delta.lengthSq()-axial*axial));
  if(Math.abs(axial)<.0016&&radius>.0538&&radius<.0582){bounds.expandByPoint(point);witnesses++;}
 }
 assert.ok(witnesses>=140,'lip-ring vertex witnesses');assert.ok(bounds.getCenter(new f.THREE.Vector3()).distanceTo(centre)<2e-6,'authored lip centre stays within 2 micrometres');
});
test('Dark Tetra target palette does not inherit Light Tetra colour volumes',async()=>{
 const f=await production(),d=f.getWeaponDef(IDS[0]),p=d.body.attributes.position,c=d.body.attributes.color,ip=d.ink.attributes.position;
 // The target render shows team colour only on the sole triangle and paired front circles.
 for(let i=0;i<ip.count;i++){const x=ip.getX(i),y=ip.getY(i),z=ip.getZ(i);if(x===0&&y===0&&z===0)continue;/* native hidden-channel degenerate sentinel */assert.ok(y<-.02,'no team-coloured receiver chamber');assert.ok((z>-.073&&z<-.018&&y>-.082&&y<-.074)||(z>.140&&y>-.067),'no team-coloured rebound cushion');}
 const expected=new f.THREE.Color('#e8e8e1');let whiteChamber=0,whiteCushion=0;const blackSides=[0,0],greyPads=[0,0];
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=c.getX(i),g=c.getY(i),b=c.getZ(i),side=x<0?0:1;
  if(Math.abs(r-expected.r)<1e-6&&Math.abs(g-expected.g)<1e-6&&Math.abs(b-expected.b)<1e-6){if(z>.010&&z<.125&&y>.035&&y<.096)whiteChamber++;if(y<-.085)whiteCushion++;}
  if(z<.010&&z>-.065&&y>.005&&y<.10&&Math.abs(x)>.014){if(Math.max(r,g,b)<.025)blackSides[side]++;if(r>.10&&r<.25&&g>.10&&g<.25)greyPads[side]++;}
 }
 assert.ok(whiteChamber>20&&whiteCushion>100,'Dark pale chambers and cushions are static body colours');for(let i=0;i<2;i++){assert.ok(blackSides[i]>20,'both rear cheeks are black');assert.ok(greyPads[i]>20,'both rear pads are grey');}
});
test('real Actors carry and fire both rebuilds at 30, 60 and 120 Hz with finite pose and unchanged launch sockets',async()=>{
 const f=await production(),{G,THREE}=f;G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const id of IDS)for(const hz of[30,60,120]){const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);let active=0,maxGrip=0;
  for(let n=0;n<2*hz;n++){const fire=n>=hz/2&&n<hz*1.7;a.intent.fire=fire;a.ink=100;G.time+=1/hz;a.weaponRunner.update(1/hz,{fire,firePressed:n===hz/2});a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);assert.ok([...ch.P].every(Number.isFinite));assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));if(a.weaponRunner.busy?.()||a.weaponRunner.firingT>0)active++;const C=f.CHARACTER_CHANNELS;if(n>hz/3&&!ch.dual&&ch.P[C.IKL]>.99&&ch.P[C.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));}
  assert.ok(active>0,id+' really attacks at '+hz);assert.ok(maxGrip<.008,id+' support hand at '+hz);a.weaponRunner.reset();G.scene.remove(ch.root);ch.dispose();
 }
});
