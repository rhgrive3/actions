import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// PvP 11.3.0, no gear, native admitted inputs/Projectiles fixed-step world.
// Controlled terrain planes; not a Switch trajectory measurement.
const EXTRA="export {replaySpecial,superChumpLandingPreview} from './patches/splatoon3/runtime/all-specials.mjs';export {inkVacState} from './patches/splatoon3/runtime/kit-ink-vac.mjs';";
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const events=[];f.on('all:special',e=>events.push(e));
 const make=(id,y=0)=>{const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;
   a.pos.set(0,y,0);a.aimPitch=0;a.aimYaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,y+1,30);a._resolve=()=>{};a.invuln=0;a._startSpecial();return a;};
 const actor=(a,n=1)=>{for(let i=0;i<n;i++)if(a.specialActive)a._updateSpecial(1/60);};
 const tick=(n=1,dt=1/60)=>{for(let i=0;i<n;i++){f.G.time+=dt;f.G.projectiles.update(dt);}};
 const sub=a=>{a.intent.sub=true;actor(a);a.intent.sub=false;actor(a,40);};
 const objects=()=>f.G.projectiles._s3AllSpecialObjects||[];
 const land=o=>{for(let i=0;i<600&&o.phase==='flight';i++)tick();assert.notEqual(o.phase,'flight');assert.ok(!o.dead);};
 return {f,events,make,actor,tick,sub,objects,land};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('Wave actual throw uses raw velocity/gravity/drag and separates airborne gauge and ground pulse clocks',async()=>{
 const w=await world(),a=w.make('waveBreaker',100);w.sub(a);
 const o=w.objects().find(o=>o.kind==='wave');assert.ok(o);assert.equal(o.phase,'flight');
 near(o.vel.z,18);near(o.vel.y,4.2);near(o.gravity,32.4);near(o.airResist,.001);
 assert.equal(a.specialActive,null);assert.ok(a.s3SpecialGaugeLocks.get('waveBreaker'));
 const start=o.pos.clone();w.tick();near(o.pos.z-start.z,18*.999/60);near(o.vel.y,(4.2-32.4/60)*.999);
 w.tick(89);assert.equal(o.phase,'flight');assert.equal(w.objects().some(o=>o.kind==='waveFront'),false);
 w.land(o);assert.ok(o.landedAt>1.5);assert.equal(o.pulse,0);
 w.tick(89);assert.equal(o.pulse,0);w.tick();assert.equal(o.pulse,1,'90F begins at real ground contact');
});

test('Thrown Wave and Screen are lost in open water and clear retires in-flight records',async()=>{
 const w=await world();w.f.G.level.groundHeight=()=>-Infinity;
 for(const id of ['waveBreaker','splattercolorScreen']){
   const a=w.make(id);w.sub(a);const o=w.objects().find(o=>o.owner===a);assert.equal(o.phase,'flight');
   w.tick(300);assert.equal(o.dead,true);assert.equal(w.objects().includes(o),false);
   assert.equal(w.events.some(e=>e.actor===a&&e.action==='land'),false,'no phantom deployment over water');
   assert.equal(a.s3SpecialGaugeLocks?.has(id),false);
 }
 const a=w.make('waveBreaker',100);w.sub(a);const o=w.objects().find(o=>o.owner===a);
 w.f.G.projectiles.clear();assert.equal(o.dead,true);assert.equal(w.objects().length,0);
});

for(const plane of ['wall','ceiling','grate'])test(`Triple guide sticks to ${plane} terrain, then waits 82F and survives thrower death`,async()=>{
 const w=await world(),a=w.make('tripleInkstrike');
 if(plane==='ceiling'){a.aimPitch=.7;a.aimDir.set(0,Math.sin(.7),Math.cos(.7));}
 const grates=[];w.f.G.physics.segment=(from,to,h,skipGrates)=>{
   grates.push(skipGrates);const dim=plane==='wall'?'z':'y',at=plane==='wall'?4:plane==='grate'?.5:2;
   const crosses=plane==='grate'?from[dim]>at&&to[dim]<=at:from[dim]<at&&to[dim]>=at;
   h.hit=crosses;if(crosses){h.point.copy(from).lerp(to,(at-from[dim])/(to[dim]-from[dim]));h.normal.set(0,0,0);h.normal[dim]=plane==='grate'?1:-1;}return h;
 };
 w.sub(a);const o=w.objects().find(o=>o.kind==='marker');assert.ok(o);assert.equal(o.phase,'flight');
 // A player or barrier does not participate in this terrain-only sweep.
 const victim=w.f.make();victim.team=1;victim.pos.set(0,0,2);a.splat(null,'test');
 w.land(o);assert.equal(o.phase,'warning');assert.ok(grates.every(v=>v===false),'metal grates participate in guide collision');
 const at=o.pos.clone();w.tick(81);assert.equal(o.kind,'marker');assert.equal(o.pos.distanceTo(at),0,'stuck guide does not seek the floor');
 w.tick();assert.equal(o.kind,'strike');assert.equal(o.owner,a);
});

test('Triple column crosses solid terrain, reaches the source upper height, and caps its lower reach',async()=>{
 const w=await world(),a=w.make('tripleInkstrike');w.sub(a);const o=w.objects().find(o=>o.kind==='marker');w.land(o);
 const hits=[];w.f.G.projectiles.applyHit=(owner,victim,damage,source)=>{if(source==='tripleInkstrike')hits.push({owner,victim,damage});};
 const at=y=>{const v=w.f.make();v.team=1;v.pos.copy(o.pos);v.pos.y+=y-.75;return v;};
 const high=at(19.9),above=at(20.1),low=at(-9.9),below=at(-10.1);
 w.f.G.physics.los=()=>false;w.tick(82);
 assert.ok(hits.some(h=>h.victim===high&&h.damage===37.5));assert.ok(hits.some(h=>h.victim===low));
 assert.equal(hits.some(h=>h.victim===above||h.victim===below),false);
});

test('New flight birth and land replay preserve phase/age without granting ghost damage or paint authority',async()=>{
 const w=await world(),a=w.make('tripleInkstrike');w.sub(a);
 const birth=w.events.find(e=>e.actor===a&&e.kind==='marker'&&e.action==='deploy'),ghost=w.f.make();ghost.remote=true;ghost.team=1;
 assert.equal(w.f.replaySpecial(w.f,{...birth,actor:ghost}),true);
 const o=w.objects().find(o=>o.owner===a),copy=w.objects().find(o=>o.owner===ghost);assert.equal(copy.phase,'flight');near(copy.vel.z,o.vel.z);
 w.land(o);const land=w.events.find(e=>e.actor===a&&e.action==='land');assert.ok(land);
 assert.equal(w.f.replaySpecial(w.f,{...land,actor:ghost}),true);assert.equal(copy.phase,'warning');near(copy.landedAt,land.landedAt);near(copy.age,land.age);
 assert.equal(copy.vel,null);let paint=0;w.f.G.paint.splat=()=>{paint++;return 1;};
 w.objects().splice(w.objects().indexOf(o),1);w.tick(140);assert.equal(paint,0);assert.equal(copy.dead,true);
});

test('Chump keeps airborne squid holding, rejects airborne placement, and emits after 13F grounded setup',async()=>{
 const w=await world(),a=w.make('superChump');a.grounded=false;a.intent.squid=true;w.actor(a);assert.equal(a.form,'squid');
 a.intent.fire=true;w.actor(a,20);assert.equal(w.objects().length,0,'airborne fire cannot set the launcher');assert.ok(a.specialActive);
 a.intent.fire=false;w.actor(a);a.grounded=true;a.intent.fire=true;w.actor(a);
 w.actor(a,12);assert.equal(w.objects().length,0);w.actor(a);assert.equal(w.objects().filter(o=>o.kind==='decoy').length,12);assert.equal(a.specialActive,null);
 const lost=w.make('superChump');lost.intent.fire=true;w.actor(lost);lost.grounded=false;w.actor(lost,13);
 assert.equal(w.objects().some(o=>o.owner===lost),false,'losing real support before placement aborts setup');
});

test('Wave flight/contact clocks remain identical at 30/60/120Hz outer updates',async()=>{
 const w=await world(),rows=[];
 for(const hz of [30,60,120]){
   w.f.G.projectiles.clear();const a=w.make('waveBreaker');w.sub(a);const o=w.objects().find(o=>o.owner===a);
   for(let i=0;i<hz*2;i++)w.tick(1,1/hz);
   rows.push([o.pos.x,o.pos.y,o.pos.z,o.landedAt,o.pulse]);
 }
 for(const row of rows.slice(1))for(let i=0;i<row.length;i++)near(row[i],rows[0][i]);
});

test('Wave detector remains active through57F and applies raw45F status separately from detection',async()=>{
 const w=await world(),a=w.make('waveBreaker');w.sub(a);const o=w.objects().find(o=>o.owner===a);w.land(o);
 w.tick(46);const late=w.f.make();late.team=1;late.pos.copy(o.pos);late.pos.z+=8;
 w.tick();near(late.s3.revealedUntil[a.team]-w.f.G.time,45/60,'late detector contact gets its own status duration');
 w.tick(10);const after=w.f.make();after.team=1;after.pos.copy(late.pos);w.tick();
 assert.equal(after.s3?.revealedUntil?.[a.team],undefined,'57F detector retirement is independent of its45F status');
});

test('Real Actor jump clears a ground wave while a grounded control receives45 damage',async()=>{
 const w=await world(),a=w.make('waveBreaker');w.sub(a);const o=w.objects().find(o=>o.owner===a);w.land(o);
 const jump=w.f.make(),standing=w.f.make();for(const v of [jump,standing]){v.team=1;v.pos.copy(o.pos);v.pos.y=0;v.pos.z+=2;}
 delete jump._integrate;
 jump._resolve=()=>{jump.grounded=jump.pos.y<=0;if(jump.grounded){jump.pos.y=0;jump.vel.y=0;}};
 jump.intent.jump=true;const jumps=[];w.f.on('actor:jump',e=>{if(e.actor===jump)jumps.push(e);});
 const hits=[];w.f.G.projectiles.applyHit=(_a,v,d,id)=>{if(id==='waveBreaker'&&d===45)hits.push(v);return false;};
 w.tick(96);for(let i=0;i<30;i++){w.f.G.time+=1/60;jump.update(1/60);w.f.G.projectiles.update(1/60);}
 assert.equal(jumps.length,1,'native Actor admitted a real jump');assert.ok(hits.includes(standing));assert.equal(hits.includes(jump),false);
});

test('A flying Screen generator is absorbed once with its400HP source tag; a ghost never credits intake',async()=>{
 const w=await world(),vac=w.make('inkVac');vac.team=1;vac.pos.z=5;vac.aimYaw=Math.PI;vac.aimDir.set(0,0,-1);vac.aimPoint.set(0,1,-10);vac.intent.fire=true;
 for(let i=0;i<90;i++){w.f.G.time+=1/60;vac.update(1/60);}
 const state=w.f.inkVacState(vac);assert.equal(state.phase,'inhale');
 const wave=w.make('waveBreaker');w.sub(wave);const generator=w.objects().find(o=>o.owner===wave);w.tick();assert.equal(generator.dead,true);
 near(state.absorbedDamage||0,0,'unknown generator absorption credit is not invented');
 const owner=w.make('splattercolorScreen');w.sub(owner);const o=w.objects().find(o=>o.owner===owner);assert.equal(o.phase,'flight');
 const birth=w.events.find(e=>e.actor===owner&&e.action==='deploy');w.tick();assert.equal(o.dead,true);near(state.absorbedDamage,400);
 assert.equal(w.events.some(e=>e.actor===owner&&e.action==='land'),false);
 const ghost=w.f.make();ghost.remote=true;ghost.team=0;assert.equal(w.f.replaySpecial(w.f,{...birth,actor:ghost}),true);
 const copy=w.objects().find(o=>o.owner===ghost);w.tick();assert.equal(copy.dead,true);near(state.absorbedDamage,400);
});

test('Screen opening/running ink uses twelve sourced positions/radius per45F cycle and never paints a nonexistent floor',async()=>{
 const w=await world(),a=w.make('splattercolorScreen');w.sub(a);const o=w.objects().find(o=>o.owner===a);o.moveSpeed=0;
 const ink=[];w.f.G.paint.splat=(point,radius,team,options)=>{ink.push({point:point.clone(),radius,team,owner:options.claimOwner});return 0;};
 w.land(o);assert.ok(ink.length>0,'opening immediately paints');w.tick(59);assert.equal(ink.length,12);
 assert.ok(ink.every(p=>p.radius===2.5&&p.team===a.team&&p.owner===a));
 assert.deepEqual(ink.map(p=>Math.round(p.point.x-o.pos.x)),[-5,7,-3,1,11,3,9,-9,-1,-7,5,-11]);
 w.tick(10);assert.equal(ink.length,24,'first running cycle');w.tick(35);assert.equal(ink.length,24);w.tick(10);assert.equal(ink.length,36,'45F running cadence');
 w.f.G.level.groundHeight=()=>-Infinity;w.tick(45);assert.equal(ink.length,36,'unsupported ink drops do not paint a phantom ground plane');
});

test('Triple paint follows its own2F radius.5->7 clock and bounded +7.5/-6 floor reach',async()=>{
 const w=await world(),a=w.make('tripleInkstrike');w.sub(a);const o=w.objects().find(o=>o.owner===a);w.land(o);
 const ink=[];w.f.G.paint.splat=(point,radius)=>{ink.push({point:point.clone(),radius});return 0;};
 w.tick(81);assert.equal(ink.length,0);w.tick();assert.equal(o.paintPulse,1);assert.equal(ink.length,1);near(ink[0].radius,.5);
 w.tick();assert.equal(o.paintPulse,1);w.tick();assert.equal(o.paintPulse,2);near(ink.at(-1).radius,.76);
 const before=ink.length;w.f.G.level.groundHeight=()=>o.pos.y-6.1;w.tick(2);assert.equal(ink.length,before,'below lower paint reach');
 w.f.G.level.groundHeight=()=>o.pos.y+7.6;w.tick(2);assert.equal(ink.length,before,'above upper paint reach');
 w.f.G.level.groundHeight=()=>0;w.tick(44);assert.equal(o.paintPulse,26,'0,2,...50:26 independent paint cycles');
 assert.ok(ink.every(p=>Math.hypot(p.point.x-o.pos.x,p.point.z-o.pos.z)+p.radius<=7.011),'paint never borrows the7.7 damage radius');
});

test('Chump preview and real setup use each landing surface and keep all twelve targets inside valid terrain',async()=>{
 const w=await world();w.f.G.level.groundHeight=(x)=>x>5?-Infinity:x>0?3:0;
 const a=w.make('superChump'),preview=w.f.superChumpLandingPreview(w.f,a);assert.equal(preview.positions.length,12);
 a.intent.fire=true;w.actor(a,14);const decoys=w.objects().filter(o=>o.owner===a);assert.equal(decoys.length,12);
 for(let i=0;i<12;i++){
   const p=decoys[i].target;near(p.distanceTo(preview.positions[i]),0);assert.ok(p.x<=5,'a decoy never selects open water');
   near(p.y,p.x>0?3.08:.08);
 }
});

test('Screen first JSON birth owns throw direction even when the receiving actor faces another yaw',async()=>{
 const w=await world(),a=w.make('splattercolorScreen');a.aimYaw=.3;a.aimDir.set(Math.sin(.3),0,Math.cos(.3));w.sub(a);
 const o=w.objects().find(o=>o.owner===a),ghost=w.f.make();ghost.remote=true;ghost.aimYaw=Math.PI/2;
 const packet=w.events.find(e=>e.actor===a&&e.action==='deploy'),wire=JSON.parse(JSON.stringify({...packet,actor:null}));
 assert.ok(Array.isArray(wire.target),'initial birth already carries sheet orientation');assert.equal(w.f.replaySpecial(w.f,{...wire,actor:ghost}),true);
 const copy=w.objects().find(o=>o.owner===ghost);assert.ok(copy.normal.dot(o.normal)>.9999);assert.ok(copy.direction.dot(o.direction)>.9999);
 near(copy.vel.x,o.vel.x);near(copy.vel.z,o.vel.z);
});
