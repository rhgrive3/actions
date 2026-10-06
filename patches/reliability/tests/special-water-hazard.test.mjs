import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
const DT=1/60;
async function rig({id='storm',ground=-Infinity,y=-1.44,vy=-2,network=false}={}){
 const f=await fixture({network}),a=f.make();a.weapon={...a.weapon,special:id};a.pos.set(0,y,0);a.vel.set(0,vy,0);a.grounded=false;a.invuln=0;a.special=a.specialCost();
 a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};a._resolve=()=>{};
 f.G.level.groundHeight=()=>ground;f.G.actors=[a];let throws=0;Object.assign(f.G.projectiles,{throwStorm(){throws++;},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});
 const deaths=[];f.on('splatted',e=>deaths.push(e));let finish=0;a._finishFrame=()=>{finish++;};
 return {...f,a,deaths,throws:()=>throws,finish:()=>finish,step(){f.G.time+=DT;a.update(DT);}};
}
function throwStorm(h){
 const pos=h.a.pos.clone(),vel=h.a.vel.clone(),grounded=h.a.grounded;
 h.a.pos.y=10;h.a.vel.set(0,0,0);h.a.grounded=true;h.a._startSpecial();assert.equal(h.a.specialActive.phase,'hold');
 h.a.intent.sub=true;h.step();h.a.intent.sub=false;h.step();assert.equal(h.a.specialActive.phase,'throw');
 h.a.pos.copy(pos);h.a.vel.copy(vel);h.a.grounded=grounded;
}

test('#592 Storm movement crossing water dies that fixed tick exactly once',async()=>{
 const h=await rig();throwStorm(h);const finished=h.finish();h.step();assert.ok(h.a.pos.y<h.PLAYER.fallDeathY);assert.equal(h.a.alive,false);assert.equal(h.a.specialActive,null);assert.equal(h.deaths.length,1);assert.equal(h.deaths[0].cause,'water');assert.equal(h.throws(),1);assert.equal(h.finish(),finished);for(let i=0;i<5;i++)h.step();assert.equal(h.deaths.length,1);
});
test('#592 activation while already below water cannot publish another alive tick',async()=>{
 const h=await rig({y:-2});h.a.intent.special=true;h.step();assert.equal(h.a.alive,false);assert.equal(h.deaths.length,1);assert.equal(h.throws(),0,'held device dies before a throw');
});
test('#592 dry trenches below sea level remain safe through the Storm lock',async()=>{
 const h=await rig({ground:-5,y:-2});throwStorm(h);for(let i=0;i<25;i++)h.step();assert.equal(h.a.alive,true);assert.equal(h.deaths.length,0);assert.equal(h.throws(),1);assert.equal(h.a.specialActive,null);
});
test('#592 ordinary and special water splats preserve existing attacker attribution',async()=>{
 for(const special of [false,true])for(const recent of [false,true]){const h=await rig({y:-2}),attacker=h.make();attacker.team=1;h.a.lastAttacker=attacker;h.a.lastDamage=recent?1:5;h.a.lastAttackerHitAge=recent?1:5;if(special)h.a._startSpecial();h.step();assert.equal(h.deaths.length,1);assert.equal(h.deaths[0].attacker,recent?attacker:null);assert.equal(h.deaths[0].cause,'water');}
});
test('#592 Slam falling movement shares the same lethal open-water condition',async()=>{
 const h=await rig({id:'slam'});h.a._startSpecial();h.a.specialActive.phase='fall';h.a.vel.y=-2;h.step();assert.equal(h.a.alive,false);assert.equal(h.deaths.length,1);assert.equal(h.deaths[0].cause,'water');
});
test('#592 fixed water-death tick is invariant at 30/60/120/144Hz rendering',async()=>{
 let expected;for(const hz of [30,60,120,144]){const h=await rig({y:-1,vy:-1}),clock=new h.FixedClock(),rows=[];throwStorm(h);for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{if(h.a.alive){h.step();rows.push([h.a.pos.y,h.a.alive,h.deaths.length]);}});assert.equal(h.deaths.length,1);if(expected)assert.deepEqual(rows,expected);else expected=rows;}
});
test('#592 water-free Storm trajectory and expiry match the existing special owner',async()=>{
 const histories=[];for(const control of [false,true]){const h=await rig({ground:0,y:4,vy:0}),rows=[];if(control)h.a._checkWaterHazard=()=>false;throwStorm(h);let ticks=0;while(h.a.specialActive&&ticks++<60){h.step();rows.push([...h.a.pos.toArray(),...h.a.vel.toArray(),h.a.specialActive?.phase??null,h.a.alive,h.throws()]);}histories.push(rows);}assert.deepEqual(histories[0],histories[1]);
});
test('#592 native owner packet and remote application publish the water death',async()=>{
 const h=await rig({network:true}),g=await rig({network:true}),wire=[];
 const session=id=>({myId:id,hostId:'A',isHost:false,_members:new Map([['A','A'],['B','B']]),tr:{broadcast:data=>wire.push(JSON.parse(JSON.stringify(data)))}});
 h.a.nid=g.a.nid=7;h.a.owner=g.a.owner='A';h.a.isLocal=true;
 const owner=new h.NetMatch(session('A'),{map:'tidewater'}),remote=new g.NetMatch(session('B'),{map:'tidewater'});
 try{owner.bind({actors:[h.a],state:'playing',time:180});remote.bind({actors:[g.a],state:'playing',time:180});throwStorm(h);h.step();owner._sendTick();const packet=wire.at(-1);assert.equal(packet.a[0][10]&1,0);assert.equal(packet.a[0][11],0);
 remote.onMessage('A',packet);remote.peers.get('A').tr=packet.ts;remote._playEvents();remote._sample(g.a,packet.ts,DT);remote.applyRemote(g.a,DT);assert.equal(g.a.alive,false);assert.equal(g.a.hp,0);
 }finally{owner.dispose();remote.dispose();}
});
