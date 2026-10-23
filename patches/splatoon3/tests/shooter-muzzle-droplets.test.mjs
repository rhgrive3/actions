import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {isOrdinaryShooter,SHOOTER_MUZZLE_COSMETICS as C} from '../runtime/shooter-muzzle-droplets.mjs';
async function setup(){
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true});
 f.G.camera={position:new f.THREE.Vector3(0,2,-4)};
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 return f;
}
const gameplay=p=>JSON.stringify([p.wid,p.type,p.pos.toArray(),p.vel.toArray(),p.start.toArray(),p.age,p.delay,p.seed,p.size,p.damage,p.grav,p.drag,p.life]);
test('only ordinary Shooter families and their catalogue kits receive muzzle beads',()=>{
 assert(isOrdinaryShooter({type:'shot',wid:'shooter'}));assert(isOrdinaryShooter({type:'shot',catalog:{r:{family:'shooter'}}}));
 for(const family of ['splatling','dualies','brella','slosher'])assert(!isOrdinaryShooter({type:'shot',catalog:{r:{family}}}));
 assert(!isOrdinaryShooter({type:'shot',wid:'shooter',s3SpecialWeapon:true}));
});
test('real composed Shooter appends one bounded burst per birth without RNG/gameplay/paint writes',async()=>{
 const f=await setup(),a=f.make('shooter'),sys=f.G.projectiles;a.isLocal=true;
 f.G.fx={muzzle(){},_spawnDrop(){}};sys.fireShooter(a,a.weapon,0);const p=sys.list[0];
 const before=gameplay(p),pool=sys.shooterMuzzleDroplets.pool,blob=sys.blobs,geo=blob.geometry,mat=blob.material;
 let rng=0,paints=0;f.setRandom(()=>{rng++;return .37;});f.G.paint.splat=()=>paints++;
 p.age=1/60;f.G.time=1/60;const row=gameplay(p);sys._draw();assert.equal(sys.shooterMuzzleDroplets.drawn,C.drops);assert.equal(sys.shooterMuzzleDroplets.count,1);
 for(let i=0;i<5;i++)sys._draw();assert.equal(sys.shooterMuzzleDroplets.emitted,C.drops);assert.equal(gameplay(p),row);assert.equal(rng,0);assert.equal(paints,0);
 assert.equal(sys.blobs,blob);assert.equal(blob.geometry,geo);assert.equal(blob.material,mat);assert.equal(sys.shooterMuzzleDroplets.pool,pool);
 assert.notEqual(before,row,'only the test explicitly advanced age');
});
test('cessation expires, switching retires, clear/reuse resets a pooled birth',async()=>{
 const f=await setup(),sys=f.G.projectiles,a=f.make('shooter');f.G.fx={muzzle(){},_spawnDrop(){}};a.isLocal=true;
 sys.fireShooter(a,a.weapon,0);const p=sys.list[0];p.age=1/60;f.G.time=1/60;sys._draw();assert(sys.shooterMuzzleDroplets.drawn>0);
 const origin=sys.shooterMuzzleDroplets.pool[0].pos.clone();a.pos.x+=2;a.aimDir.set(1,0,0);sys._draw();assert(origin.equals(sys.shooterMuzzleDroplets.pool[0].pos));
 a.setWeapon('splatling');sys._draw();assert.equal(sys.shooterMuzzleDroplets.drawn,0);
 sys.clear();assert(sys.shooterMuzzleDroplets.pool.every(b=>b.owner===null));
 a.setWeapon('shooter');sys.fireShooter(a,a.weapon,0);const reused=sys.list[0];assert.equal(reused._iwShooterMuzzleSeen,false);reused.age=1/60;f.G.time+=1/60;sys._draw();assert.equal(sys.shooterMuzzleDroplets.drawn,C.drops);
 f.G.time+=C.life+1/60;sys._draw();assert.equal(sys.shooterMuzzleDroplets.count,0);assert.equal(sys.shooterMuzzleDroplets.drawn,0);
});
test('stress stays within fixed 32 bursts/96 drops and writes no new GPU resources',async()=>{
 const f=await setup(),sys=f.G.projectiles,a=f.make('shooter');a.isLocal=true;f.G.fx={muzzle(){},_spawnDrop(){}};
 for(let i=0;i<100;i++){sys.fireShooter(a,a.weapon,0);sys.list.at(-1).age=1/60;}
 f.G.time=1/60;sys._draw();assert.equal(sys.shooterMuzzleDroplets.count,C.bursts);assert.equal(sys.shooterMuzzleDroplets.drawn,C.bursts*C.drops);assert.equal(sys.shooterMuzzleDroplets.pool.length,C.bursts);
 sys.disposeVisuals();assert(sys.shooterMuzzleDroplets.pool.every(b=>b.owner===null));
});
