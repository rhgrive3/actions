import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {fixture} from './source-fixture.mjs';

// Observe entry into the actual native solver; keep its body and return value.
// Resolve its exported binding with Acorn so source and emitted names both work.
function observeCapsules(rel, source) {
  if(rel!=='patches/splatoon3/runtime/weapons-collision.mjs')return source;
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  let binding;
  for(const node of ast.body)if(node.type==='ExportNamedDeclaration') {
    if(node.declaration?.id?.name==='capsuleEntry')binding=node.declaration.id.name;
    for(const item of node.specifiers||[])if(item.exported.name==='capsuleEntry')binding=item.local.name;
  }
  const functions=ast.body.map(node=>node.declaration||node).filter(node=>node.type==='FunctionDeclaration'&&node.id.name===binding);
  assert.equal(functions.length,1,'one actual exported capsule solver');
  const fn=functions[0],base=fn.params[2];assert.equal(base.type,'Identifier');
  assert.ok(!source.includes('__iwExactCapsuleVisits'));
  return source.slice(0,fn.body.start+1)+`\n__iwExactCapsuleVisits.push([${base.name}.x,${base.name}.y,${base.name}.z]);\n`+
    source.slice(fn.body.start+1)+`\nconst __iwExactCapsuleVisits=[];\nexport function takeExactCapsuleVisits(){return __iwExactCapsuleVisits.splice(0);}\n`;
}
async function setup() {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    adaptRuntime:observeCapsules,adaptEmittedRuntime:observeCapsules,vmMathRandom:()=>.5,
    extraExports:`export {capsuleEntry,takeExactCapsuleVisits} from './patches/splatoon3/runtime/weapons-collision.mjs';
      export {hurtboxRadius,hurtboxHeight} from './patches/splatoon3/runtime/player-hurtbox.mjs';
      export {beginActorMotionTick} from './patches/splatoon3/runtime/actor-motion.mjs';`});
  const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
  class Display {
    constructor(){this.root=new f.THREE.Group();}
    _owner(){return this.actor;} trigger(){} setVisible(){} setHurt(){} setWeapon(){}
    getMuzzle(out){return out.copy(this.actor.pos).add(V(0,1.05,.3));}
  }
  const scene=new f.THREE.Scene(),level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
    spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  Object.assign(f.G,{scene,level,physics:new f.Physics(level),camera:new f.THREE.PerspectiveCamera(),
    actors:[],boss:null,netm:null,fx:null,audio:null,paint:{sample:()=>0,splat:()=>0},
    match:{playing:()=>true,canRespawn:()=>false},time:0,mode:'match'});
  const projectiles=f.G.projectiles=new f.Projectiles(scene),hits=[];
  const off=f.on('hit',e=>hits.push({name:e.victim.name,damage:e.damage}));
  let serial=0;
  const actor=(name,x,z,team=1)=>{
    const a=new f.Actor({team,name,weapon:team?'shooter':'charger',isLocal:team===0,CharacterClass:Display});
    a.character.actor=a;Object.assign(a,{nid:++serial,owner:team?'B':'A',remote:false,hp:1000,invuln:0,grounded:true});
    a.pos.set(x,0,z);a.aimDir.set(0,0,1);a.aimPoint.set(x,1.05,40);f.G.actors.push(a);return a;
  };
  const owner=actor('owner',0,0,0);
  const launch=()=>{projectiles.fireCharger(owner,owner.weapon,1);assert.equal(projectiles._fidelityChargerFlights.length,1);return projectiles._fidelityChargerFlights[0];};
  return {...f,actor,owner,launch,hits,projectiles,close(){off();projectiles.clear();}};
}

test('finite Charger executes the native capsule solver for every eligible actor, including distant misses',async()=>{
  const f=await setup();try{
    const near=f.actor('near',0,2),collision=f.profile.weaponsFidelityCompletion.weapons.charger.CollisionParam;
    const envelope=f.hurtboxRadius(near,f.PLAYER)+Math.max(collision.InitRadiusForPlayer,collision.EndRadiusForPlayer);
    const far=f.actor('far',20,2),miss=f.actor('miss',envelope+.01,2),graze=f.actor('graze',envelope*(1-1e-6),3);
    const dead=f.actor('dead',0,1);dead.alive=false;
    f.actor('ally',0,1,0);const seen=f.actor('seen',0,1);
    const job=f.launch();job.seen.add(seen);f.takeExactCapsuleVisits();
    f.projectiles.update(1/60);
    assert.deepEqual(Array.from(f.takeExactCapsuleVisits(),row=>Array.from(row)),
      [near,far,miss,graze].map(a=>[a.pos.x,a.pos.y,a.pos.z]),'native owner filtering applies; no extra AABB skips a capsule scan');
    assert.deepEqual(f.hits.map(h=>h.name),['near','graze']);
    assert.ok(near.hp<1000&&graze.hp<1000);assert.equal(far.hp,1000);assert.equal(miss.hp,1000);
  }finally{f.close();}
});

for(const hz of [30,60,120])test(`native Charger grazing hit and separated miss remain exact at ${hz}Hz`,async()=>{
  const f=await setup();try{
    const target=f.actor('grazing',0,2),collision=f.profile.weaponsFidelityCompletion.weapons.charger.CollisionParam;
    const radius=f.hurtboxRadius(target,f.PLAYER),height=f.hurtboxHeight(target,f.PLAYER);
    const envelope=radius+Math.max(collision.InitRadiusForPlayer,collision.EndRadiusForPlayer);
    target.pos.x=envelope*(1-1e-6);const miss=f.actor('outside',envelope+.01,2),job=f.launch();
    const end=job.pos.clone().addScaledVector(job.dir,Math.min(job.speed/60,job.range-job.travel));
    assert.notEqual(f.capsuleEntry(job.pos,end,target.pos,radius,height,collision.InitRadiusForPlayer,collision.EndRadiusForPlayer),null);
    assert.equal(f.capsuleEntry(job.pos,end,miss.pos,radius,height,collision.InitRadiusForPlayer,collision.EndRadiusForPlayer),null);
    f.takeExactCapsuleVisits();const clock=new f.FixedClock();
    for(let frame=0;frame<hz/10;frame++)clock.advance(1/hz,dt=>{f.beginActorMotionTick(f.G.actors);f.G.time+=dt;f.projectiles.update(dt);});
    assert.deepEqual(f.hits.map(h=>h.name),['grazing']);assert.ok(target.hp<1000);assert.equal(miss.hp,1000);
    assert.ok(f.takeExactCapsuleVisits().length>=2,'both the hit and separated miss reached the actual capsule solver');
  }finally{f.close();}
});
