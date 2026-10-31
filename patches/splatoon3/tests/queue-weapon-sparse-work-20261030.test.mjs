import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture } from './source-fixture.mjs';
import { releaseSplatlingInterrupt } from '../runtime/weapons.mjs';
import { ProjectileVisualRuntime } from '../runtime/projectile-visuals.mjs';

const F=1/60;
function replace(source,from,to){assert.equal(source.split(from).length,2,from);return source.replace(from,to);}
async function world(control=false){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export { kitBombTrail } from './patches/splatoon3/runtime/kit-subs.mjs';",
    adaptRuntime(rel,source){
      if(rel.endsWith('/all-specials.mjs')){
        if(control)source=replace(source,'probeBound=(canMark?Math.max(markRadius,1.2):1.2)+1e-9;','probeBound=Math.max(markRadius,1.2)+1e-9;');
        source=replace(source,'Infinity:Math.hypot(dx,dz);','Infinity:(globalThis.__waveDistances=(globalThis.__waveDistances||0)+1,Math.hypot(dx,dz));');
      }
      if(rel.endsWith('/kit-subs.mjs')){
        if(control)source=replace(source,'if(PHYSICS_REF.pointCapsuleDist===CAPSULE_DISTANCE_REF&&','if(false&&PHYSICS_REF.pointCapsuleDist===CAPSULE_DISTANCE_REF&&');
        source=replace(source,'const distance = PHYSICS_REF.pointCapsuleDist(b.pos, b.s3ContactBase, PLAYER_REF.radius, h);',
          'const distance = (globalThis.__curlingDistances=(globalThis.__curlingDistances||0)+1,PHYSICS_REF.pointCapsuleDist(b.pos, b.s3ContactBase, PLAYER_REF.radius, h));');
      }
      return source;
    }});
  f.G.time=0;f.G.scene=new f.THREE.Scene();f.G.projectiles=new f.Projectiles(f.G.scene);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};f.G.physics.los=()=>true;
  f.G.paint={sample:()=>1,splat:()=>0};f.setRandom(()=>.5);return f;
}
function count(f,name){return vm.runInContext('globalThis.'+name+'||0',f.context);}
function clearCount(f,name){vm.runInContext('globalThis.'+name+'=0',f.context);}

test('Splatling release preserves charge/stream write order, press identity and exceptions',()=>{
  const rows=[],press={},runner=new Proxy({}, {set(o,k,v){rows.push([k,v]);o[k]=v;return true;}});
  assert.equal(releaseSplatlingInterrupt(runner,press),undefined);
  assert.deepEqual(rows,[['s3ChargeInterruptT',0],['s3ChargeInterruptPressT',press],['s3StreamInterrupt',0],['s3StreamInterruptPressT',press]]);
  let writes=0;assert.throws(()=>releaseSplatlingInterrupt(new Proxy({}, {set(){if(++writes===3)throw Error('write');return true;}}),3),/write/);
  assert.equal(writes,3);
});

test('native Wave generator keeps 57F marks/contact cooldowns while far post-mark probes disappear',async()=>{
  async function run(control,hz){
    const f=await world(control),{G}=f,a=f.make();a.weapon={...a.weapon,special:'waveBreaker',specialCost:100};a.special=100;
    a._startSpecial();a.intent.sub=true;a._updateSpecial(F);a.intent.sub=false;
    for(let i=0;i<20&&a.specialActive;i++)a._updateSpecial(F);
    const device=G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(device);
    for(let i=0;i<600&&device.phase==='flight';i++){G.time+=F;G.projectiles.update(F);}
    assert.notEqual(device.phase,'flight');
    const actors=[0,1.2,1.2+1e-8,4,12,20].map((x,i)=>{const t=f.make();t.nid=i+20;t.team=1;t.hp=10000;t.invuln=0;t.pos.copy(device.pos);t.pos.x+=x;return t;});
    G.actors=[a,...actors];const hits=[];G.projectiles.applyHit=(owner,victim,n,w)=>{hits.push([victim.nid,n,w]);};
    clearCount(f,'__waveDistances');const rows=[];
    for(let i=0;i<hz*1.3;i++){
      G.time+=1/hz;G.projectiles.update(1/hz);
      rows.push([device.age,device.pulse,...actors.flatMap(t=>[t.s3.revealedUntil?.[a.team]??0,device.contactTimes?.get(t)??null])]);
    }
    return {rows,hits,probes:count(f,'__waveDistances')};
  }
  for(const hz of [30,60,120]){const before=await run(true,hz),after=await run(false,hz);
    assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.hits,before.hits);assert.ok(after.probes<before.probes,`${hz}Hz ${after.probes}<${before.probes}`);
  }
});

test('native Curling trail prunes only horizontally impossible finite capsules and keeps custom/NaN paths',async()=>{
  async function run(control,custom=false){
    const f=await world(control),{G}=f,a=f.make('roller'),ps=G.projectiles;
    a.weapon={...a.weapon,sub:'curling'};ps.throwBomb(a);const b=ps.bombs[0];assert.ok(b);
    b.s3Mode='rolling';b.pos.set(0,.4,0);b.vel.set(0,0,0);b.age=1;
    const radius=f.PLAYER.radius+.2,points=[[0,0,0],[radius,0,0],[radius+1e-8,0,0],[10,0,10],[-10,0,10],[0,3,0],[10,NaN,0],[NaN,0,0]];
    const actors=points.map((p,i)=>{const t=f.make();t.nid=i+20;t.team=1;t.pos.set(...p);t.smoothY=0;t.form=i%2?'squid':'human';return t;});
    G.actors=[a,...actors];const hits=[];ps.applyHit=(owner,victim,n,w)=>hits.push([victim.nid,n,w]);
    if(custom)f.Physics.pointCapsuleDist=()=>0;
    clearCount(f,'__curlingDistances');
    for(let i=0;i<3;i++){b.age+=.4;f.kitBombTrail(f.SUB,b,G.paint,ps);}
    return {hits,calls:count(f,'__curlingDistances'),times:actors.map(t=>b.s3ContactTimes.get(t)??null),base:Array.from(b.s3ContactBase.toArray())};
  }
  const before=await run(true),after=await run(false);assert.deepEqual(after.hits,before.hits);assert.deepEqual(after.times,before.times);assert.deepEqual(after.base,before.base);
  assert.ok(after.calls<before.calls);
  assert.deepEqual(await run(false,true),await run(true,true),'overridden capsule solver retains its prior authority');
});

test('history renderer clears stale Roller groups exactly once before sparse frames and later reuse',async()=>{
  const f=await world(),THREE=f.THREE,system={list:[],scene:new THREE.Scene(),inkFlight:{time:0}},r=new ProjectileVisualRuntime(system,THREE);
  let fills=0,links=0;const fill=r.groupOccupied.fill.bind(r.groupOccupied),link=r._rollerLinks.bind(r);
  r.groupOccupied.fill=(...args)=>{fills++;return fill(...args);};r._rollerLinks=(...args)=>{links++;return link(...args);};
  r.ensureBirth=()=>{};r.handles=()=>true;
  // Exercise the production draw boundary; the shape emitter below writes
  // exactly the group fields that real horizontal Roller bodies own.
  r._drawRound=p=>{if(!p.roller)return;const i=r.renderRecordCount++;r.renderRecords[i]=p;r.groupOccupied[0]|=1;r.groupIds[0]=1;r.groupHeads[0]=i;r.groupNext[i]=-1;};
  system.list=[{}];for(let i=0;i<100;i++)r.draw();assert.equal(fills,0);assert.equal(links,0);
  system.list=[{roller:true}];r.draw();assert.equal(fills,0);assert.equal(links,0);assert.equal(r.groupOccupied[0],1);
  system.list=[{}];r.draw();assert.equal(fills,1);assert.equal(r.groupOccupied[0],0);for(let i=0;i<100;i++)r.draw();assert.equal(fills,1);
  system.list=[{roller:true}];r.draw();system.list=[];r.draw();assert.equal(fills,2);assert.equal(r.groupOccupied[0],0);r.draw();assert.equal(fills,2);
  r.clear();assert.equal(r.renderRecordCount,0);assert.equal(r.groupOccupied[0],0);r.dispose();
});
