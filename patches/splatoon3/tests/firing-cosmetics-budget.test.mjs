import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './source-fixture.mjs';
// Synthetic mixed-effect saturation, actual emitted production draw function.
// Not a native weapon throughput or hardware performance claim.
test('Splatling cosmetics do not evict pre-existing late falling-drop effects from the shared 700-slot mesh',async()=>{
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>.37}),ps=f.G.projectiles,V=f.THREE.Vector3;
 f.G.camera={position:new V(0,3,-4)};
 // All 32 old Splatling volume triples fit the pre-existing 128-part budget.
 let parts=0;f.G.fx={inkVolumes:{isInkVolumes:true,assets:new Map([['shooter',{patterns:[{},{}]}]]),begin(){parts=0;},end(){},submitComposite(_p,rows){if(parts+rows.length>128)return false;parts+=rows.length;return true;}}};
 const a=f.make('splatling'),other=f.make('blaster');a.alive=other.alive=true;
 const add=(owner,type,i)=>{const p=ps._new();Object.assign(p,{type,wid:owner.weapon.id,owner,team:0,age:.1,delay:0,size:.12,vis:.086,seed:.37,life:3,straight:1,grav:0,drag:0,tail0:1,tailK:0,wob:0,sats:0});p.start.set(0,3,0);p.pos.set(0,3,1+i*.0001);p.vel.set(0,0,20);ps._push(p);return p;};
 for(let i=0;i<32;i++)add(a,'shot',i);
 for(let i=0;i<660;i++)add(other,'blast',i);
 const drops=[];for(let i=0;i<48;i++)drops.push({owner:other,pos:new V(i*.05,4,2),vel:new V(0,-1,0),radius:.1,seed:i/48,frames:2});ps._s3SplashDrops=drops;
 const before=JSON.stringify(ps.list.map(p=>[p.pos.toArray(),p.vel.toArray(),p.size,p.radius,p.damage,p.age,p.life,p.seed]));ps._draw();
 const matrix=new f.THREE.Matrix4();let retained=0;for(let i=0;i<ps.blobs.count;i++){ps.blobs.getMatrixAt(i,matrix);const e=matrix.elements;if(Math.abs(e[13]-4)<1e-6&&Math.abs(e[14]-2)<1e-6)retained++;}
 console.log('mixed-pool',JSON.stringify({sharedCount:ps.blobs.count,retainedFallingDrops:retained,oldSplatlingParts:parts,additionalShooter:ps.shooterMuzzleDroplets?.drawn??0}));
 assert.equal(JSON.stringify(ps.list.map(p=>[p.pos.toArray(),p.vel.toArray(),p.size,p.radius,p.damage,p.age,p.life,p.seed])),before);
 assert.equal(retained,40,'660 existing ordinary effects leave exactly 40 slots for the existing late falling drops; additional Splatling cosmetics must use leftovers');
});
