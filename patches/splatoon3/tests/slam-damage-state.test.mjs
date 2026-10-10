import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { finishTidalSlamGauge } from '../runtime/tidal-slam-gauge.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function rig(){
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,extraExports:"export * from './patches/splatoon3/runtime/damage-timing.mjs';"}),a=f.make('roller');
 a.weapon={...a.weapon,special:'slam'};a.special=a.specialCost();a.invuln=0;a.hp=100;a.pos.y=10;
 a._resolve=()=>{};a._startSpecial();return {...f,a,step(){f.G.time+=1/60;a._updateSpecial(1/60);}};
}
test('#573 early ordinary Slam takes full damage and can be splatted',async()=>{
 for(const frame of [0,10,30,49]){const f=await rig();for(let i=0;i<frame;i++)f.step();const a=f.a;a.damage(40,null,'shooter');near(a.hp,60);a.damage(100,null,'shooter');f.flushPendingLethal(a,f.G.time+1/60);assert.equal(a.alive,false);assert.equal(a.specialActive,null);}
});
test('#573 49/50/51F switch from vulnerability to full rejection for weapon and ink damage',async()=>{
 const f=await rig();for(let i=0;i<49;i++)f.step();f.a.damage(10,null,'ink');near(f.a.hp,90);
 for(const frame of [50,51]){f.step();const hp=f.a.hp;f.a.damage(220,null,'shooter');f.a.damage(1,null,'ink');near(f.a.hp,hp);assert.equal(f.a.specialActive.armor,false);}
});
test('#573 landing ends action protection without overwriting an independently owned timer',async()=>{
 const f=await rig();for(let i=0;i<51;i++)f.step();f.a.invuln=.7;
 f.a._resolve=()=>{f.a.grounded=true;};f.step();assert.equal(f.a.specialActive,null);near(f.a.invuln,.7);
 assert.ok(f.a.s3TidalSlamGaugeFinish);f.a.invuln=0;f.a.hardLand=.1;const hp=f.a.hp;f.a.damage(10,null,'shooter');near(f.a.hp,hp);
 f.a.hardLand=0;finishTidalSlamGauge(f.a);assert.equal(f.a.s3TidalSlamGaugeFinish,null);f.a.damage(10,null,'shooter');near(f.a.hp,hp-10);
});
test('#573 fixed simulation protects at the same boundary for 30/60/120Hz rendering',async()=>{
 const rows=[];for(const hz of [30,60,120]){const f=await rig(),clock=new FixedClock(),trace=[];for(let i=0;i<hz;i++)clock.advance(1/hz,()=>{f.step();const hp=f.a.hp;f.a.damage(1,null,'shooter');trace.push(hp-f.a.hp);});rows.push(trace);}
 assert.deepEqual(rows[0],rows[1]);assert.deepEqual(rows[1],rows[2]);assert.equal(rows[0][48],1);assert.equal(rows[0][49],0);
});
test('#573 victim-owned hit admission and outgoing invulnerability flag use the same 50F action boundary',async()=>{
 const f=await rig(),a=f.a,attacker=f.make('shooter');attacker.team=1;a.nid=1;a.owner='me';a.netLife=1;attacker.nid=2;attacker.owner='peer';attacker.remote=true;
 const messages=[],session={myId:'me',hostId:'me',isHost:true,_members:new Map([['me',true],['peer',true]]),tr:{broadcast:d=>messages.push(d),sendTo(){}}};
 const nm=new f.NetMatch(session,{id:'slam-wire',map:'tidewater'});f.G.match={mode:'turf',state:'playing',duration:180,time:100,actors:[a,attacker]};nm.bind(f.G.match);
 for(let i=0;i<49;i++)f.step();nm._sendTick();assert.equal(messages.at(-1).a.find(s=>s[0]===1)[10]&262144,0);
 nm.onMessage('peer',{k:'hit',m:'slam-wire',v:1,a:2,d:10,w:'shooter',l:1,h:1,seq:1});near(a.hp,90);
 f.step();nm._sendTick();assert.ok(messages.at(-1).a.find(s=>s[0]===1)[10]&262144);
 let rejected=0;f.on('hit:rejected',()=>rejected++);nm.onMessage('peer',{k:'hit',m:'slam-wire',v:1,a:2,d:50,w:'shooter',l:1,h:2,seq:2});near(a.hp,90);assert.equal(rejected,1);
 nm.dispose();
});
