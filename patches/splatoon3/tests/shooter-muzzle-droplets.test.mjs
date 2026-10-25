import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {isOrdinaryShooter,muzzleDropletFamily,SHOOTER_MUZZLE_COSMETICS as C} from '../runtime/shooter-muzzle-droplets.mjs';
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
test('shared 3D muzzle-only beads include legacy and 11.3.0 Spinner/Dualies but exclude paint, other families and specials',()=>{
 for(const family of ['shooter','splatling','dualies']){
  assert.equal(muzzleDropletFamily({type:'shot',catalog:{r:{family}}}),family);
  assert.equal(muzzleDropletFamily({type:'shot',s3Weapon:{kind:family}}),family);
  assert.equal(muzzleDropletFamily({type:'shot',wid:family}),family);
 }
 for(const family of ['charger','blaster','slosher','stringer','brella','roller','brush','splatana'])
  assert.equal(muzzleDropletFamily({type:'shot',catalog:{r:{family}}}),null);
 assert.equal(muzzleDropletFamily({type:'shot',wid:'splatling',s3SpecialWeapon:true}),null);
 assert.equal(muzzleDropletFamily({type:'drop',wid:'dualies'}),null);
 assert.equal(muzzleDropletFamily({type:'shot',catalog:{r:{family:'brella'}},wid:'dualies'}),null);
});

test('live Dualies 3D beads preserve independent right/left launch sockets and change no gameplay state',async()=>{
 const f=await setup(),sys=f.G.projectiles,a=f.make('dualies');
 a.isLocal=true;a.pos.set(0,0,0);a.aimPoint.set(0,1.05,70);a.aimDir.set(0,0,1);
 a.character.getMuzzle=out=>out.set(.3,1.05,.3);
 a.character.getMuzzleHand=(out,hand)=>out.set(hand?-.3:.3,1.05,.3);
 f.G.fx={muzzle(){},_spawnDrop(){}};
 sys.fireDualies(a,a.weapon,0,0);sys.fireDualies(a,a.weapon,0,1);
 const rounds=sys.list.slice(),muzzle=rounds.map(p=>p.start.clone());
 assert.equal(rounds.length,2);assert.ok(muzzle[0].distanceTo(muzzle[1])>.4);
 let paint=0,rng=0;f.G.paint.splat=()=>{paint++;return 0;};
 f.setRandom(()=>{rng++;return .5;});
 for(const p of rounds)p.age=1/60;f.G.time=1/60;const before=rounds.map(gameplay);sys._draw();
 const b=sys.shooterMuzzleDroplets;
 assert.equal(b.count,2);assert.equal(b.drawn,2*C.drops);assert.equal(b.emitted,2*C.drops);
 assert.equal(b.pool[0].family,'dualies');assert.equal(b.pool[1].family,'dualies');
 assert.ok(b.pool[0].pos.distanceTo(muzzle[0])<1e-8);
 assert.ok(b.pool[1].pos.distanceTo(muzzle[1])<1e-8);
 assert.equal(rng,0);assert.equal(paint,0);
 assert.deepEqual(rounds.map(gameplay),before);
 // An animation change after the bullets leave cannot move the free beads.
 a.character.getMuzzle=out=>out.set(0,1.05,20);
 sys._draw();assert.ok(b.pool[0].pos.distanceTo(muzzle[0])<1e-8);
 assert.ok(b.pool[1].pos.distanceTo(muzzle[1])<1e-8);
 f.G.time+=C.life+1/60;sys._draw();assert.equal(b.drawn,0);
});

test('live legacy Splatling firing receives three additional cosmetic droplets without replacing its independent body',async()=>{
 const f=await setup(),sys=f.G.projectiles,a=f.make('splatling');a.isLocal=true;
 f.G.fx={muzzle(){},_spawnDrop(){}};sys.fireSplatling(a,a.weapon,0);
 assert.equal(sys.list.length,1);const p=sys.list[0],original=gameplay(p);
 p.age=1/60;f.G.time=1/60;sys._draw();
 assert.equal(sys.shooterMuzzleDroplets.drawn,C.drops);
 assert.equal(sys.shooterMuzzleDroplets.pool[0].family,'splatling');
 assert.ok(sys.blobs.count>=1+C.drops,'independent Splatling body and 3D muzzle beads');
 assert.equal(gameplay(p),JSON.stringify(JSON.parse(original).map((v,i)=>i===5?1/60:v)));
});

test('live 11.3.0 catalogue Splatling and Dualies inherit the same pure muzzle beads',async()=>{
 const f=await setup(),sys=f.G.projectiles;
 for(const [id,frames] of [['s3-spinner-quick',75],['s3-maneuver-short',4]]){
  sys.clear();f.G.actors.length=0;
  const a=f.make(id);a.isLocal=true;a.form='kid';a.ink=100;
  a.intent.fire=true;f.tick(a,frames);a.intent.fire=false;f.tick(a,2);
  const round=sys.list.find(p=>p.owner===a&&p.catalog?.r?.id===id);
  assert.ok(round,id+' must fire a source-family projectile');
  round.age=1/60;f.G.time+=1/60;
  sys._draw();
  assert.ok(sys.shooterMuzzleDroplets.drawn>=C.drops,id+' 3D muzzle beads');
  assert.equal(sys.shooterMuzzleDroplets.pool[0].family,id.includes('spinner')?'splatling':'dualies');
 }
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
