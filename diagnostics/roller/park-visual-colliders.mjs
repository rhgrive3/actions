// Diagnostic-only page.evaluate helper. Apply AFTER visualSetup, BEFORE fire.
// Narrow scope: canonical +Z horizontal Roller scenario. Never live performance.
export async function parkVisualColliders() {
 const G=window.__G,g=window.__inkwave,a=G.match.local,V=G.camera.position.constructor;
 if(!g.frozen||a.weaponId!=='roller'||Math.abs(a.pos.x)>1e-8||Math.abs(a.aimDir.x)>1e-8||a.aimDir.z<.99)throw Error('Parking requires frozen canonical horizontal Roller fixture');
 const configURL=performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname.endsWith('/src/config.js'));
 if(!configURL)throw Error('Cannot locate loaded native config module');
 const {PLAYER}=await import(configURL);
 const {hurtboxRadius}=await import(configURL.replace(/src\/config\.js$/, 'patches/splatoon3/runtime/player-hurtbox.mjs'));
 const {fidelityPlayerCollisionRadius}=await import(configURL.replace(/src\/config\.js$/, 'patches/splatoon3/runtime/weapons-fidelity.mjs'));
 const actors=G.actors,others=actors.filter(o=>o!==a);
 if(others.length!==7)throw Error('Expected all seven nonlocal native actors');
 const original=others.map((o,i)=>({index:i,name:o.name,team:o.team,pos:o.pos.toArray(),alive:o.alive,form:o.form}));
 const corridor={axis:'x',min:-8,max:8,projectileRadiusBound:2,actorRadiusBound:2};
 const slots=[],floorSearch=[];
 // Deterministic native-floor search, independent of boot actor positions.
 // Some lateral Tidewater coordinates are gaps: reject them, never invent a floor.
 for(let x=16;x<=32&&slots.length<others.length;x+=2){
  for(let z=-42;z<=-20&&slots.length<others.length;z+=2){
   const hit={hit:false,y:0,normal:new V(),block:-1,face:-1,center:false,grate:false};
   G.physics.groundProbe(x,5,z,10,10,.38,hit,false);
   const valid=!!(hit.hit&&hit.center&&!hit.grate&&hit.normal.y>=.68&&hit.block>=0&&hit.face>=0);
   floorSearch.push({x,z,valid,block:hit.block,face:hit.face});
   if(!valid)continue;
   slots.push({index:slots.length,pos:[x,hit.y,z],floorHit:{block:hit.block,face:hit.face,normal:hit.normal.toArray()},horizontalClearance:x-corridor.max-corridor.projectileRadiusBound-corridor.actorRadiusBound});
  }
 }
 if(slots.length!==others.length)throw Error('No seven verified native-floor slots outside projectile corridor');
 for(let i=0;i<others.length;i++){
  const o=others[i],s=slots[i];o.spawnAt(new V(...s.pos),0);
  o.form='kid';o.submerged=false;o.alive=true;o.hp=100;o.ink=100;o.invuln=0;o.vel.set(0,0,0);
  o.intent.move.set(0,0,0);o._prevIntent.move?.set(0,0,0);
  for(const k of ['fire','jump','squid','sub','special']){o.intent[k]=false;o._prevIntent[k]=false;}
  o._firePressT=o._squidPressT=-1;o.fireBuffer=o.jumpBuffer=0;o.weaponRunner?.reset?.();
  const actorRadius=hurtboxRadius(o,PLAYER);
  if(!Number.isFinite(actorRadius)||actorRadius>corridor.actorRadiusBound)throw Error('Native actor radius exceeds parking proof');
  s.actualActorRadius=actorRadius;
  o.character.root.position.copy(o.pos);o.character.root.updateMatrixWorld(true);
  if(o.s3?.squidSpawn)throw Error('Native actor reset did not clear spawn lifecycle');
  if(Math.abs(o.pos.x-s.pos[0])>1e-8||s.horizontalClearance<=0)throw Error('Collider parking clearance invalid');
 }
 G.scene.updateMatrixWorld(true);
 const receipt={method:'native Actor.spawnAt/reset on verified floor',original,slots,floorSearch,corridor,actorCount:actors.length,actorArrayPreserved:G.actors===actors,segments:[],actorHits:[]};
 const P=G.projectiles,oldStep=P._step;
 P._step=function(p,dt){
  const seed=p.seed,from=p.pos.toArray(),radiusBefore=fidelityPlayerCollisionRadius(p),dead=oldStep.call(this,p,dt),to=p.pos.toArray();
  if(p.wid==='roller'){
   const radiusAfter=fidelityPlayerCollisionRadius(p);
   if(!Number.isFinite(radiusBefore)||!Number.isFinite(radiusAfter)||Math.max(radiusBefore,radiusAfter)>corridor.projectileRadiusBound)throw Error('Actual projectile radius exceeds parking proof');
   const r={seed,from,to,radiusBefore,radiusAfter,age:p.age,retired:!!dead,actor:p.fidelityImpactActor?{name:p.fidelityImpactActor.name,team:p.fidelityImpactActor.team,pos:p.fidelityImpactActor.pos.toArray(),t:p.fidelityImpactT}:null};
   receipt.segments.push(r);if(r.actor)receipt.actorHits.push(r);
   if(Math.min(from[0],to[0])<corridor.min||Math.max(from[0],to[0])>corridor.max)throw Error('Actual Roller sweep escaped bounded corridor');
   if(r.actor)throw Error('Parked actor unexpectedly intercepted bounded Roller sweep');
  }
  return dead;
 };
 window.__iwColliderParking=receipt;return receipt;
}

export function finishVisualColliderReview(){
 const r=window.__iwColliderParking;
 if(!r||r.slots.length!==7||!r.segments.length||r.actorHits.length||window.__G.actors.length!==r.actorCount)throw Error('Incomplete collider parking proof');
 if(Math.max(...r.segments.map(s=>s.age))<.2)throw Error('Insufficient real projectile advancement');
 return r;
}
