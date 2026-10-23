import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// #1813 production owner regression, not a Nintendo UnitDamageRate decoder.
// Only the selected source-indexed main projectile is retained after a real
// Actor-admitted volley, so a central glob cannot mask the secondary's result.
async function shot(f,unit,{pitch=0,index=0,native=false}={}){
  const {G}=f;G.projectiles.clear();G.actors.length=0;G.time=0;
  G.level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,-20],[20,0,20]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-30,-1,-30],max:[30,0,30]}]});
  G.physics=new f.Physics(G.level);G.paint.sample=()=>0;
  const owner=f.make(native?'roller':'s3-roller-heavy');owner.aimPitch=pitch*Math.PI/180;owner.aimYaw=owner.yaw=0;
  owner.aimPoint.set(0,1.05,80);owner.intent.fire=true;
  let n=0;while(!G.projectiles.list.some(p=>p.catalog||p.wid==='roller')&&n++<120){G.time+=1/60;owner.update(1/60);owner.intent.fire=false;}
  const volley=G.projectiles.list.filter(p=>p.catalog||p.wid==='roller');
  const zero=volley.filter(p=>p.catalog?.descriptor.unit===1);
  if(!native)assert.equal(zero.length,2,'actual Dynamo source unit1 retains both secondary globs');
  const p=native?volley[index]:volley.filter(p=>p.catalog.descriptor.unit===unit)[index];assert.ok(p,'selected real source unit exists');
  if(!native)assert.equal(p.catalog.descriptor.packet.UnitDamageRate,unit===1?0:undefined);
  G.projectiles.list=G.projectiles.list.filter(round=>round===p);
  return{owner,p};
}
function step(f,count=12){for(let t=0;t<count;t++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}

test('#1813 real Dynamo unit1 traverses player/device/canopy without phantom authority; source unit0 and native Splat hit all',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.setRandom(()=>.5);
  const proof=[];
  try{
    for(const kind of ['player','beakon','canopy'])for(const unit of [0,1,'native']){
      const {owner,p}=await shot(f,unit,{native:unit==='native'}),at=p.start.clone().addScaledVector(p.vel,1/60);
      const victim=f.make(kind==='canopy'?'s3-shelter-compact':'shooter');victim.team=1;victim.invuln=0;victim.hp=1000;victim.pos.copy(at);victim.pos.y-=.7;
      let object;
      if(kind==='beakon'){
        victim.pos.set(20,0,20);victim.weapon={...victim.weapon,sub:'beakon'};
        object=f.G.projectiles.throwBomb(victim);assert.ok(object);
        // Controlled isolated hit fixture: the candidate sits on this selected
        // source unit's path, independently of its original placement floor.
        object.s3SurfaceAttachment=null;object.phase='deployed';object.pos.copy(at);object.prev.copy(at);object.vel.set(0,0,0);object.hp=1000;object.expireAt=Infinity;
      }
      if(kind==='canopy'){
        victim.pos.set(20,0,20);victim.intent.fire=true;f.tick(victim,65);victim.intent.fire=false;
        object=victim.weaponRunner.catalogState.canopy;assert.ok(object?.open,'actual Undercover firing opens its source canopy');
        object.pos.copy(at);object.dir.copy(p.vel).normalize().negate();
        f.G.projectiles.list=f.G.projectiles.list.filter(round=>round===p);
      }
      const before=object?.hp??victim.hp;step(f);
      const after=object?.hp??victim.hp;
      if(unit===1)assert.equal(after,before,kind+' source zero unit does not claim a hit');
      else assert.ok(after<before,kind+' positive unit proves this exact geometric collision route reaches its target');
      proof.push({kind,unit,before,after,damage:before-after,resolvedDamage:p.damage});
      owner.weaponRunner.reset();
    }
    console.log(JSON.stringify({dynamoAuthority:proof}));
  }finally{f.restoreRandom();f.G.projectiles.clear();}
});

test('#1813 both zero-rate secondary globs still reach real floor collision and authoritative turf paint',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.setRandom(()=>.5);
  try{
    for(const index of [0,1]){
      const {owner,p}=await shot(f,1,{pitch:-45,index}),paints=[];const before=owner.stats.turf;
      class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;}_pushQuad(){}}
      const cpu=new Cpu(null,f.G.level,{atlasSize:512,maxDensity:4,cell:.25});f.G.paint=cpu;
      const splat=cpu.splat;
      cpu.splat=function(at,radius,team,options){const claimed=splat.call(this,at,radius,team,options);paints.push({at:Array.from(at.toArray()),radius,team,owner:options.claimOwner,claimed});return claimed;};
      step(f,180);
      assert.ok(!f.G.projectiles.list.includes(p),'selected real secondary completes its field lifetime');
      assert.ok(paints.length>0,'source zero damage does not erase terrain/paint authority');
      assert.ok(paints.every(p=>p.at.every(Number.isFinite)&&p.radius>0&&p.team===owner.team&&p.owner===owner),'paint retains finite source owner geometry');
      const claimed=paints.reduce((sum,p)=>sum+p.claimed,0);
      assert.ok(claimed>0,'real CPU paint grid claims new terrain cells');
      assert.ok(Math.abs(owner.stats.turf-before-claimed)<1e-8,'actual CPU-returned paint result owns turf credit');
      console.log(JSON.stringify({dynamoSecondaryPaint:{index,paintCalls:paints.length,claimed,turf:owner.stats.turf-before}}));
    }
  }finally{f.restoreRandom();f.G.projectiles.clear();}
});

test('#1813 actual Dynamo/native dome contacts settle source band damage after the pure Big Bubbler query',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { bigBubblerDomes, clearBigBubblers, tickBigBubblers } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';"});f.setRandom(()=>.5);
  const proof=[];
  try{
    for(const unit of [0,1,'native']){
      f.clearBigBubblers('isolated-dynamo-contact');
      const {p}=await shot(f,unit,{native:unit==='native'}),enemy=f.make('roller');enemy.team=1;enemy.pos.set(0,0,8);
      enemy.weapon={...enemy.weapon,special:'bubbler'};enemy.special=enemy.specialCost();enemy.intent.special=true;f.tick(enemy);enemy.intent.special=false;
      const dome=f.bigBubblerDomes()[0];assert.ok(dome,'actual admitted special deploys the dome');
      for(let i=0;i<100;i++)f.tickBigBubblers(1/60);
      const contacts=[],query=f.G.projectiles.kitDefenseCandidate;
      f.G.projectiles.kitDefenseCandidate=function(round,...args){
        const candidate=query.call(this,round,...args);
        if(candidate?.domeId&&round===p){
          const cachedAtQuery=candidate.damage,hit=candidate.onHit;
          candidate.onHit=(...args)=>{const hp=dome.hp,field=dome.fieldHp;const applied=hit(...args);contacts.push({cachedAtQuery,settledDamage:candidate.damage,resolvedProjectileDamage:p.damage,applied,hpDamage:hp-dome.hp,fieldDamage:field-dome.fieldHp});return applied;};
        }
        return candidate;
      };
      try{step(f,30);}finally{f.G.projectiles.kitDefenseCandidate=query;}
      const damage=contacts.reduce((n,c)=>n+c.hpDamage+c.fieldDamage,0);
      if(unit===1)assert.equal(damage,0,'paint-only unit never spends dome authority');
      else assert.ok(damage>0,'positive source/native glob reaches and damages its actual dome');
      if(unit===0){assert.ok(contacts.some(c=>c.cachedAtQuery===0&&c.settledDamage>0),'arbitration resolves the missing catalog band only at actual settlement');assert.ok(contacts.every(c=>Math.abs(c.applied-c.hpDamage-c.fieldDamage)<1e-8),'no extra payment or cached-ratio doubling');}
      proof.push({unit,damage,contacts});
    }
    console.log(JSON.stringify({dynamoBubblerAuthority:proof}));
  }finally{f.restoreRandom();f.G.projectiles.clear();f.clearBigBubblers('fixture-complete');}
});
