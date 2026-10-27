import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInkMesh } from '../ink-volume/mesh.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptIssue479 } from '../../splatoon3/issue-479-adapter.mjs';
async function api() {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:adaptIssue479,extraExports:"export {FX} from './inkwave-public/src/fx/fx.js'; export {InkVolumes} from './patches/local-quality/ink-volume/runtime.mjs'; export {captureInkVolume,submitInkVolume} from './patches/local-quality/ink-volume/recipes.mjs'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs'; export const buffers={Uint8Array,Uint16Array,Uint32Array,Int16Array,Float32Array};"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;
}
function pack(f,width=16,height=16,frames=1) {
  const rgba=new Uint8Array(width*height*4);for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)rgba.set([255,128,64,255],(y*width+x)*4);
  const mesh=buildInkMesh(rgba,width,height),level={};for(const key of ['positions','normals','uvs','indices'])level[key]=new f.buffers[mesh[key].constructor.name](mesh[key]);
  return {schema:'inkwave-volume-v1',patterns:[{width,height,fps:30,frames:Array.from({length:frames},()=>({rgba:new f.buffers.Uint8Array(rgba),levels:[level,level]}))}]};
}
function renderer(f,capacity=128) {return new f.InkVolumes(new f.THREE.Group(),{sunDir:new f.THREE.Vector3(0,1,0),sunCol:new f.THREE.Color('white'),sky:new f.THREE.Color('gray'),ground:new f.THREE.Color('gray')},{capacity,triangleBudget:600000});}
function assertTipPosition(matrix, position) {
  // Matrix4.compose copies translation unchanged; InstancedMesh.setMatrixAt
  // stores it once in Float32Array. Compare that exact storage conversion,
  // not decimal buckets whose half-way boundary can split the same endpoint.
  const actual=matrix.elements.slice(12,15),expected=position.toArray().map(Math.fround);
  assert(actual.every(Number.isFinite)&&expected.every(Number.isFinite),'tip coordinates must be finite');
  assert.deepEqual(actual,expected,'tip equals the exact Float32 projectile position');
}
function snapshot(p) {return {wid:p.wid,type:p.type,age:p.age,life:p.life,delay:p.delay,damage:p.damage,team:p.team,ghost:p.ghost,straight:p.straight,radius:p.radius,size:p.size,grav:p.grav,drag:p.drag,seed:p.seed,pos:p.pos.toArray(),prev:p.prev?.toArray(),start:p.start?.toArray(),vel:p.vel.toArray(),meta:JSON.stringify(p.inkMeta),vertical:p.s3Vertical};}
test('early natural freefall remains horizontal; the renderer never infers vertical from airborne position',async()=>{
  const f=await api(),a=f.make('roller');a.form='kid';a.ink=100;a.grounded=false;a.intent.fire=true;f.tick(a,35);a.intent.fire=false;assert(f.G.projectiles.list.length);
  for(const p of f.G.projectiles.list){assert.equal(p.s3Vertical,false,'native freefall grace owns mode');assert.equal(p._inkVolumeRecipe,'roller-horizontal');}
});
test('composite reservation is atomic, reuses batches, keeps nonuniform transforms finite and culls conservatively',async()=>{
  const f=await api(),e=renderer(f,2);e.register('a',pack(f));const owner=f.make('shooter'),p={owner,age:.1,pos:new f.THREE.Vector3(),vel:new f.THREE.Vector3(0,0,1)};
  const part={name:'a',size:1,stretch:new f.THREE.Vector3(4,.3,.6)},parts=[part,part,part];
  e.begin();assert.equal(e.submitComposite(p,parts),false);e.end();assert.equal(e.metrics.active,0);assert.equal(e.metrics.triangles,0);assert(e.root.children.every(m=>m.count===0),'fallback cannot leave half of an effect drawn');
  assert(e.submitComposite(p,[part,part]));e.end();const b=e.assets.get('a').patterns[0].frames[0][0],matrix=new f.THREE.Matrix4();b.mesh.getMatrixAt(0,matrix);assert.equal(b.mesh.count,2);
  assert(Math.abs(matrix.elements[0]-4)<1e-6);assert(Math.abs(matrix.elements[5]-.3)<1e-6);assert(Math.abs(matrix.elements[10]-.6)<1e-6);
  assert.match(b.mesh.material.vertexShader,/normal\/max\(scale2/,'normal uses inverse scale, not stretched positions');
  e.begin();assert.equal(e.submitComposite(p,[part,{...part,name:'missing'}]),false);e.end();assert.equal(e.metrics.active,0);assert(e.root.children.every(m=>m.count===0));
  const camera=new f.THREE.PerspectiveCamera(60,1,.1,100);p.pos.set(4,0,-3);e.begin(camera);assert(e.submitComposite(p,[part]));e.end();assert.equal(e.metrics.culled,0,'stretched body intersects view although its centre does not');
  e.dispose();assert(e.plans.every(plan=>plan.batch===null),'preflight scratch releases disposed GPU/CPU buffers');
});
test('all 23 supported main definitions emit classified native rounds and render without changing gameplay',async()=>{
  const f=await api(),system=f.G.projectiles,e=renderer(f,1024);e.register('roller',pack(f,16,16,16));const line=pack(f,32,8),dot=pack(f);e.register('shooter',{...line,patterns:[line.patterns[0],dot.patterns[0]]});
  // Shooter rounds are owned by the S3 rod silhouette (s3-projectile-shapes.mjs).
  for(const r of f.MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='shooter')){
    system.clear();f.G.actors.length=0;const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;f.tick(a,20);a.intent.fire=false;assert(system.list.length,r.id+' native action');
    assert(system.list.every(p=>p._inkVolumeRecipe===null),r.id+' leaves the volume rod');
    e.begin();for(const p of system.list)assert.equal(f.submitInkVolume(e,p),false,r.id+' no volume submission');e.end();
  }
  const records=f.MAIN_WEAPON_CATALOG.records.filter(r=>['roller','brush','dualies','splatling'].includes(r.family)||['slosher','s3-slosher-diffusion','s3-slosher-double'].includes(r.id));assert.equal(records.length,23);
  for(const r of records){
    system.clear();f.G.actors.length=0;const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;f.tick(a,130);a.intent.fire=false;f.tick(a,35);assert(system.list.length,r.id+' native action');
    assert(system.list.every(p=>p._inkVolumeRecipe),r.id+' classification');for(let i=0;i<3;i++)system.update(1/60);assert(system.list.length,r.id+' actual flight');const before=system.list.map(snapshot);e.begin();let drawn=0;for(const p of system.list)if(f.submitInkVolume(e,p))drawn++;e.end();assert(drawn>0,r.id+' positive finite presentation');assert.deepEqual(system.list.map(snapshot),before,r.id+' authoritative state');
  }
  for(const r of records.filter(r=>r.family==='roller')){
    system.clear();f.G.actors.length=0;const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.jump=true;f.tick(a);assert.equal(a.grounded,false,r.id+' native jump admitted');assert(a.vel.y>0,r.id+' native jump velocity');a.intent.jump=false;a.intent.fire=true;f.tick(a,130);a.intent.fire=false;f.tick(a,35);assert(system.list.length,r.id+' jump swing');assert(system.list.every(p=>p._inkVolumeRecipe==='roller-vertical'),r.id+' immutable vertical classification');
    for(let i=0;i<3;i++)system.update(1/60);const before=system.list.map(snapshot);e.begin();let drawn=0;for(const p of system.list)if(f.submitInkVolume(e,p))drawn++;e.end();assert(drawn>0,r.id+' vertical volume');assert.deepEqual(system.list.map(snapshot),before);
  }e.dispose();
});
test('actual Dualies/Splatling births draw connected rods, preserve authority, and fall back as one effect',async()=>{
  const f=await api(),e=renderer(f),line=pack(f,32,8),dot=pack(f);e.register('shooter',{...line,patterns:[line.patterns[0],dot.patterns[0]]});
  {const a=f.make('shooter');f.G.projectiles.clear();f.G.projectiles.fireShooter(a,a.weapon,0);assert.equal(f.G.projectiles.list[0]._inkVolumeRecipe,null,'Shooter uses the S3 rod silhouette');}
  for(const kind of ['dualies','splatling']) {
    const a=f.make(kind);f.G.projectiles.clear();f.G.projectiles.fireShooter(a,a.weapon,0);assert(f.G.projectiles.list.length);
    const p=f.G.projectiles.list[0];assert.equal(p._inkVolumeRecipe,'shooter');p.age=3/60;p.pos.addScaledVector(p.vel,3/60);
    const before=snapshot(p);e.begin();assert(f.submitInkVolume(e,p));e.end();assert.deepEqual(snapshot(p),before);assert.equal(e.metrics.active,3);
    const resources=[...e.assets.get('shooter').resources];e.begin();assert(f.submitInkVolume(e,p));e.end();assert.deepEqual([...e.assets.get('shooter').resources],resources);
    const tip=e.assets.get('shooter').patterns[1].frames[0][0],m=new f.THREE.Matrix4();tip.mesh.getMatrixAt(0,m);assertTipPosition(m,p.pos);
    e.capacity=2;e.begin();assert.equal(f.submitInkVolume(e,p),false);e.end();assert.equal(e.metrics.active,0);assert(e.root.children.every(m=>m.count===0));e.capacity=128;
  }
  e.dispose();
});

test('native tip translations retain exact Float32 endpoints at decimal-rounding boundaries',async()=>{
  const f=await api(),e=renderer(f),line=pack(f,32,8),dot=pack(f);
  e.register('shooter',{...line,patterns:[line.patterns[0],dot.patterns[0]]});
  const positions=[
    [0,1.064605,3.449965],
    [1.06460501,-1.06460501,-3.449965],
    [-3.449965,3.44996501,1.06460501],
  ];
  try {
    for(const kind of ['dualies','splatling']) {
      f.G.projectiles.clear();const a=f.make(kind);f.G.projectiles.fireShooter(a,a.weapon,0);
      const p=f.G.projectiles.list[0];assert(p,kind+' native birth');p.age=3/60;
      for(const xyz of positions) {
        p.pos.set(...xyz);const before=snapshot(p);e.begin();assert(f.submitInkVolume(e,p));e.end();
        const tip=e.assets.get('shooter').patterns[1].frames[0][0],m=new f.THREE.Matrix4();
        assert(tip.mesh.instanceMatrix.array instanceof f.buffers.Float32Array);
        tip.mesh.getMatrixAt(0,m);assertTipPosition(m,p.pos);
        assert.deepEqual(snapshot(p),before,kind+' authoritative state');
        // A single representable step on any axis is a real stored endpoint
        // change. The contract must reject it, even inside one old 1e-5 bucket.
        const bits=new Uint32Array(1),value=new Float32Array(bits.buffer);
        for(let axis=0;axis<3;axis++) {
          const offset=12+axis,original=tip.mesh.instanceMatrix.array[offset];
          value[0]=original;bits[0]++;
          tip.mesh.instanceMatrix.array[offset]=value[0];tip.mesh.getMatrixAt(0,m);
          assert.throws(()=>assertTipPosition(m,p.pos),{code:'ERR_ASSERTION'},kind+' rejects one-ULP axis '+axis);
          tip.mesh.instanceMatrix.array[offset]=NaN;tip.mesh.getMatrixAt(0,m);
          assert.throws(()=>assertTipPosition(m,p.pos),{code:'ERR_ASSERTION'},kind+' rejects nonfinite axis '+axis);
          tip.mesh.instanceMatrix.array[offset]=original;
        }
        tip.mesh.getMatrixAt(0,m);assertTipPosition(m,p.pos);
      }
    }
  } finally {e.dispose();}
});
test('Slosher uses a continuous sheet and sourced tail without detached beads or camera rotation',async()=>{
  const f=await api(),e=renderer(f);e.register('roller',pack(f,16,16,16));const a=f.make('slosher');f.G.projectiles.fireSlosh(a,a.weapon);const p=f.G.projectiles.list[0];assert.equal(p._inkVolumeRecipe,'slosher');
  p.delay=0;p.age=.15;const before=snapshot(p),camera=new f.THREE.PerspectiveCamera(60,1,.1,100);camera.position.copy(p.pos).add(new f.THREE.Vector3(0,0,3));camera.lookAt(p.pos);
  e.begin(camera);assert(f.submitInkVolume(e,p));e.end();assert.equal(e.metrics.active,1);assert.deepEqual(snapshot(p),before);
  const b=e.assets.get('roller').patterns[0].frames[4][0],matrix=new f.THREE.Matrix4();b.mesh.getMatrixAt(0,matrix);const axes=matrix.elements.slice(0,12);camera.position.copy(p.pos).add(new f.THREE.Vector3(2,3,1));camera.lookAt(p.pos);e.begin(camera);assert(f.submitInkVolume(e,p));e.end();b.mesh.getMatrixAt(0,matrix);assert.deepEqual(matrix.elements.slice(0,12),axes);
  assert(Math.hypot(...axes.slice(4,7))>Math.hypot(...axes.slice(0,3)),'sheet carries the actual source tail');e.dispose();
});
test('catalogue local and JSON-wire births keep immutable family/mode through weapon switches and pooled reuse',async()=>{
  const f=await api(),system=f.G.projectiles,peer=f.make('shooter');peer.remote=true;peer.nid=9;peer.team=1;f.G.netm=new f.NetMatch({myId:7},{});
  for(const [id,vertical,recipe] of [['s3-roller-compact',false,'roller-horizontal'],['s3-roller-compact',true,'roller-vertical'],['s3-shooter-first',false,null],['s3-slosher-diffusion',false,'slosher'],['s3-brush-mini',false,'brush']]) {
    system.clear();f.G.netm.out.length=0;const a=f.make(id);a.nid=7;a.form='kid';a.grounded=true;a.intent.jump=vertical;a.intent.fire=true;
    let ticks=0;while(!system.list.length&&ticks++<180)f.tick(a);a.intent.fire=false;assert(system.list.length,id+' native action emits');
    assert(system.list.every(p=>p._inkVolumeRecipe===recipe),id+' local classification');
    const packets=JSON.parse(JSON.stringify(f.G.netm.out.filter(e=>e[1]==='p')));assert(packets.length,id+' real wire births');const original=JSON.stringify(packets);
    system.clear();peer.weaponRunner.s3FlickVertical=!vertical;for(const event of packets)system.ghostProjectile(peer,event);
    assert.equal(system.list.length,packets.length);assert.equal(JSON.stringify(packets),original);
    for(const p of system.list){assert.equal(p._inkVolumeRecipe,recipe,id+' remote classification after metadata');assert.equal(p.wid,id);assert.equal(p.damage,0);assert.equal(p.ghost,true);if(recipe)assert.deepEqual(p._inkVolumeDirection.toArray(),p.vel.toArray());}
  }
});

test('Bucket, Tri-Slosher, Dread Wringer and their alternate kits share the Bucket sheet; other Sloshers keep their art',async()=>{
  const {usesBucketSlosherSheet}=await import('../../splatoon3/runtime/projectile-visuals.mjs');
  for(const id of ['slosher','slosher-01','s3-slosher-diffusion','s3-slosher-diffusion-01','s3-slosher-diffusion-02','s3-slosher-double','s3-slosher-double-01','s3-slosher-double-02'])
    assert.equal(usesBucketSlosherSheet(id),true,id);
  for(const id of ['s3-slosher-launcher','s3-slosher-launcher-01','s3-slosher-bathtub','s3-slosher-washtub-01','roller',undefined,null])
    assert.equal(usesBucketSlosherSheet(id),false,String(id));
});


test('Hissen canonical fallback retains frame envelopes and stays inside the volume budget',async()=>{
  const fs=await import('node:fs'),path=await import('node:path'),zlib=await import('node:zlib');
  const {fileURLToPath}=await import('node:url'),{unpackVolumes}=await import('../ink-volume/pack.mjs');
  const root=process.env.INKWAVE_BUILT_SITE||fileURLToPath(new URL('../../../',import.meta.url));
  const f=await api();let draws=0,rngState=0x51e39a17;f.setRandom(()=>{draws++;rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;});
  const load=slot=>{
    const dir=path.join(root,'patches/local-quality/ink-volume/assets',slot),m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),bytes=zlib.gunzipSync(fs.readFileSync(path.join(dir,m.binary))),p=unpackVolumes(m,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    for(const pattern of p.patterns)for(const frame of pattern.frames){frame.rgba=new f.buffers.Uint8Array(frame.rgba);for(const l of frame.levels)for(const key of ['positions','normals','uvs','indices','opaqueIndices','fringeIndices'])if(l[key])l[key]=new f.buffers[l[key].constructor.name](l[key]);}
    return {manifest:m,pack:p};
  };
  const full=load('roller'),small=load('hissen-fallback');assert(small.manifest.geometryOnly);assert(small.manifest.maxTriangles<=10000);assert(small.manifest.byteLength<4*1024*1024);
  const bounds=v=>{const a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];for(let i=0;i<v.length;i++){a[i%3]=Math.min(a[i%3],v[i]);b[i%3]=Math.max(b[i%3],v[i]);}return [...a,...b];};
  for(let i=0;i<2;i++)for(let j=0;j<16;j++){
    const p=small.pack.patterns[i],frame=p.frames[j];assert.equal(p.fps,full.pack.patterns[i].fps);assert.deepEqual(Array.from(frame.rgba),[255,255,255,255],'no source RGB media in geometry-only LOD');
    const a=bounds(frame.levels[0].positions),b=bounds(full.pack.patterns[i].frames[j].levels[0].positions);a.forEach((x,k)=>assert(Math.abs(x-b[k])<1e-6,'canonical frame envelope unchanged'));
  }
  const e=renderer(f),holder={inkVolumes:e},registrationDraws=draws,registrationState=rngState;f.FX.prototype.registerInkVolume.call(holder,'hissen-fallback',small.pack);assert.equal(draws,registrationDraws,'contour registration cannot consume the caller/gameplay RNG');assert.equal(rngState,registrationState);e.register('roller',full.pack);const savedFull=e.assets.get('roller');f.G.fx={inkVolumes:e};
  const ps=f.G.projectiles,a=f.make('s3-slosher-diffusion');a.pos.set(0,2,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,3,50);a.intent.fire=true;let head;
  for(let i=0;i<100;i++){f.tick(a);ps.update(1/60);head=ps.list.find(p=>p.catalog?.descriptor.unit===0&&p.catalog.index===0&&p.age>0);if(head)a.intent.fire=false;if(head&&Math.round(head.age*60)===5)break;}
  assert(head&&Math.abs(head.age-5/60)<1e-9);
  const state=()=>JSON.stringify({draws,rngState,time:f.G.time,ink:a.ink,main:ps.list.map(snapshot),drops:ps._s3SplashDrops?.map(d=>[d.frames,d.seed,d.radius,d.drawRadius,...d.pos.toArray(),...d.vel.toArray()])});
  const before=state();let begins=0,ends=0;const begin=e.begin,end=e.end;e.begin=function(...args){begins++;return begin.apply(this,args);};e.end=function(...args){ends++;return end.apply(this,args);};const draw=()=>{const b=begins,d=ends;ps._draw();ps.syncVisuals(1);assert.equal(begins,b+1,'one shared begin');assert.equal(ends,d+1,'one shared end');};e.assets.delete('roller');draw();
  assert(e.metrics.active>0,'missing full pack still draws canonical contours');assert.equal(ps.blobs.count,0,'no generic fill');assert.equal(ps.projectileVisuals.stats.vertexCount,0,'no thick history body');assert.equal(state(),before);
  e.assets.set('roller',savedFull);draw();assert.equal(e.metrics.fallback,0,'normal loaded route retained');assert.equal(e.metrics.overflow,0);assert.equal(state(),before);
  const cameraBefore=f.G.camera;f.G.camera=new f.THREE.PerspectiveCamera(55,16/9,.1,100);f.G.camera.position.set(1000,1000,1000);f.G.camera.lookAt(2000,1000,1000);draw();assert.equal(e.metrics.active,0);assert(e.metrics.culled>0);assert.equal(e.metrics.fallback,0,'successful culling never triggers a fallback');assert.equal(e.metrics.overflow,0);assert.equal(ps.blobs.count,0);assert.equal(state(),before);const budgetBefore=e.triangleBudget;e.triangleBudget=30000;draw();assert.equal(e.metrics.active,0);assert(e.metrics.culled>0);assert.equal(e.metrics.fallback,0,'preselected contour culling emits no fallback instance');assert.equal(e.metrics.fallbackDropped,0);assert.equal(e.metrics.overflow,0);assert.equal(state(),before);e.triangleBudget=budgetBefore;f.G.camera=cameraBefore;
  e.triangleBudget=30000;draw();assert(e.metrics.fallback>0,'real rejection selects the contour LOD');assert.equal(e.metrics.fallback,e.metrics.active,'crowded Hissen frame chooses one contour tier before greedy full fragments starve siblings');assert.equal(e.metrics.fallbackDropped,0,'five cheap contour bodies fit the test budget');assert(e.metrics.triangles<=30000);assert.equal(ps.blobs.count,0);assert.equal(ps.projectileVisuals.stats.vertexCount,0);assert.equal(state(),before);
  const capacity=e.capacity;e.capacity=1;draw();assert.equal(e.metrics.active,1);assert.equal(e.metrics.fallbackDropped,4);assert.equal(ps.blobs.count,0);assert(e.metrics.triangles<=30000);assert.equal(state(),before);e.capacity=capacity;
  e.triangleBudget=0;draw();assert.equal(e.metrics.active,0);assert.equal(e.metrics.triangles,0);assert(e.metrics.fallbackDropped>0,'hard bound is explicit');assert.equal(ps.blobs.count,0,'hard exhaustion cannot spill unaccounted generic main');assert.equal(state(),before);
  const resources=[...e.assets.values()].flatMap(asset=>[...asset.resources,...asset.batches.flatMap(b=>[b.mesh,b.fringe])]),disposed=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
  const ownedBytes=e.metrics.bytes;ps.disposeVisuals();assert.equal(e.metrics.bytes,ownedBytes,'projectile visual disposal leaves shared FX-owned packs alive');assert.equal(e.assets.size,2);assert.equal(disposed.size,0);
  const originalLoad=f.FX.prototype.loadInkVolume;f.FX.prototype.loadInkVolume=async()=>({});const fx=new f.FX(new f.THREE.Scene(),{quality:.25});await fx.inkVolumeReady;fx.inkVolumes=e;fx.root.add(e.root);fx.dispose();f.FX.prototype.loadInkVolume=originalLoad;
  assert.equal(e.metrics.bytes,0);assert.equal(e.root.children.length,0);assert(resources.every(r=>disposed.get(r)===1),'FX owner releases every shared contour/full resource exactly once');
  console.log('Hissen safeguards',JSON.stringify({nonconstantSeed:'0x51e39a17',renderRngPreserved:true,successfulCullHasNoFallback:true,sharedBegins:begins,sharedEnds:ends,capacityOneActive:1,capacityOneGenericMains:0,fxDisposals:resources.length,fxOwnedBytesReleased:ownedBytes}));f.restoreRandom();
});
