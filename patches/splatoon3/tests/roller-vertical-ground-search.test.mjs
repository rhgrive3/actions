// INKWAVE fixture regressions, not measured retail limits. The late-only test
// is deliberately paired with the whole-transition guard: a better 49th tick
// must not hide a worse landing. This candidate remains rejected if either fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { fixture } from './source-fixture.mjs';
import { nativeRollerGripGap } from './roller-support-contact.mjs';
const restriction = `        if (this.s3RollerFlick?.vertical && this.s3RollerFlick.released &&\n            !this.s3RollerFlick.rolling && !contacting && axisIndex !== 0) continue;`;
const fault=(rel,source)=>{
  if(rel!=='patches/splatoon3/runtime/roller.mjs')return source;
  if(source.includes(restriction)){
    assert.equal(source.split(restriction).length-1,1,'one scoped source guard');
    return source.replace(restriction,'');
  }
  const matches=[];const walk=n=>{if(!n||typeof n!=='object')return;
    if(n.type==='IfStatement'&&n.consequent.type==='ContinueStatement'){
      const code=source.slice(n.test.start,n.test.end);
      if(code.includes('.s3RollerFlick')&&code.includes('.released')&&code.includes('.rolling'))matches.push(n);
    }
    for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  };
  walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
  assert.equal(matches.length,1,'one scoped emitted guard');
  return source.slice(0,matches[0].start)+source.slice(matches[0].end);
};
const apis=new Map();
async function api(old=false){
  const injected=old||process.env.INKWAVE_ROLLER_GROUND_FAULT==='1';
  if(!apis.has(injected))apis.set(injected,fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,
    realProjectiles:true,vmMathRandom:()=>.4,adaptRuntime:injected?fault:undefined,adaptEmittedRuntime:injected?fault:undefined,
    extraExports:"export { recordMovementLaunch } from './patches/splatoon3/runtime/roller-freefall.mjs';"}));
  return apis.get(injected);
}
const host=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const maxStep=(rows,start=39,end=56)=>Math.max(...rows.filter(r=>r.tick>=start&&r.tick<=end).map(r=>distance(r.centre,rows[r.tick-1].centre)));
const lateral=rows=>Math.max(...rows.filter(r=>r.tick>=48&&r.tick<=56).map(r=>Math.abs(r.centre[0]-rows[r.tick-1].centre[0])));
async function run({old=false,id='roller',hz=60,scenario='released-edge',restart=false}={}){
  const f=await api(old),{G,THREE:T}=f;G.time=10;G.scene=new T.Scene();
  G.level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-30,-.5,-30],max:[30,0,30]}]});
  G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);
  const a=new f.Actor({team:0,name:'Roller Recovery QA',isLocal:true,weapon:id,CharacterClass:f.Character,
    style:{hair:0,skin:2,outfit:0,eyes:0,hat:0,brows:0}}),c=a.character;
  c.actor=a;c.onEvent=null;G.actors=[a];G.local=a;G.scene.add(c.root);a.reset();a.setWeapon(id);a.pos.set(0,0,0);a.yaw=0;a.aimPitch=0;
  a.aimDir.set(0,0,1);a.aimPoint.set(0,0,20);a.form='kid';a.submerged=a.climbing=false;a.specialActive=null;
  a.superJumpState=null;a.invuln=0;a.vel.set(0,0,0);a.grounded=true;a.weaponRunner.reset();
  for(let i=0;i<120;i++){G.time+=1/60;a.weaponRunner.update(1/60,{fire:false});a._finishFrame(1/60);}c.fidget=-1;c.idleT=0;c.shufT=99;
  const rows=[],clock=new f.FixedClock();let tick=0;
  try{
    if(scenario!=='horizontal')f.recordMovementLaunch(a);
    for(let display=0;display<hz*(restart?3:1.1);display++)clock.advance(1/hz,dt=>{
      const again=restart&&tick===95,local=again||tick>95?tick-95:tick;
      if(again){a.weaponRunner.reset();if(scenario!=='horizontal')f.recordMovementLaunch(a);}
      const landing=scenario==='horizontal'?0:scenario==='airborne'?100:scenario==='landing-edge'?48:40;
      a.pos.set(0,local<landing?1.2*Math.sin(Math.PI*local/landing):0,0);a.grounded=local>=landing;
      a.vel.set(0,local<landing?1.2*Math.PI/(landing/60)*Math.cos(Math.PI*local/landing):0,0);
      a.intent.fire=scenario==='landing-edge'||(scenario==='horizontal'||scenario==='released-edge')&&local<48;
      a.weaponRunner.update(dt,{fire:a.intent.fire,firePressed:tick===0||again});G.time+=dt;a._finishFrame(dt);
      G.projectiles.update(dt);c.root.updateMatrixWorld(true);
      const b=new T.Box3().setFromObject(c.weapon.drum),state=a.weaponRunner.s3RollerAttack;
      rows.push({tick,centre:b.getCenter(new T.Vector3()).toArray(),lowest:b.min.y,pose:Array.from(c.P),presentationAttack:c.s3RollerFlick?{windup:c.s3RollerFlick.windup,interval:c.s3RollerFlick.interval,elapsed:c.s3RollerFlick.elapsed,swingShape:c.s3RollerFlick.swingShape??null}:null,
        rightGap:nativeRollerGripGap(c,T,'handR',f.CHARACTER_CHANNELS),leftGap:nativeRollerGripGap(c,T,'handL',f.CHARACTER_CHANNELS),
        native:{pos:a.pos.toArray(),velocity:a.vel.toArray(),grounded:a.grounded,ink:a.ink,cooldown:a.weaponRunner.cooldown,
          flick:a.weaponRunner.flick,rolling:a.weaponRunner.rolling,attack:state?{...state}:null,catalog:a.weaponRunner.catalogState?{id:a.weaponRunner.catalogState.id,frame:a.weaponRunner.catalogState.frame,pending:a.weaponRunner.catalogState.pending?.remaining??null,swingCount:a.weaponRunner.catalogState.swingCount}:null,
          projectiles:G.projectiles.list.map(p=>({pos:p.pos.toArray(),velocity:p.vel.toArray(),damage:p.damage,age:p.age,type:p.type}))}});
      tick++;
    });
  }finally{c.dispose();G.actors=[];G.scene=null;}
  return rows;
}

test('late ZR release: old cross-axis drum jump fails the 0.30 lateral regression limit',async()=>{
  const old=await run({old:true}),current=await run();
  assert(lateral(old)>.30,'unchanged negative control exposes the sideways jump');
  assert(lateral(current)<=.30,'late lateral jump remains inside the INKWAVE regression limit');
});

test('whole transition: reducing the late jump must not move a larger jump to landing',async()=>{
  const old=await run({old:true}),current=await run();
  assert(maxStep(current)<=maxStep(old)+1e-9,`whole-transition peak worsened: ${maxStep(old)} -> ${maxStep(current)}`);
});

test('horizontal and airborne output stay identical; ZR release and landing preserve native gameplay',async()=>{
  for(const scenario of ['horizontal','airborne','released-edge','landing-edge']){
    const old=await run({old:true,scenario}),current=await run({scenario});
    assert.deepEqual(host(current.map(r=>r.native)),host(old.map(r=>r.native)),'all clocks, births, damage, ink, movement and inputs '+scenario);
    if(scenario==='horizontal'||scenario==='airborne')assert.deepEqual(host(current),host(old),'out-of-scope pose '+scenario);
    assert(current.every(r=>r.pose.every(Number.isFinite)&&r.rightGap<.002&&r.leftGap<.02),'finite paired grips '+scenario);
  }
});

test('per-weapon clocks and trajectories remain refresh independent across restart/reuse',async()=>{
  const trace=[];
  for(const id of ['roller','s3-roller-compact','s3-roller-heavy','s3-roller-hunter']){
    const runs=[];for(const hz of [30,60,120])runs.push(await run({id,hz,restart:true}));
    assert.deepEqual(runs[0],runs[1],id+' 30/60');assert.deepEqual(runs[1],runs[2],id+' 60/120');
    trace.push({id,windup:runs[0].find(r=>r.presentationAttack)?.presentationAttack.windup});
  }
  assert(new Set(trace.map(r=>r.windup)).size>=3,'native Carbon/ordinary/Dynamo/Flingza timing remains distinct '+JSON.stringify(trace));
  if(process.env.INKWAVE_ROLLER_GROUND_TRACE)fs.writeFileSync(process.env.INKWAVE_ROLLER_GROUND_TRACE,JSON.stringify(trace));
});
