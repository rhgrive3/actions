// Executable adoption decisions. Proposed shortcuts are transformed into a
// separate actual-source fixture; failed candidates never enter production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {actualModule} from '../../network-replication/tests/added-actual-module.mjs';
import {fixture} from './source-fixture.mjs';
import {installDualiesNetwork,DUALIES_TURRET_FLAG} from '../runtime/dualies-network.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function replace(source,from,to){assert.equal(source.split(from).length,2,from);return source.replace(from,to);}
const profile=JSON.parse(read('../profile.json'));
const cache=`const proposedUnitCounts=new WeakMap();function proposedUnitCount(units){if(proposedUnitCounts.has(units))return proposedUnitCounts.get(units);const n=units.reduce((n,u)=>n+(u.BulletNum??1),0);proposedUnitCounts.set(units,n);return n;}\n`;
function packet(){const e=Array(34).fill(0);Object.assign(e,{0:100,1:'p',2:1,3:'slosh',4:'slosher',11:0,12:1,27:{s3SlosherPaintBirth:['inkwave-slosher-birth-v1','epoch',0]},29:.5,30:1,31:8,32:1,33:1});return e;}

test('q296 receiver identity cache admits a unit invalidated by a real mutable source-row edit',async()=>{
  async function run(candidate){
    const data=structuredClone(profile.weaponsFidelityCompletion),units=data.weapons.slosher.UnitGroupParam.Unit;
    const m=await actualModule('patches/splatoon3/runtime/weapons-fidelity.mjs',{
      transform:s=>candidate?cache+replace(s,'rawWeapon(weapon)?.UnitGroupParam?.Unit?.reduce((n,u)=>n+(u.BulletNum??1),0)','proposedUnitCount(rawWeapon(weapon)?.UnitGroupParam?.Unit)'):s,
      extra:'export function setTestApi(value,data){api=value;completion=data;}'});
    m.api.setTestApi({WEAPONS:{slosher:{id:'slosher',kind:'slosher'}},SPECIALS:{}},data);
    assert.equal(Object.isFrozen(units),false);assert.ok(units.every(u=>!Object.isFrozen(u)));
    const first=m.api.validFidelityRollerUnitPacket(packet());units[0].BulletNum--;
    return [first,m.api.validFidelityRollerUnitPacket(packet())];
  }
  assert.deepEqual(await run(false),[true,false]);assert.deepEqual(await run(true),[true,true]);
});

test('q230 outbound identity cache disagrees with the actual Slosher emitter after source mutation',async()=>{
  async function run(candidate){
    const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5,
      adaptRuntime:(rel,s)=>candidate&&rel.endsWith('/weapons-fidelity.mjs')?cache+replace(s,
        'rawWeapon(w).UnitGroupParam.Unit.reduce((n,u)=>n+(u.BulletNum??1),0)','proposedUnitCount(rawWeapon(w).UnitGroupParam.Unit)'):s});
    const a=f.make('slosher'),ps=f.G.projectiles,units=f.profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit;
    a.aimDir.set(0,0,1);a.aimPoint.set(0,1,50);ps.fireSlosh(a,a.weapon);assert.equal(ps.list.filter(p=>p.type==='slosh').length,9);
    ps.clear();units[0].BulletNum--;let error;try{ps.fireSlosh(a,a.weapon);}catch(e){error=e.message;}
    return {count:ps.list.filter(p=>p.type==='slosh').length,error};
  }
  assert.deepEqual(await run(false),{count:8,error:undefined});assert.deepEqual(await run(true),{count:8,error:'Slosher unit index'});
});

test('q253 native status expiry must include restored or externally-written Actor status, beyond the local writer roster',async()=>{
  async function run(candidate){
    const m=await actualModule('patches/splatoon3/runtime/all-subs.mjs',{
      transform:s=>candidate?'const proposedToxicOwners=new Set();\n'+replace(replace(s,
        'function updateStatuses(api, dt) {\n  for(const actor of api.G.actors||[]){','function updateStatuses(api, dt) {\n  for(const actor of proposedToxicOwners){'),
        '  target.s3.toxicMistSlowUntil=Math.max(target.s3.toxicMistSlowUntil||0,until);','  proposedToxicOwners.add(target);\n  target.s3.toxicMistSlowUntil=Math.max(target.s3.toxicMistSlowUntil||0,until);'):s,
      extra:'export {updateStatuses,refreshToxicLease};'});
    const normal={alive:true,team:1,s3:{}},restored={alive:true,team:1,s3:{toxicMistSlowUntil:1,toxicMistScale:.5,toxicMistJumpScale:.8}},api={G:{time:0,actors:[normal,restored]}};
    m.api.refreshToxicLease(api,{team:0},normal,1,.5,.8);api.G.time=2;m.api.updateStatuses(api,1/60);
    assert.deepEqual(Object.keys(normal.s3),[],'normal production writer/expiry remains covered by the proposal');
    return Object.keys(restored.s3);
  }
  assert.deepEqual(await run(false),[]);assert.deepEqual(await run(true),['toxicMistSlowUntil','toxicMistScale','toxicMistJumpScale']);
});

test('q258 skipping non-rearm polls breaks the actual disabled-controller snapshot contract',async()=>{
  async function run(candidate){
    const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
      adaptRuntime:(rel,s)=>candidate&&rel.endsWith('/respawn-lifecycle.mjs')?replace(s,
        'this.a.s3.physicalRespawnHeld = physicalHolds(this.input, this.a.s3.physicalRespawnHeld);',
        'if(this.a.s3.respawnRearm)this.a.s3.physicalRespawnHeld = physicalHolds(this.input, this.a.s3.physicalRespawnHeld);'):s});
    const a=f.make(),held=new Set(),calls=[];
    const input={mouse:{left:false,right:false},down(k){calls.push(k);return held.has(k);},padButton:()=>false,padValue:k=>held.has(k)?1:0};
    const c=new f.PlayerController(a,{},input);c.enabled=false;c.update(1/60);
    const first=a.s3.physicalRespawnHeld;held.add('Space');held.add(7);c.update(1/120);
    return {created:!!first,identity:first===a.s3.physicalRespawnHeld,fire:a.s3.physicalRespawnHeld?.fire,jump:a.s3.physicalRespawnHeld?.jump};
  }
  assert.deepEqual(await run(false),{created:true,identity:true,fire:true,jump:true});
  assert.deepEqual(await run(true),{created:false,identity:true,fire:undefined,jump:undefined});
});

test('q286 native reuse may execute an observable setter that repopulates another Trizooka field',async()=>{
  async function run(candidate){
    const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
      adaptRuntime:(rel,s)=>candidate&&rel.endsWith('/weapons-fidelity.mjs')?replace(s,
        'const p=fresh.apply(this,args);kitTrizookaClearPooled(p);',
        "const p=fresh.apply(this,args);if(p===recycled){delete p.s3SpecialWeapon;delete p.s3Weapon;}else kitTrizookaClearPooled(p);"):s});
    const ps=f.G.projectiles,p=ps._new();ps.pool.length=0;let injected=0;
    const retained=new Proxy(p,{set(target,key,value){if(key==='s3SpecialWeapon'){target.s3Stage=123;injected++;}return Reflect.set(target,key,value);}});
    ps.pool.push(retained);const next=ps._new();assert.equal(next,retained);assert.equal(injected,1);
    return Object.hasOwn(next,'s3Stage');
  }
  assert.equal(await run(false),false);assert.equal(await run(true),true,'narrow two-key postclear leaks a freshly repopulated kit stage');
});

test('q161 even a reset, bounded stroke pool changes a retained completed native stroke after stop/restart',async()=>{
  async function run(candidate){
    const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5,
      adaptRuntime(rel,s){if(!candidate||!rel.endsWith('/main-weapon-catalog.mjs'))return s;
        s=s.replaceAll('s.rollPaint=null;','if(s.rollPaint)s._proposedIdleRollPaint=s.rollPaint;s.rollPaint=null;');
        return replace(s,'    const stroke=s.rollPaint||(s.rollPaint={',`    if(!s.rollPaint&&s._proposedIdleRollPaint){
      const old=s._proposedIdleRollPaint;s._proposedIdleRollPaint=null;
      for(const key of ['from','to','point','heading'])old[key].copy(a.pos);
      for(const key of ['point','origin','down'])old.contact[key].copy(a.pos);
      old.contact.hit=new Hit();old.contact.rollScratch=null;old.contact.blockCorners=null;old.contact.rollScratchDepth=0;
      old.active=false;old.pending=false;old.face=-1;s.rollPaint=old;
    }
    const stroke=s.rollPaint||(s.rollPaint={`);
      }});
    const a=f.make('s3-roller-compact');a.intent.move.set(0,0,1);a.intent.fire=true;f.tick(a,100);
    const prior=a.weaponRunner.catalogState.rollPaint;assert.ok(prior,'actual catalogue movement creates the original stroke');
    const retained=Array.from(prior.to.toArray());a.intent.fire=false;f.tick(a);assert.equal(a.weaponRunner.catalogState.rollPaint,null);
    a.pos.x=10;a.intent.fire=true;a.ink=100;f.tick(a,100);const next=a.weaponRunner.catalogState.rollPaint;assert.ok(next);
    return {same:prior===next,old:Array.from(prior.to.toArray()),retained};
  }
  const before=await run(false),candidate=await run(true);assert.equal(before.same,false);assert.deepEqual(before.old,before.retained);
  assert.equal(candidate.same,true);assert.notDeepEqual(candidate.old,candidate.retained);
});

test('Dualies callback reuse keeps separate escaping views, method replacement, recursion, throws and replacement guards',()=>{
  const retained=[],messages=[];let recurse=false,throwNow=false,replaceNow=false;
  class NetMatch{
    _sendTick(){const tr=this.s.tr;retained.push(tr);const row=Array(11).fill(0);row[0]=7;row[10]=3;tr.broadcast({k:'t',a:[row]},'tail');
      if(recurse){recurse=false;this._sendTick();}if(replaceNow)this.s.tr={replacement:true};if(throwNow)throw Error('send');return 17;}
    applyRemote(){} _remoteSplat(){} _remoteRespawn(){} _adopt(){} _sample(){} onLeave(){}
  }
  installDualiesNetwork({NetMatch});const nm=new NetMatch(),transport={broadcast(message,...rest){messages.push(['old',this===transport,message.a?.[0]?.[10],rest]);return 11;}};
  nm.s={tr:transport};nm.byNid=new Map([[7,{weapon:{kind:'dualies'},weaponRunner:{s3Turret:true}}]]);
  assert.equal(nm._sendTick(),17);assert.equal(nm._sendTick(),17);assert.notEqual(retained[0],retained[1]);assert.equal(retained[0].broadcast,retained[1].broadcast);
  assert.equal(messages[0][2],3|DUALIES_TURRET_FLAG);assert.equal(nm.s.tr,transport);
  transport.broadcast=function(message,...rest){messages.push(['new',this===transport,message.a?.[0]?.[10],rest]);};nm._sendTick();
  assert.notEqual(retained[2].broadcast,retained[0].broadcast);retained[0].broadcast({k:'other'},'retained');
  assert.equal(messages.at(-1)[0],'old','retained view never adopts a later broadcast replacement');
  recurse=true;nm._sendTick();assert.equal(nm.s.tr,transport);assert.notEqual(retained.at(-1),retained.at(-2));
  throwNow=true;assert.throws(()=>nm._sendTick(),/send/);assert.equal(nm.s.tr,transport);throwNow=false;
  replaceNow=true;nm._sendTick();assert.deepEqual(nm.s.tr,{replacement:true});
});
