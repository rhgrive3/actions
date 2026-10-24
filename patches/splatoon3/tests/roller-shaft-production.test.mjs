import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{parse}from'../../loading-cache/vendor/acorn.mjs';
import{fixture}from'./source-fixture.mjs';import{nativeRollerGripGap}from'./roller-support-contact.mjs';
const fault=(rel,source)=>{if(rel!=='patches/splatoon3/runtime/roller.mjs')return source;const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),factory=ast.body.filter(n=>n.type==='ImportDeclaration').flatMap(n=>n.specifiers).find(s=>s.imported?.name==='createVerticalShaftReturn');assert(factory);
 const nodes=[];const walk=n=>{if(!n||typeof n!=='object')return;if(n.type)nodes.push(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);};walk(ast);
 const maker=nodes.filter(n=>n.type==='VariableDeclarator'&&n.init?.type==='CallExpression'&&n.init.callee.name===factory.local.name);assert.equal(maker.length,1);const calls=nodes.filter(n=>n.type==='VariableDeclarator'&&n.init?.type==='CallExpression'&&n.init.callee.name===maker[0].id.name);assert.equal(calls.length,1);const n=calls[0].init;return source.slice(0,n.start)+'null'+source.slice(n.end);};
const observed=(old)=>(rel,source)=>{
 if(old)source=fault(rel,source);
 if(rel!=='patches/splatoon3/runtime/roller-vertical-shaft-return.mjs')return source;
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),exports=ast.body.filter(n=>n.type==='ExportNamedDeclaration');
 const declaration=exports.find(n=>n.declaration?.id?.name==='createVerticalShaftReturn');
 const local=declaration?.declaration.id.name??exports.flatMap(n=>n.specifiers||[]).find(n=>n.exported.name==='createVerticalShaftReturn')?.local.name;assert(local);
 return source+'\nconst __qaOriginal='+local+';'+local+'=(...a)=>{const read=__qaOriginal(...a),reject=read.reject;read.reject=ch=>{globalThis.__shaftFallbackTicks?.push(ch.actor?._shaftQaTick);return reject(ch);};return read;};';
};
const apis=new Map(),host=o=>JSON.parse(JSON.stringify(o));async function api(old=false){if(!apis.has(old))apis.set(old,fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.4,
 adaptRuntime:observed(old),adaptEmittedRuntime:observed(old),extraExports:"export { recordMovementLaunch } from './patches/splatoon3/runtime/roller-freefall.mjs';"}));return apis.get(old);}
const renderer=()=>({capabilities:{getMaxAnisotropy:()=>1},target:null,getRenderTarget(){return this.target;},getClearColor(out){return out.setRGB(0,0,0);},getClearAlpha(){return 0;},setRenderTarget(t){this.target=t;},setClearColor(){},clear(){},render(){}});
async function run({old=false,id='roller',hz=60,release=48,repress=false,repeated=false,horizontal=false,airborne=false,held=false,movingAim=false,interrupt=null,repressHold=false}={}){
 const f=await api(old),{G,THREE:T}=f;G.time=10;G.camera=new T.PerspectiveCamera();G.scene=new T.Scene();G.level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-30,-.5,-30],max:[30,0,30]}]});G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);G.paint=new f.PaintSystem(renderer(),G.level,{atlasSize:512,maxDensity:2});
 const a=new f.Actor({team:0,name:'Roller Recovery QA',isLocal:true,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0,hat:0,brows:0}}),c=a.character;
 c.actor=a;c.onEvent=null;G.local=a;G.actors=[a];G.scene.add(c.root);a.reset();a.setWeapon(id);a.pos.set(0,0,0);a.yaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,0,20);a.grounded=true;a.vel.set(0,0,0);
 for(let i=0;i<120;i++){G.time+=1/60;a.weaponRunner.update(1/60,{fire:false});a._finishFrame(1/60);}c.fidget=-1;c.idleT=0;c.shufT=99;if(!horizontal)f.recordMovementLaunch(a);
 f.context.__shaftFallbackTicks=[];const paintTrace=[],splat=G.paint.splat;
 const describe=(v,seen=new WeakSet())=>{if(v===a)return{owner:'local actor',weapon:id,team:a.team};if(v==null||typeof v==='number'||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='function')return String(v);if(v.toArray)return Array.from(v.toArray());if(seen.has(v))return'[cycle]';seen.add(v);if(Array.isArray(v))return v.map(x=>describe(x,seen));return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,describe(x,seen)]));};
 G.paint.splat=function(center,radius,team,options){paintTrace.push({center:Array.from(center.toArray()),radius,team,options:describe(options)});return splat.apply(this,arguments);};
 let tick=0,previousFire=false;const clock=new f.FixedClock(),rows=[];
 try{for(let display=0;display<hz*(repeated?3:1.5);display++)clock.advance(1/hz,dt=>{
  const again=repeated&&tick===95,local=repeated&&tick>=95?tick-95:tick;if(again){a.weaponRunner.reset();if(!horizontal)f.recordMovementLaunch(a);}
  if(local===50){if(interrupt==='reset')a.weaponRunner.reset();if(interrupt==='cancel')c._s3CancelRollerFlick();if(interrupt==='form')a.form='squid';}a._shaftQaTick=tick;if(movingAim){a.yaw=.4*Math.sin(Math.max(0,local-48)*.2);a.aimPitch=.25*Math.sin(Math.max(0,local-48)*.25);a.aimDir.set(Math.sin(a.yaw)*Math.cos(a.aimPitch),Math.sin(a.aimPitch),Math.cos(a.yaw)*Math.cos(a.aimPitch));}
  const landing=horizontal?0:airborne?200:40;a.pos.set(0,local<landing?1.2*Math.sin(Math.PI*local/landing):0,0);a.grounded=local>=landing;a.vel.set(0,local<landing?1.2*Math.PI/(landing/60)*Math.cos(Math.PI*local/landing):0,0);
  a.intent.fire=held||local<release||repress&&local>=51&&local<53||repressHold&&local>=51;const pressed=a.intent.fire&&!previousFire;previousFire=a.intent.fire;
  a.intent.sub=interrupt==='sub'&&local>=50&&local<53;const subReleased=interrupt==='sub'&&local===53;a.weaponRunner.update(dt,{fire:a.intent.fire,firePressed:pressed,sub:a.intent.sub,subReleased});G.time+=dt;a._finishFrame(dt);G.projectiles.update(dt);c.root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(c.weapon.drum),s=c.s3RollerFlick,cat=a.weaponRunner.catalogState;
  rows.push({tick,local,centre:box.getCenter(new T.Vector3()).toArray(),axis:new T.Vector3(1,0,0).transformDirection(c.weapon.drum.matrixWorld).toArray(),bottom:box.min.y,pose:Array.from(c.P),floorSearch:{...c._s3RollerFloorSearch},
   fold:c.weapon.fold?.quaternion.toArray()??null,gaps:[nativeRollerGripGap(c,T,'handR',f.CHARACTER_CHANNELS),nativeRollerGripGap(c,T,'handL',f.CHARACTER_CHANNELS)],
   presentation:s?{windup:s.windup,interval:s.interval,elapsed:s.elapsed,shape:s.swingShape??null}:null,
   native:{input:a.intent.fire,subInput:a.intent.sub,subAim:a.weaponRunner.aimingSub,pos:a.pos.toArray(),velocity:a.vel.toArray(),grounded:a.grounded,ink:a.ink,cooldown:a.weaponRunner.cooldown,flick:a.weaponRunner.flick,rolling:a.weaponRunner.rolling,paintVersion:G.paint.version,
    attack:a.weaponRunner.s3RollerAttack?{...a.weaponRunner.s3RollerAttack}:null,catalog:cat?{id:cat.id,frame:cat.frame,pending:cat.pending?.remaining??null,swingCount:cat.swingCount}:null,
    bombs:(G.projectiles.bombs||[]).map(p=>({pos:p.pos?.toArray(),velocity:p.vel?.toArray(),timer:p.timer,t:p.t,team:p.team})),projectiles:G.projectiles.list.map(p=>({pos:p.pos.toArray(),velocity:p.vel.toArray(),damage:p.damage,age:p.age,type:p.type}))}});tick++;
 });}finally{c.dispose();G.paint.dispose?.();G.actors=[];G.scene=null;}const out=host(rows);Object.defineProperty(out,'paintTrace',{value:host(paintTrace)});Object.defineProperty(out,'fallbacks',{value:[...f.context.__shaftFallbackTicks]});return out;
}
const eq=(a,b,label)=>assert.deepEqual(a,b,label),dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('production fixed-tick return improves49, preserves40/start/end and all native gameplay/paint',async()=>{
 const before=await run({old:true}),candidate=await run();assert.deepEqual(candidate.fallbacks,[],'no hidden fallback');eq(candidate.map(r=>r.native),before.map(r=>r.native),'all native state');
 for(let i=0;i<candidate.length;i++)if(i<=48||i>=56)eq(candidate[i],before[i],'outside path '+i);
 assert(dist(candidate[49].centre,candidate[48].centre)<dist(before[49].centre,before[48].centre),'old-fails/new-passes real drum49');
 assert(candidate.every(r=>r.pose.every(Number.isFinite)&&r.gaps[0]<.002&&r.gaps[1]<.02),'unchanged finite physical grips');
});

test('release before/at/after back, late release and repress preserve native gates and paint without a delayed tail',async()=>{
 const trace=[];for(const options of[{release:40},{release:46},{release:52},{release:55},{release:56},{release:48,repress:true},{release:1,airborne:true},{release:48,movingAim:true}]){
  const b=await run({...options,old:true}),c=await run(options);assert.deepEqual(c.fallbacks,[],'no continuity claim through fallback '+JSON.stringify(options));eq(c.map(r=>r.native),b.map(r=>r.native),JSON.stringify(options));
  for(let i=56;i<c.length;i++)eq(c[i],b[i],'no tail '+JSON.stringify(options)+' '+i);
  assert(c.every(r=>r.pose.every(Number.isFinite)&&r.gaps[0]<.002&&r.gaps[1]<.02));
  trace.push({options,before:b.map(r=>({tick:r.tick,centre:r.centre})),candidate:c.map(r=>({tick:r.tick,centre:r.centre}))});
 }if(process.env.INKWAVE_SHAFT_CASE_TRACE)fs.writeFileSync(process.env.INKWAVE_SHAFT_CASE_TRACE,JSON.stringify(trace));
});

test('held rolling, horizontal and Carbon/Dynamo/Flingza keep the complete original output',async()=>{
 for(const options of[{held:true},{horizontal:true},...['s3-roller-compact','s3-roller-heavy','s3-roller-hunter'].map(id=>({id}))])eq(await run(options),await run({...options,old:true}),JSON.stringify(options));
});

test('30/60/120Hz plus repeated reset/reuse retain identical real poses, clocks, per-weapon timings and paint',async()=>{
 const timings=[];for(const id of['roller','s3-roller-compact','s3-roller-heavy','s3-roller-hunter']){const runs=[];for(const hz of[30,60,120])runs.push(await run({id,hz,repeated:true}));eq(runs[0],runs[1],id+' 30/60');eq(runs[1],runs[2],id+' 60/120');timings.push({id,windup:runs[0].find(r=>r.presentation)?.presentation.windup});}
 assert(new Set(timings.map(r=>r.windup)).size>=3,'no generic duration');
});


test('active return is discarded through existing reset, display cancellation and form interruption',async()=>{
 for(const interrupt of ['reset','cancel','form']){const b=await run({old:true,interrupt}),c=await run({interrupt});eq(c.map(r=>r.native),b.map(r=>r.native),interrupt+' native');
  for(let i=50;i<c.length;i++)eq(c[i],b[i],interrupt+' original display '+i);assert(c.every(r=>r.pose.every(Number.isFinite)));assert.deepEqual(c.fallbacks,[]);}
});


test('native CPU paint receives identical physical stamp inputs after release and repress',async()=>{
 for(const options of [{release:48},{release:48,repress:true}]){const b=await run({...options,old:true}),c=await run(options);assert(b.paintTrace.length>0,'real projectile impacts painted');eq(c.paintTrace,b.paintTrace,'all native stamp inputs '+JSON.stringify(options));}
});


test('repressing into native ground contact abandons carry without worsening the switch',async()=>{
 const b=await run({old:true,repressHold:true}),c=await run({repressHold:true});eq(c.map(r=>r.native),b.map(r=>r.native));
 assert(c.some(r=>r.local>=53&&r.native.rolling),'native rolling/contact actually admitted');for(let i=51;i<c.length;i++)eq(c[i],b[i],'original held/contact pose '+i);
 assert(dist(c[51].centre,c[50].centre)<=dist(b[51].centre,b[50].centre),'repress switch not worsened');eq(c.paintTrace,b.paintTrace);assert.deepEqual(c.fallbacks,[]);
});


test('sub aim and throw interrupt the active visual return while native sub admission stays original',async()=>{
 const b=await run({old:true,interrupt:'sub'}),c=await run({interrupt:'sub'});assert(c.some(r=>r.native.subAim),'real sub aim admitted');assert(c.some(r=>r.native.bombs.length>0),'real bomb born');eq(c.map(r=>r.native),b.map(r=>r.native));
 for(let i=50;i<c.length;i++)eq(c[i],b[i],'sub interrupt original display '+i);eq(c.paintTrace,b.paintTrace);
});

function motionMetrics(rows,start=48,end=58){
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=a=>Math.hypot(...a),v=rows.map((r,i)=>i?sub(r.centre,rows[i-1].centre):[0,0,0]),
  a=v.map((r,i)=>i?sub(r,v[i-1]).map(x=>x*3600):[0,0,0]),j=a.map((r,i)=>i?sub(r,a[i-1]).map(x=>x*60):[0,0,0]);
 return{step56:norm(v[56]),acceleration57:norm(a[57]),maxAcceleration:Math.max(...a.slice(start,end+1).map(norm)),maxJerk:Math.max(...j.slice(start,end+1).map(norm))};
}
test('same-attack repress never recaptures a late return; protect54/55 and deceleration through58',async()=>{
 const options={release:48,repress:true},before=await run({...options,old:true}),candidate=await run(options);eq(candidate.map(r=>r.native),before.map(r=>r.native));
 for(let i=51;i<=58;i++)eq(candidate[i],before[i],'same attack remains native after interruption '+i);
 const b=motionMetrics(before),c=motionMetrics(candidate);assert(c.maxAcceleration<=b.maxAcceleration+1e-9,'48–58 acceleration');assert(c.maxJerk<=b.maxJerk+1e-9,'48–58 finite jerk');
 assert.equal(c.step56,b.step56);assert.equal(c.acceleration57,b.acceleration57);
 if(process.env.INKWAVE_SHAFT_REPRESS_TRACE)fs.writeFileSync(process.env.INKWAVE_SHAFT_REPRESS_TRACE,JSON.stringify({options,before,candidate,metrics:{before:b,candidate:c}}));
});

test('late release with no native floor correction keeps the entire clear native carry',async()=>{
 const trace=[];for(const release of[49,52,55]){const b=await run({old:true,release}),c=await run({release});
  assert.equal(b[release].floorSearch.axis,-1);assert.equal(b[release].floorSearch.a,0,'first eligible native sample needs no floor correction');
  eq(c,b,'clear native carry is never bent '+release);eq(c.paintTrace,b.paintTrace);assert.deepEqual(c.fallbacks,[]);
  trace.push({release,before:b,candidate:c,metrics:{before:motionMetrics(b),candidate:motionMetrics(c)}});
 }if(process.env.INKWAVE_SHAFT_LATE_TRACE)fs.writeFileSync(process.env.INKWAVE_SHAFT_LATE_TRACE,JSON.stringify(trace));
});

test('an interrupted attack spends its own path and the next real native attack can capture again',async()=>{
 const options={release:48,repress:true,repeated:true},b=await run({...options,old:true}),c=await run(options);
 eq(c.map(r=>r.native),b.map(r=>r.native));eq(c.paintTrace,b.paintTrace);assert.deepEqual(c.fallbacks,[]);
 for(const start of[0,95]){assert(dist(c[start+49].centre,c[start+48].centre)<dist(b[start+49].centre,b[start+48].centre),'real attack49 uses a fresh eligible path '+start);
  for(let i=start+51;i<=start+58;i++)eq(c[i],b[i],'that attack stays native after repress '+i);
 }
});
