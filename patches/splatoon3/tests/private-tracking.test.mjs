import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { compose } from './clothing-gear-fixture.mjs';
const exports = `export * from './patches/splatoon3/runtime/private-tracking.mjs';
 export * from './patches/splatoon3/runtime/private-tracking-render.mjs';
 export * from './patches/splatoon3/runtime/combat-info.mjs';
 export * from './patches/splatoon3/runtime/respawn-lifecycle.mjs';`;
async function rig(composed=false) {
 const f=await fixture({extraExports:exports,...(composed?{adaptNative:compose,adaptRuntime:compose}:{})});
 const a=f.make(),b=f.make(),c=f.make();a.team=c.team=0;b.team=1;
 a.isLocal=true;a.owner='local';a.nid=1;a.netLife=2;b.owner='enemy';b.nid=2;b.netLife=3;c.nid=3;c.netLife=2;
 a.s3.loadout[1].main='thermalInk';a.pos.set(0,0,0);b.pos.set(0,0,20);c.pos.set(0,0,0);
 b.invuln=0;f.G.match={mode:'turf',state:'playing',playing:()=>true,local:a,actors:[a,b,c],time:180};f.G.actors=[a,b,c];
 return {...f,a,b,c};
}
const direct=(f,weapon='shooter',amount=1)=>f.applyMainDirectHit({applyHit:(a,b,n,id)=>b.damage(n,a,id)},f.a,f.b,amount,weapon);
test('#348 Thermal Ink is retained only on the clothing main slot',async()=>{
 const f=await rig();for(let piece=0;piece<3;piece++)for(let slot=0;slot<4;slot++){
 const l=f.emptyLoadout();if(slot===0)l[piece].main='thermalInk';else l[piece].subs[slot-1]='thermalInk';
 const n=f.normalizeLoadout(l),value=slot===0?n[piece].main:n[piece].subs[slot-1];assert.equal(value,piece===1&&slot===0?'thermalInk':'none');
 }assert.equal(f.ABILITIES.thermalInk,'サーマルインク');
});
test('#348 direct accepted main HP damage produces a private 16-second record and refreshes it',async()=>{
 const f=await rig();direct(f);assert.equal(f.thermalTrackingRecord(f.b,f.a).until,16);assert.equal(f.thermalTrackingRecord(f.b,f.c),null);
 assert.equal(f.b.s3.revealedUntil,undefined);f.G.time=15;direct(f,'blaster');assert.equal(f.thermalTrackingRecord(f.b,f.a).until,31);
 f.G.time=31;assert.equal(f.thermalTrackingRecord(f.b,f.a),null);
});
test('#348 ambiguous splash, sub, special, invulnerable and armor-only hits cannot mark',async()=>{
 for(const source of ['blaster','slosher','roller','bomb','curling','storm','trizooka','ink']){
 const f=await rig();f.b.damage(1,f.a,source);assert.equal(f.thermalTrackingRecord(f.b,f.a),null,source);
 }
 const f=await rig();f.b.invuln=1;direct(f);assert.equal(f.thermalTrackingRecord(f.b,f.a),null);
 f.installRespawnLifecycle(f,f.profile);f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];
 f.G.physics.groundProbe=(...args)=>{args[6].hit=false;return args[6];};f.b.respawn();direct(f);
 assert.equal(f.b.hp,100);assert.equal(f.thermalTrackingRecord(f.b,f.a),null,'armor absorbs without HP-damage event');
});
test('#348 actual projectile damage entry tags direct blaster/slosher but an untagged splash stays excluded',async()=>{
 for(const weapon of ['blaster','slosher','roller']){
 const f=await rig();f.a.setWeapon(weapon);f.a.s3.loadout[1].main='thermalInk';
 const p={owner:f.a,wid:weapon,type:weapon,s3Weapon:f.a.weapon,age:0,start:new f.THREE.Vector3(),s3DamageGroup:weapon==='slosher'?new WeakMap():null};
 f.applyProjectileHit({applyHit:(a,b,n,id)=>b.damage(n,a,id)},p,f.b,1,null);
 assert.ok(f.thermalTrackingRecord(f.b,f.a),weapon);
 }
});
test('#348 submerged is hidden, wall climbing is eligible, and near fade is explicitly provisional',async()=>{
 const f=await rig();direct(f);assert.equal(f.privateTrackingOpacity(f.b,f.a),1);f.b.submerged=true;assert.equal(f.privateTrackingOpacity(f.b,f.a),0);
 f.b.climbing=true;assert.equal(f.privateTrackingOpacity(f.b,f.a),1);f.b.submerged=f.b.climbing=false;
 f.b.pos.z=5;assert.equal(f.privateTrackingOpacity(f.b,f.a),0);f.b.pos.z=7;assert.equal(f.privateTrackingOpacity(f.b,f.a),.5);
 assert.match(f.profile.clothingGear.trackingVisual.status,/PROVISIONAL/);
});
test('#348 HP exception uses the same private visibility, but never extends the three-second HP window or map reveal',async()=>{
 const f=await rig();direct(f);const opts={now:0,visible:false};assert.equal(f.healthActorVisible(f.b,f.a,opts),true);
 assert.equal(f.healthActorVisible(f.b,f.c,opts),false);assert.equal(f.mapActorVisible(f.b,f.a),false);
 f.b.lastDamage=3;assert.equal(f.healthActorVisible(f.b,f.a,opts),false);assert.ok(f.thermalTrackingRecord(f.b,f.a));
 f.b.lastDamage=0;f.b.submerged=true;assert.equal(f.healthActorVisible(f.b,f.a,opts),false);
});
test('#348 reset, target death/respawn, owner transfer, roster retirement and new matches invalidate private records',async()=>{
 for(const mode of ['owner-reset','victim-reset','death','owner-transfer','victim-transfer','disconnect','new-match','remote-respawn']){
 const f=await rig();direct(f);
 if(mode==='owner-reset')f.a.reset();if(mode==='victim-reset')f.b.reset();if(mode==='death')f.b.splat(f.c);
 if(mode==='owner-transfer')f.a.owner='replacement';if(mode==='victim-transfer')f.b.owner='replacement';
 if(mode==='disconnect')f.G.match.actors=[f.a,f.c];if(mode==='new-match')f.G.match={...f.G.match};if(mode==='remote-respawn')f.emit('combat:respawn',{actor:f.b});
 assert.equal(f.thermalTrackingRecord(f.b,f.a),null,mode);
 }
});
test('#348 confirmed-hit transport stores no public mark and admits only a validated nonzero owner ACK',async()=>{
 const f=await rig(true);f.b.remote=true;const nm=Object.create(f.NetMatch.prototype);nm.myId='local';nm.hitPending=new Map();nm.hitNextSeq=0;nm._pendingHits=new Map();nm._hitSeq=0;nm.byNid=new Map([[1,f.a],[2,f.b]]);const packets=[];nm.s={tr:{sendTo:(to,packet)=>{packets.push({to,packet});return true;}}};
 f.withMainDirectDamage(f.a,f.b,()=>nm.sendHit(f.a,f.b,10,'blaster'));
 assert.equal(f.thermalTrackingRecord(f.b,f.a),null,'prediction has no mark');assert.equal(packets[0].packet.privateThermal,undefined);
 const h=nm._hitSeq,receipt={h,a:1,v:2,d:10,kld:0,vl:3};nm._hitAck(receipt,'forged');assert.equal(f.thermalTrackingRecord(f.b,f.a),null);
 nm._hitAck(receipt,'enemy');assert.ok(f.thermalTrackingRecord(f.b,f.a));const end=f.thermalTrackingRecord(f.b,f.a).until;
 f.G.time=1;nm._hitAck(receipt,'enemy');assert.equal(f.thermalTrackingRecord(f.b,f.a).until,end,'replay cannot refresh');
 f.b.reset();f.b.remote=true;f.b.netLife=4;nm.sendHit(f.a,f.b,10,'shooter');nm._hitAck({h:nm._hitSeq,a:1,v:2,d:0,kld:0,vl:4},'enemy');assert.equal(f.thermalTrackingRecord(f.b,f.a),null,'armor-only receipt');
 nm.sendHit(f.a,f.b,10,'shooter');f.b.owner='replacement';f.b.netLife=5;nm._hitAck({h:nm._hitSeq,a:1,v:2,d:10,kld:0,vl:4},'enemy');assert.equal(f.thermalTrackingRecord(f.b,f.a),null,'reused ID after victim life advanced');
});
test('#348 a private second render pass shares real geometry, restores state, and retires only owned materials',async()=>{
 const f=await rig();const {THREE:T}=f;f.G.scene=new T.Scene();f.G.camera=new T.PerspectiveCamera();f.G.camera.position.set(0,1,0);f.G.physics.los=()=>false;
 const original=new T.MeshBasicMaterial(),geometry=new T.BoxGeometry();let disposedGeometry=0;geometry.addEventListener('dispose',()=>disposedGeometry++);
 const root=new T.Group(),mesh=new T.Mesh(geometry,original);root.add(mesh);root.position.copy(f.b.pos);f.G.scene.add(root);f.b.character.root=root;
 let calls=[],throwOverlay=false,disposedMaterial=0;f.G.renderer={autoClear:true,render(scene,camera){scene.updateMatrixWorld();calls.push({scene,camera,autoClear:this.autoClear,children:[...scene.children]});if(scene!==f.G.scene&&throwOverlay)throw Error('render injection');return 42;},dispose(){}};
 f.installPrivateTrackingRenderer(f,f.privateTrackingOpacity)();direct(f);assert.equal(f.G.renderer.render(f.G.scene,f.G.camera),42);assert.equal(calls.length,2);
 const proxy=calls[1].children[0];assert.equal(proxy.geometry,geometry);assert.notEqual(proxy.material,original);assert.equal(proxy.material.depthTest,false);assert.equal(mesh.material,original);assert.equal(mesh.parent,root);assert.equal(f.G.renderer.autoClear,true);
 proxy.material.addEventListener('dispose',()=>disposedMaterial++);throwOverlay=true;assert.throws(()=>f.G.renderer.render(f.G.scene,f.G.camera),/injection/);assert.equal(f.G.renderer.autoClear,true);throwOverlay=false;
 f.G.match.local=f.c;calls=[];f.G.renderer.render(f.G.scene,f.G.camera);assert.equal(calls.length,1);assert.equal(disposedMaterial,1);assert.equal(disposedGeometry,0);
 f.G.match.local=f.a;f.G.rig={mapK:1};calls=[];f.G.renderer.render(f.G.scene,f.G.camera);assert.equal(calls.length,1,'full map does not gain a private silhouette');f.G.renderer.dispose();assert.equal(disposedGeometry,0);
});
test('#348 960 fixed ticks expire the mark identically across render cadences',async()=>{
 for(const hz of [30,60,120,144]){
 const f=await rig();direct(f);const clock=new f.FixedClock();let count=0,last;
 for(let i=0;i<hz*16;i++)clock.advance(1/hz,dt=>{f.G.time+=dt;count++;last=!!f.thermalTrackingRecord(f.b,f.a,f.G.time);if(count===959)assert.equal(last,true);});
 assert.equal(count,960);assert.equal(last,false);
 }
});
