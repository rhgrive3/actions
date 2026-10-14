import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let ready;
const setup=()=>ready??=(async()=>{const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;})();
function actor(f,id){f.G.actors=[];f.G.projectiles.clear();const a=f.make(id);a.ink=100;a.form='kid';a.aimDir.set(0,0,1);a.character.aimReady=()=>1;a.character.getMuzzle=out=>out.set(.3,1.05,.2);a.character.getMuzzleHand=(out,hand)=>out.set(hand?-.3:.3,1.05,.2);f.G.physics.los=()=>true;return a;}
test('native and all catalog dualies share clear and two-ray blocked muzzle guard for either hand',async()=>{
 const reference=new Map();const f=await setup(),ids=['dualies',...Object.keys(f.WEAPONS).filter(id=>f.WEAPONS[id].catalogRecord?.family==='dualies')];
 for(const id of ids)for(const hand of [0,1])for(const mode of ['clear','first-blocked','both-blocked','nonfinite','outside']){
  const a=actor(f,id);let calls=0;f.G.physics.raycast=(_o,_d,_len,out)=>{out.hit=mode==='both-blocked'||mode==='first-blocked'&&Math.abs(_d.x)>1e-8;calls++;return out;};
  if(mode==='nonfinite'){a.character.getMuzzle=out=>out.set(.3,NaN,.2);a.character.getMuzzleHand=out=>out.set(-.3,NaN,.2);}
  if(mode==='outside'){a.character.getMuzzle=out=>out.set(100,1.05,100);a.character.getMuzzleHand=out=>out.set(-100,1.05,100);}
  const out=f.G.projectiles._muzzleHand(a,hand,new f.THREE.Vector3());assert.ok(out.toArray().every(Number.isFinite),id+' '+hand+' '+mode);
  assert.ok(out.distanceTo(new f.THREE.Vector3(0,1.05,0))<1.6);
  if(mode==='clear'){assert.deepEqual(Array.from(out.toArray()),[hand?-.3:.3,1.05,.2]);assert.ok(calls>=1,id+' '+hand+' '+mode);}
  if(mode==='first-blocked'||mode==='outside'){assert.deepEqual(Array.from(out.toArray()),[0,1.05,mode==='first-blocked'&&hand===0?0:.3],id+' '+hand+' '+mode);assert.ok(calls>=1,id+' '+hand+' '+mode);}
  if(mode==='both-blocked'){assert.deepEqual(Array.from(out.toArray()),[0,1.05,0]);assert.ok(calls>=1,id+' '+hand+' '+mode);}
  const key=hand+':'+mode,result={position:Array.from(out.toArray()),rays:calls};if(id==='dualies')reference.set(key,result);else assert.deepEqual(result,reference.get(key),id+' matches native '+key);
 }
 const a=actor(f,'shooter');let calls=0;f.G.physics.raycast=(_o,_d,_n,out)=>{calls++;out.hit=true;return out;};f.G.projectiles._muzzleHand(a,0,new f.THREE.Vector3());assert.equal(calls,1,'non-dual path retains its single existing constrainMuzzle ray');console.log('MUZZLE_GUARD_CASES',ids.length*10);
});
test('shootable Tetra roll emits only from the guarded center when both segments hit a wall',async()=>{
 const f=await setup(),a=actor(f,'s3-maneuver-stepper'),r=a.weaponRunner;assert.equal(!!a.weapon.catalogRecord.parameters.SideStepParam.IsShootableInMove,true);
 let rays=0;f.G.physics.raycast=(_o,_d,_len,out)=>{rays++;out.hit=true;return out;};a.intent.fire=true;assert.equal(r.tryDodge(new f.THREE.Vector3(1,0,0)),true);const events=[];const off=f.on('weapon:fire',e=>{if(e.actor===a)events.push(e);});
 try{let frames=0;while(r.catalogState.roll&&frames++<60){f.G.time+=1/60;r.update(1/60,{fire:true});}assert.ok(f.G.projectiles.list.length>0);assert.equal(events.length,f.G.projectiles.list.length);assert.ok(rays>=2*events.length);
 for(let i=0;i<events.length;i++){assert.deepEqual(Array.from(f.G.projectiles.list[i].start.toArray()),[0,1.05,0]);assert.deepEqual(Array.from(events[i].muzzle.toArray()),[0,1.05,0]);assert.equal(events[i].hand,(i+1)%2);}console.log('TETRA_WALL_ROLL',JSON.stringify({shots:events.length,rays}));
 }finally{off();f.G.projectiles.clear();}
});
