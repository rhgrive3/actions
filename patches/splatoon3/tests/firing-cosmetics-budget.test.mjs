import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './source-fixture.mjs';
// Synthetic mixed-effect saturation, actual composed/emitted production draw.
// This is not a native weapon throughput or hardware performance claim.
async function setup(){
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>.37}),ps=f.G.projectiles,V=f.THREE.Vector3;
 f.G.camera={position:new V(0,3,-4)};
 // All 32 old Splatling volume triples fit the pre-existing 128-part budget.
 let parts=0;f.G.fx={inkVolumes:{isInkVolumes:true,assets:new Map([['shooter',{patterns:[{},{}]}]]),begin(){parts=0;},end(){},submitComposite(_p,rows){if(parts+rows.length>128)return false;parts+=rows.length;return true;}}};
 const a=f.make('splatling'),other=f.make('blaster'),shooter=f.make('shooter');a.alive=other.alive=shooter.alive=true;
 const add=(owner,type,i,y=3)=>{const p=ps._new();Object.assign(p,{type,wid:owner.weapon.id,owner,team:0,age:type==='shot'&&owner===shooter?1/60:.1,delay:0,size:.12,vis:.086,seed:.37,life:3,straight:1,grav:0,drag:0,tail0:1,tailK:0,wob:0,sats:0});p.start.set(0,y,0);p.pos.set(0,y,1+i*.0001);p.vel.set(0,0,20);ps._push(p);return p;};
 const fill=(ordinary,splatlings,falling,withShooter=false)=>{ps.clear();f.G.time=1/60;for(let i=0;i<splatlings;i++)add(a,'shot',i,5);for(let i=0;i<ordinary;i++)add(other,'blast',i);if(withShooter)add(shooter,'shot',0,2);ps._s3SplashDrops=Array.from({length:falling},(_,i)=>({owner:other,pos:new V(i*.05,4,2),vel:new V(0,-1,0),radius:.1,seed:i/48,frames:2}));};
 const snapshot=()=>JSON.stringify(ps.list.map(p=>[p.pos.toArray(),p.vel.toArray(),p.size,p.radius,p.damage,p.age,p.life,p.seed]));
 const scan=()=>{const matrix=new f.THREE.Matrix4(),rows=[];let retained=0,spinners=0;for(let i=0;i<ps.blobs.count;i++){ps.blobs.getMatrixAt(i,matrix);const e=matrix.elements;if(Math.abs(e[13]-4)<1e-6&&Math.abs(e[14]-2)<1e-6)retained++;if(Math.abs(e[13]-5)<1e-6)spinners++;rows.push(Array.from(e));}return{retained,spinners,count:ps.blobs.count,shooter:ps.shooterMuzzleDroplets?.drawn??0,rows,shape:Array.from(ps.blobShape.array.slice(0,ps.blobs.count*4)),look:Array.from(ps.blobInkLook.array.slice(0,ps.blobs.count*4)),petals:Array.from(ps.blobFourPetals.array.slice(0,ps.blobs.count*2)),color:Array.from(ps.blobs.instanceColor.array.slice(0,ps.blobs.count*3))};};
 return{f,ps,fill,snapshot,scan,parts:()=>parts};
}
test('32 Splatlings cannot evict the 40 existing late drops at saturation',async()=>{
 const {ps,fill,snapshot,scan,parts}=await setup();fill(660,32,48);const before=snapshot();ps._draw();const r=scan();
 console.log('mixed-pool',JSON.stringify({sharedCount:r.count,retainedFallingDrops:r.retained,oldSplatlingParts:parts(),additionalShooter:r.shooter}));
 assert.equal(snapshot(),before);assert.equal(r.retained,40,'660 ordinary effects leave 40 slots for existing late drops');assert.equal(r.count,700);
});
test('zero residual capacity preserves all existing slots and suppresses both optional cosmetics',async()=>{
 const {ps,fill,scan,snapshot}=await setup();fill(660,0,40);ps._draw();const baseline=scan();fill(660,32,40,true);const before=snapshot();ps._draw();const r=scan();
 assert.equal(r.count,700);assert.equal(r.retained,40);assert.equal(r.spinners,0);assert.equal(r.shooter,0);assert.deepEqual(r.rows,baseline.rows);for(const key of ['shape','look','petals','color'])assert.deepEqual(r[key],baseline[key],key+' of all native effects');assert.equal(snapshot(),before);
});
test('partial residual capacity submits only available Splatling and Shooter beads',async()=>{
 const {ps,fill,scan}=await setup();fill(650,0,48);ps._draw();const baseline=scan();assert.equal(baseline.count,698);
 fill(650,1,48,true);ps._draw();const r=scan();assert.equal(r.count,700);assert.equal(r.retained,48);assert.equal(r.spinners,1);assert.equal(r.shooter,1);assert.deepEqual(r.rows.slice(0,698),baseline.rows);for(const key of ['shape','look','petals','color'])assert.deepEqual(r[key].slice(0,baseline[key].length),baseline[key],key+' native prefix');
});
test('ordinary mixed firing keeps smaller Splatling and muzzle Shooter cosmetics in free slots',async()=>{
 const {ps,fill,scan}=await setup();fill(12,2,4,true);ps._draw();const r=scan();assert.equal(r.retained,4);assert.equal(r.spinners,2);assert.equal(r.shooter,3);assert.equal(r.count,21);
 const m=new (ps.blobs.matrix.constructor)();ps.blobs.getMatrixAt(16,m);assert(Math.abs(Math.hypot(...m.elements.slice(0,3))-.052)<1e-7);assert(ps.blobShape.array[16*4]<=1+.72/.052+1e-5);
});
test('repeated full/partial/clear/reuse draws retain the fixed buffers and resources',async()=>{
 const {ps,fill,scan}=await setup(),mesh=ps.blobs,geometry=mesh.geometry,material=mesh.material,matrix=mesh.instanceMatrix.array,shape=ps.blobShape.array,look=ps.blobInkLook.array,records=ps.shooterMuzzleDroplets.pool;
 for(let i=0;i<4;i++){fill(660,32,48,true);ps._draw();assert.equal(scan().retained,40);ps.clear();assert.equal(ps.blobs.count,0);assert.equal(ps.shooterMuzzleDroplets.count,0);fill(12,2,4,true);ps._draw();assert.equal(scan().shooter,3);}
 assert.equal(ps.blobs,mesh);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(mesh.instanceMatrix.array,matrix);assert.equal(ps.blobShape.array,shape);assert.equal(ps.blobInkLook.array,look);assert.equal(records,ps.shooterMuzzleDroplets.pool);assert.equal(matrix.length,700*16);assert.equal(records.length,32);
});
