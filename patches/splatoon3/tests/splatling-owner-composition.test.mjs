import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const dt=1/60;
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(){const f=await fixture();const a=f.make('splatling');a.ink=100;return{f,a,r:a.weaponRunner};}
for(const hz of [30,60,120])for(const squid of [false,true])test(`${hz}Hz ${squid?'squid':'human'} startup and single debit`,async()=>{
const {f,a,r}=await setup();if(squid){a.form='squid';a.intent.squid=true;f.tick(a,10);a.intent.squid=false;}a.intent.fire=true;const c=new FixedClock(),trace=[];
for(let i=0;i<hz*2;i++)c.advance(1/hz,()=>{f.tick(a);trace.push({t:r.chargeT,on:r.charging});});const delay=squid?6:1;for(let i=0;i<delay;i++){near(trace[i].t,0);assert.equal(trace[i].on,false);}near(trace[delay].t,dt);near(trace[delay+47].t,.8);near(trace[delay+71].t,1.2);
a.intent.fire=false;f.tick(a);near(a.ink,77.5);near(r.s3Spin.paid,22.5);assert(r.streaming);
});
for(const how of ['sub','squid','aimingSub','reset'])test(`${how} keeps canonical refund exactly once`,async()=>{
const {f,a,r}=await setup();a.intent.fire=true;f.tick(a,74);a.intent.fire=false;f.tick(a);r._splatling(dt,{fire:false},a.weapon);const expected=100-r.s3Spin.paid/r.s3Spin.shots;
if(how==='squid')a.form='squid';if(how==='aimingSub')r.aimingSub=true;const cancel=()=>how==='reset'?r.reset():r._splatling(dt,{sub:how==='sub'},a.weapon);cancel();near(a.ink,expected);assert.equal(r.s3Spin,null);assert.equal(r.streaming,false);cancel();near(a.ink,expected);
});
test('sub during startup clears admission; reset clears pending state and fresh press waits again',async()=>{const {f,a,r}=await setup();a.intent.fire=true;f.tick(a);r._splatling(dt,{sub:true},a.weapon);near(a.ink,100);assert.equal(r.s3SplatlingHeld,false);r.reset();f.tick(a);near(r.chargeT,0);f.tick(a);near(r.chargeT,dt);});
test('full stream keeps the canonical 40-round schedule without a second debit',async()=>{const {f,a,r}=await setup();a.intent.fire=true;f.tick(a,74);a.intent.fire=false;f.tick(a);for(let i=0;i<160;i++)r._splatling(dt,{fire:false},a.weapon);assert.equal(r.streaming,false);near(a.ink,77.5);assert.equal(f.shots.filter(s=>s.kind==='splatling').length,40);r.reset();near(a.ink,77.5);});
for(const ink of [0,.1,100])for(const squid of [false,true])test(`low-ink ${ink} ${squid?'squid':'human'} admission`,async()=>{const {f,a,r}=await setup();if(squid){a.form='squid';a.intent.squid=true;f.tick(a,10);a.intent.squid=false;}a.ink=ink;a.intent.fire=true;for(let n=0;n<(squid?6:1);n++){f.tick(a);assert.equal(r.chargeT,0);assert.equal(r.charging,false);}f.tick(a);assert(r.chargeT>0);});
test('canonical epsilon admission still waits on the startup frame',async()=>{const {a,r}=await setup();r.cooldown=1e-12;r._splatling(dt,{fire:true},a.weapon);assert.equal(r.chargeT,0);r._splatling(dt,{fire:true},a.weapon);assert(r.chargeT>0);});
