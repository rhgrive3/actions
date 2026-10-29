import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

// Real Actor/Runner/Physics/Projectiles; the fixture's cosmetic Character and
// muzzle are controlled. Compare the same native input sequence with/without
// canonical admission. Queue allocations are never promoted to hit receipts.
let ready;
const world=()=>ready??=fixture({productionComposition:true,fullRuntime:true,
  realProjectiles:true,vmMathRandom:()=>.5,
  extraExports:"export {createCanonicalWeaponActions} from './patches/network-replication/canonical-weapon-actions.mjs';"}).then(f=>{
    f.G.level=new f.Level({bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},spawnPads:[[-50,0,-50],[50,0,50]],spawnBarrier:0,half:[],
      single:[{kind:'box',min:[-60,-1,-60],max:[60,0,60]}]});
    f.G.physics=new f.Physics(f.G.level);f.G.camera=new f.THREE.PerspectiveCamera();return f;
  });
const plain=v=>JSON.parse(JSON.stringify(v));
function run(f,id,schedule,{canonical=true,ticks=180}={}){
  const {G}=f;G.actors.length=0;G.projectiles.clear();G.time=0;G.netm=null;
  const a=f.make(id);delete a._integrate;
  a.nid=1;a.owner='A';a.netLife=0;a._nearCamera=()=>false;
  const c=f.createCanonicalWeaponActions(f.installedRuntime);c.register(a,{owner:'A',life:0,epoch:'mode',firstTick:0});
  const rows=[],events=[];let tick=0;
  const off=f.on('weapon:fire',e=>{if(e.actor===a)events.push({tick,charge:e.charge??null,hand:e.hand??null,
    muzzle:e.muzzle.toArray(),dir:e.dir.toArray()});});
  try{
    for(;tick<ticks;tick++){
      const input={fire:false,sub:false,jump:false,squid:false,special:false,move:[0,0],...schedule(tick)};
      const raw={nid:1,owner:'A',life:0,input,aim:[0,0],aimPoint:[0,1.05,55]};
      if(canonical){const p=c.prepare(raw,{tick,from:'A'});assert.equal(p.ok,true,id+' request'+tick);assert.equal(c.apply(p.token).ok,true);}
      else{for(const key of ['fire','sub','jump','squid','special'])a.intent[key]=input[key];a.intent.move.set(...[input.move[0],0,input.move[1]]);a.aimYaw=a.aimPitch=0;a.aimPoint.set(...raw.aimPoint);}
      G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);
      const r=a.weaponRunner,s=r.catalogState;
      rows.push({tick,pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,form:a.form,
        charge:r.charge,chargeT:r.chargeT,charging:r.charging,streaming:r.streaming,
        nativeStored:r.s3Stored?{charge:r.s3Stored.charge,remaining:r.s3Stored.remaining,fireDelay:r.s3Stored.fireDelay}:null,
        chargeF:s?.chargeF??null,stream:s?.stream??null,streamElapsed:s?.streamElapsed??null,
        paid:s?.paid??null,streamUsed:s?.streamUsed??null,dodge:!!r.dodge,lock:r.lockT,
        glide:!!r.s3DualiesGlide});
    }
    return plain({rows,events});
  }finally{off();G.projectiles.clear();G.actors=[];}
}

test('canonical inputs preserve a native full Charger keep, surfaced delay and full-charge release',async()=>{
  const f=await world(),schedule=t=>({fire:t<120,squid:t>=70&&t<90});
  const actual=run(f,'charger',schedule),control=run(f,'charger',schedule,{canonical:false});
  assert.deepEqual(actual,control,'all native state/resource/position/event samples match');
  assert.ok(actual.rows[69].charge>=.999,'source native full charge exists before keeping');
  assert.ok(actual.rows.some(r=>r.form==='squid'&&r.nativeStored?.charge>=.999),'a real full-charge store is admitted');
  assert.ok(actual.rows.some(r=>r.form==='kid'&&r.nativeStored?.fireDelay>0),'surface fire delay remains distinct');
  assert.ok(actual.events.some(e=>e.tick>=120&&e.charge>=.999),'the released native flight retains full charge');
});

test('canonical Ballpoint inputs preserve paid stream budget during recharge and later release',async()=>{
  const f=await world(),schedule=t=>({fire:t<90||t>=110&&t<150});
  const actual=run(f,'s3-spinner-downpour',schedule,{ticks:220});
  const control=run(f,'s3-spinner-downpour',schedule,{ticks:220,canonical:false});
  assert.deepEqual(actual,control,'native remaining-charge conversion and payments are unchanged');
  assert.ok(actual.rows[109].stream>0,'an actual funded stream precedes recharge');
  assert.equal(actual.rows[110].stream,0,'native recharge owns the next held-input tick');
  assert.ok(actual.rows[110].charging&&actual.rows[110].chargeF>0,'remaining funded charge enters the native charge owner');
  assert.ok(actual.rows[110].ink<actual.rows[109].ink,'additional native charge spends actual ink');
  assert.ok(actual.events.some(e=>e.tick>90&&e.tick<110)&&actual.events.some(e=>e.tick>=150),'both native streams emit');
});

test('canonical Splat Dualies move/jump/fire retains native dodge admission, seven-ink payment and post-roll lock',async()=>{
  const f=await world(),schedule=t=>({fire:t<90,jump:t===10,move:t===10?[0,1]:[0,0]});
  const actual=run(f,'dualies',schedule,{ticks:120}),control=run(f,'dualies',schedule,{ticks:120,canonical:false});
  assert.deepEqual(actual,control,'native movement/collision/cadence/resource results match each fixed tick');
  assert.ok(actual.rows.some(r=>r.dodge),'real native dodge admitted');
  assert.ok(actual.rows.some(r=>r.glide),'native post-roll glide remains independent');
  assert.ok(actual.rows.some(r=>r.lock>0&&!r.dodge),'post-roll lock remains independent');
  assert.ok(actual.rows[10].ink<=actual.rows[9].ink-7+1e-8,'native roll spends its source seven ink');
  assert.ok(actual.rows.some(r=>r.pos[2]>3),'actual Actor/Physics advances the roll');
});
