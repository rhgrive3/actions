import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {isSplatlingCosmeticProjectile,SPLATLING_COSMETICS as C} from '../runtime/splatling-cosmetics.mjs';
test('Splatling family ownership does not claim Shooter, Dualies, Slosher, special or delayed non-shot objects',()=>{
 assert(isSplatlingCosmeticProjectile({type:'shot',wid:'splatling'}));assert(isSplatlingCosmeticProjectile({type:'shot',catalog:{r:{family:'splatling'}}}));
 for(const family of ['shooter','dualies','slosher','roller'])assert(!isSplatlingCosmeticProjectile({type:'shot',catalog:{r:{family}}}));
 assert(!isSplatlingCosmeticProjectile({type:'shot',wid:'splatling',s3SpecialWeapon:true}));assert(!isSplatlingCosmeticProjectile({type:'drop',wid:'splatling'}));
});
test('native standing/jumping Splatling gets its own compact bead and no Shooter volume/history body',async()=>{
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,
  extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const sys=f.G.projectiles,a=f.make('splatling');a.intent.fire=true;f.tick(a,70);a.intent.fire=false;
 for(let i=0;i<10&&!sys.list.length;i++)f.tick(a);
 assert(sys.list.length);const p=sys.list[0];p.delay=0;p.age=.05;p.pos.copy(p.start).addScaledVector(p.vel,.05);
 let calls=0;f.G.fx={inkVolumes:{isInkVolumes:true,assets:new Map([['shooter',{}]]),begin(){},end(){},submitComposite(){calls++;return true;}}};
 const snapshot=()=>JSON.stringify([p.age,p.seed,p.size,p.damage,p.vel.toArray(),p.pos.toArray(),p.life,p.grav,p.drag,a.ink]);
 const before=snapshot();sys._draw();sys.syncVisuals(1);assert.equal(calls,0);assert.equal(p._iwVisualHistory??null,null);assert.equal(sys.s3ShapeCounts.body,0);assert.equal(sys.shooterMuzzleDroplets.drawn,3,'shared three-dimensional muzzle-only beads accompany the Splatling body');
 assert(sys.blobs.count>=1);const m=new f.THREE.Matrix4();sys.blobs.getMatrixAt(0,m);const scale=new f.THREE.Vector3().setFromMatrixScale(m);assert(Math.abs(scale.x-C.radius)<1e-7);assert(sys.blobShape.array[0]<=1+C.tailLength/C.radius+1e-5);assert(sys.blobInkLook.array[1]>0,'rounded drop branch, independent of Shooter rod');
 const shape=Array.from(sys.blobShape.array.slice(0,4));a.grounded=false;f.G.camera={position:new f.THREE.Vector3(0,30,0)};sys._draw();assert.deepEqual(Array.from(sys.blobShape.array.slice(0,4)),shape);assert.equal(snapshot(),before);
 const resources=[sys.blobs.geometry,sys.blobs.material];for(let i=0;i<10;i++)sys._draw();assert.deepEqual([sys.blobs.geometry,sys.blobs.material],resources);
 f.G.camera.position.set(0,900,0);sys._draw();assert.equal(sys.blobs.count,0,'retain the former 65-unit far cull for low devices');
 sys.clear();assert.equal(sys.blobs.count,0);
});
