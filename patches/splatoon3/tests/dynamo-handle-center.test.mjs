import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const BEFORE_DYNAMO=fs.readFileSync(new URL('./fixtures/dynamo-before-model.txt',import.meta.url),'utf8');
import { fixture } from './source-fixture.mjs';
const ID='s3-roller-heavy';
const sourceDynamo=JSON.parse(fs.readFileSync(new URL('../reference/roller-source-scale-2026-10-19.json',import.meta.url))).records.find(r=>r.id===ID);
// Main now calibrates the model to the independently measured indexed source
// width. Inspect authored coordinates in that basis; scaleWeaponDef deliberately
// preserves the support hand's reach from the main grip along the weapon axis.
const authoredScale=sourceDynamo.width/1.821;
const authoredVector=(v,expected)=>Array.from(v.toArray()).forEach((x,i)=>assert.ok(Math.abs(x/authoredScale-expected[i])<1e-7));
const exports="export {getWeaponDef} from './inkwave-public/src/game/character-weapons.js'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';";
async function production(before=false){
 let state=123;
 const f=await fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports:exports,
  vmMathRandom:()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},
  adaptRuntime:(rel,source)=>{
   if(before&&rel==='patches/splatoon3/runtime/weapon-models/rollers.mjs'){
    const start=source.indexOf('function dynamoRoller(d) {'),end=source.indexOf('// ------------------------------------------------------------------------------------------ Flingza Roller',start);
    assert.ok(start>=0&&end>start,'single Dynamo source section');return source.slice(0,start)+BEFORE_DYNAMO+source.slice(end);
   }return source;
  }});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.resetCombatRandom=()=>{state=123;};return f;
}
const hash=g=>{if(!g)return null;const h=createHash('sha256');for(const [k,a]of Object.entries(g.attributes)){h.update(k);h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index)h.update(new Uint8Array(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');};
const anchors=d=>JSON.stringify({handR:d.handR,handL:d.handL,inHand:d.inHand,muzzle:d.muzzle,fold:d.fold,drumR:d.drumR});
const geos=d=>Object.fromEntries(['body','ink','bodyStatic','inkStatic','drum','drumCaps','glow','glass'].map(k=>[k,hash(d[k])]).concat(Object.entries(d.parts).map(([k,p])=>['part:'+k,hash(p.geo)])));

test('Dynamo handle and drum share the measured width midline, with unchanged sockets and dimensions',async()=>{
 const f=await production(),d=f.getWeaponDef(ID);d.drum.computeBoundingBox();
 const b=d.drum.boundingBox,left=b.min.x+d.drumAt.x,right=b.max.x+d.drumAt.x;
 assert.ok(Math.abs((left+right)/2-d.gripR.pos.x)<1e-7,'grip centre meets drum width centre');
 assert.ok(Math.abs((left+right)/2-d.gripL.pos.x)<1e-7,'support grip uses same centre');
 assert.ok(Math.abs(right-left-sourceDynamo.width)<1e-6,'independent indexed source width preserved');
 authoredVector(d.muzzle,[-.37,0,1.13]);
 authoredVector(d.fold.pivot,[0,0,.88]);assert.ok(Math.abs(d.drumR/authoredScale-.19)<1e-7);
 authoredVector(d.gripR.pos,[0,0,-.022]);
 assert.equal(d.gripL.pos.x,0);assert.equal(d.gripL.pos.y,0);
 assert.ok(Math.abs(d.gripL.pos.z-d.gripR.pos.z-.162)<1e-7,'support hand reach preserved');
});

test('only the measured Dynamo drum placement and separate drive assembly differ from main', {skip:!!process.env.INKWAVE_BUILT_SITE},async()=>{
 const before=await production(true),after=await production();
 for(const {id}of after.MAIN_WEAPON_CATALOG.records){
  const a=before.getWeaponDef(id),b=after.getWeaponDef(id);
  assert.equal(anchors(a),anchors(b),id+' anchors unchanged');
  if(id!==ID){assert.deepEqual(geos(a),geos(b),id+' exact geometry/attributes unchanged');continue;}
  assert.equal(a.drumAt.y,b.drumAt.y);assert.equal(a.drumAt.z,b.drumAt.z);
  assert.ok(Math.abs(a.drumAt.x/authoredScale+.37)<1e-7);assert.equal(b.drumAt.x,0);
  for(const key of ['bodyStatic','inkStatic','drum','drumCaps'])assert.equal(hash(a[key]),hash(b[key]),key+' unchanged');
  console.log('DYNAMO_BEFORE_AFTER_BUDGET '+JSON.stringify({before:{vertices:a.body.attributes.position.count,triangles:a.body.index.count/3},after:{vertices:b.body.attributes.position.count,triangles:b.body.index.count/3}}));
  assert.ok(b.parts.hinge.geo.index.count/3<16000,'bounded drive/support triangle budget');
  assert.ok(b.body.index.count/3<a.body.index.count/3+12000,'no unbounded decorative mesh growth');
 }
});


test('Dynamo copper stator occupies a separate drive axis behind the drum, not the end cap',async()=>{
 const f=await production(),d=f.getWeaponDef(ID),g=d.parts.hinge.geo,p=g.attributes.position.clone(),c=g.attributes.color,metal=g.attributes.aMat;
 for(let i=0;i<p.array.length;i++)p.array[i]/=authoredScale;
 const hingeZ=d.parts.hinge.pivot.z/authoredScale;
 const copper=new f.THREE.Color('#c27a3c'),q=[];
 for(let i=0;i<p.count;i++)if(Math.abs(c.getX(i)-copper.r)<1e-6&&Math.abs(c.getY(i)-copper.g)<1e-6&&Math.abs(c.getZ(i)-copper.b)<1e-6){
  assert.equal(metal.getX(i),3,'copper remains metal');q.push([p.getX(i),p.getY(i),p.getZ(i)+hingeZ]);
 }
 assert.ok(q.length>500,'actual visible windings, not a metadata-only drive');
 const min=[0,1,2].map(k=>Math.min(...q.map(v=>v[k]))),max=[0,1,2].map(k=>Math.max(...q.map(v=>v[k])));
 assert.ok(Math.abs((min[2]+max[2])/2-.77)<.003,'measured drive axis at Z0.77');
 assert.ok(Math.abs((min[1]+max[1])/2)<.003,'coplanar drive construction');
 assert.ok(d.drumAt.z/authoredScale-max[2]>.12,'winding remains behind drum centre');
 assert.ok(min[0]>.91&&max[0]<1.15,'windings face outboard on their separate case');
 assert.ok(max[1]-min[1]>.43&&max[1]-min[1]<.47,'measured winding radial envelope');
 // The production build deliberately tree-shakes Raycaster. Intersect the
 // actual indexed triangles along -X here, without enlarging production exports.
 const axialFacesAt=(y,z)=>{
  const hits=[],ii=g.index.array;
  for(let t=0;t<ii.length;t+=3){
   const a=ii[t],b=ii[t+1],c=ii[t+2],ay=p.getY(a),az=p.getZ(a),by=p.getY(b),bz=p.getZ(b),cy=p.getY(c),cz=p.getZ(c);
   const det=(bz-cz)*(ay-cy)+(cy-by)*(az-cz);if(Math.abs(det)<1e-12)continue;
   const u=((bz-cz)*(y-cy)+(cy-by)*(z-cz))/det,v=((cz-az)*(y-cy)+(ay-cy)*(z-cz))/det,w=1-u-v;
   if(Math.min(u,v,w)<-1e-7)continue;const x=u*p.getX(a)+v*p.getX(b)+w*p.getX(c);if(x<2)hits.push({x,index:a});
  }return hits.sort((a,b)=>b.x-a.x);
 };
 const firstFaceAt=(y,z)=>axialFacesAt(y,z)[0]?.index??-1;
 const steel=new f.THREE.Color('#a9abb1'),bearingHits=axialFacesAt(-.074,1.13-hingeZ).filter(({index:i})=>Math.abs(c.getX(i)-steel.r)<1e-6&&Math.abs(c.getY(i)-steel.g)<1e-6&&Math.abs(c.getZ(i)-steel.b)<1e-6);
 assert.ok(bearingHits.length>1,'real steel bearing faces intersect the radial support section');
 const bearingSpan=[Math.min(...bearingHits.map(h=>h.x)),Math.max(...bearingHits.map(h=>h.x))],gx=1.821/2;
 console.log('DYNAMO_BEARING_SUPPORT_SPAN '+JSON.stringify({radial:.074,span:bearingSpan,platePlanes:[gx-.015,gx+.165]}));
 assert.ok(bearingSpan[0]<gx-.015,'rear fork bearing plate overlaps steel collar');
 assert.ok(bearingSpan[1]>gx+.165,'front fork bearing plate overlaps steel taper outside its hole');
 let visibleCopper=0;
 for(let k=0;k<24;k++){
  const angle=k/24*Math.PI*2,hit=firstFaceAt(Math.cos(angle)*.204,.77-hingeZ+Math.sin(angle)*.204);
  if(hit>=0&&Math.abs(c.getX(hit)-copper.r)<1e-6&&Math.abs(c.getY(hit)-copper.g)<1e-6)visibleCopper++;
 }
 assert.ok(visibleCopper>=18,'stator opening exposes copper, not an opaque support plate: '+visibleCopper+'/24');
 console.log('DYNAMO_STATOR_VISIBILITY '+visibleCopper+'/24');
 console.log('DYNAMO_DRIVE_GEOMETRY '+JSON.stringify({vertices:g.attributes.position.count,triangles:g.index.count/3,bodyVertices:d.body.attributes.position.count,bodyTriangles:d.body.index.count/3,copperBounds:{min,max}}));
});

async function run(f,hz){
 const {G,THREE}=f;G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);
 G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const a=new f.Actor({team:0,weapon:ID,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 const ch=a.character;ch.actor=a;ch.onEvent=null;G.actors=[a];G.scene.add(ch.root);
 const shots=[],original=G.projectiles._push.bind(G.projectiles);
 G.projectiles._push=p=>{shots.push({at:Array.from(p.pos.toArray()),vel:Array.from(p.vel.toArray()),damage:p.damage,radius:p.radius,life:p.life,meta:JSON.stringify(p.inkMeta)});return original(p);};
 // Three.js geometry/Object3D UUID allocation consumes Math.random. Start
 // combat after visual construction with the SAME gameplay random stream.
 f.resetCombatRandom();
 let maxGrip=0,maxSpin=0,maxFold=0,rolling=0;const rows=[];
 for(let n=0;n<hz*6;n++){
  const t=n/hz,fire=t>=.5&&t<2.5||t>=3&&t<5;
  a.ink=100;a.intent.fire=fire;a.grounded=a.ground.hit=!(t>=3&&t<4.4);a.intent.move.set(0,0,fire?1:0);a.vel.set(0,0,fire?2.4:0);a.aimPitch=0;
  G.time+=1/hz;a.weaponRunner.update(1/hz,{fire,firePressed:n===hz/2||n===hz*3});a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);
  assert.ok(Array.from(ch.P).every(Number.isFinite),'finite pose '+hz+' '+n);
  const C=f.CHARACTER_CHANNELS;if(n>hz/3&&ch.P[C.IKL]>.99&&ch.P[C.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));
  maxSpin=Math.max(maxSpin,Math.abs(ch.weapon.drum?.rotation.x||0));maxFold=Math.max(maxFold,Math.abs(ch.weapon.fold?.rotation.x||0));rolling+=a.weaponRunner.rolling?1:0;
  rows.push([a.ink,a.weaponRunner.cooldown,a.weaponRunner.catalogState.swingCount,a.weaponRunner.rolling]);
 }
 ch.dispose();return{shots,rows,maxGrip,maxSpin,maxFold,rolling};
}
test('Dynamo real Actor stays gripped, folds and spins at 30/60/120 Hz; gameplay emissions unchanged',async()=>{
 for(const hz of [30,60,120]){
  const after=await run(await production(),hz);assert.ok(after.shots.length>0,'emitted attacks');assert.ok(after.maxGrip<.008,'closed support hand '+hz+' '+after.maxGrip);assert.ok(after.maxSpin>0,'drum spun');assert.ok(after.maxFold>0,'vertical fold');
  if(!process.env.INKWAVE_BUILT_SITE){const before=await run(await production(true),hz);assert.deepEqual(after.shots,before.shots,'projectile origin/velocity/damage unchanged '+hz);assert.deepEqual(after.rows,before.rows,'ink/timing/roll unchanged '+hz);}
 }
});
