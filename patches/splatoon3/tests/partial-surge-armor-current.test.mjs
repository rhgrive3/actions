import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const legacy=(rel,s)=>rel.endsWith('runtime/movement.mjs')?s.replace('surge.armorPending = surge.charge > 0','surge.armorPending = surge.charge >= 1'):s;
async function world(old=false){const f=await fixture(old?{adaptRuntime:legacy}:{});return f;}
function charge(f,ticks){const a=f.make();a.form='squid';a.intent.squid=true;a.intent.jump=true;a.climbing=true;a.grounded=false;a._updateClimb=()=>{};f.tick(a,ticks);a.intent.jump=false;f.tick(a);a._ledgePop(new f.THREE.Vector3(0,0,-1));return a;}
test('#473 original current-runtime negative rejects partial armor but admits full charge',async()=>{
 const f=await world(true);for(const n of [1,15,30,44]){const a=charge(f,n);assert.equal(a.s3.actions.armor,null);const hp=a.hp;a.damage(50,null,'shooter');near(hp-a.hp,50);}
 const full=charge(f,45);assert.ok(full.s3.actions.armor.armorTime>0);
});
test('#473 partial and full releases share the current armor owner without changing charge motion',async()=>{
 const f=await world(),c=f.profile.movement.surge;
 for(const n of [1,15,30,44,45]){const a=charge(f,n),shield=a.s3.actions.armor;assert.ok(shield);near(shield.armorTime,c.armorTime);near(shield.armorHP,c.armorHP);near(shield.speed,c.minimumVelocity+(c.velocity-c.minimumVelocity)*Math.min(1,n/45));const hp=a.hp;a.damage(50,null,'shooter');near(a.hp,hp);near(shield.armorHP,Math.max(0,c.armorHP-50));}
});
test('#473 post-burst armor keeps the later independent timer and expires once at the configured boundary',async()=>{
 const f=await world(),c=f.profile.movement.surge,a=charge(f,1),shield=a.s3.actions.armor;
 assert.ok(!a.s3.surge || a.s3.surge.time <= 1e-10,'short movement boost already ended');assert.ok(shield.time <= 1e-10,'armor does not extend the boost timer');
 f.tick(a,Math.round(c.armorTime*60)-1);near(shield.armorTime,1/60);const hp=a.hp;a.damage(25,null,'shooter');near(a.hp,hp);
 f.tick(a);near(shield.armorTime,0);a.damage(25,null,'shooter');near(a.hp,hp-25);
});
test('#473 canceled/unadmitted charge never creates armor; current life/form/action cancellation stays authoritative',async()=>{
 const f=await world();for(const kind of ['no-input','detach']){const a=f.make();a.form='squid';a.intent.squid=true;a.climbing=true;a.grounded=false;a._updateClimb=()=>{};if(kind==='detach'){a.intent.jump=true;f.tick(a,10);a.climbing=false;}a.intent.jump=false;f.tick(a);assert.equal(a.s3.actions.armor,null);}
 for(const kind of ['kid','death','reset','special','superjump']){const a=charge(f,15);if(kind==='kid'){a.form='kid';a.intent.squid=false;f.tick(a);}if(kind==='death')a.splat(null,'shooter');if(kind==='reset')a.reset();if(kind==='special'){a._startSpecial();}if(kind==='superjump'){a._resolve=()=>{};a.superJump(new f.THREE.Vector3(0,0,10));}assert.equal(a.s3.actions?.armor??null,null,kind);}
});
for(const hz of [30,60,120])test(`#473 ${hz}Hz render schedule keeps one configured armor countdown`,async()=>{
 const f=await world(),a=charge(f,15),shield=a.s3.actions.armor,clock=new FixedClock();let ticks=0;
 for(let n=0;n<hz/2;n++)clock.advance(1/hz,dt=>{ticks++;f.G.time+=dt;a.update(dt);});
 assert.equal(ticks,30);near(shield.armorTime,f.profile.movement.surge.armorTime-.5);
});
