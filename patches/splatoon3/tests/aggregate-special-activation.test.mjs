import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ids=['trizooka','bubbler','zipcaster','tentaMissiles','inkjet','storm','booyahBomb','ultraStamp','killerWail','inkVac','crabTank','reefslider','tripleInkstrike','tacticooler','superChump','krakenRoyale','splattercolorScreen','waveBreaker','tripleSplashdown'];
const specialCases=new Set(['trizooka','bubbler','storm','inkVac','tacticooler','tripleSplashdown']);
const exportsText="export {bigBubblerSnapshot} from './patches/splatoon3/runtime/kit-big-bubbler.mjs'; export {inkVacState} from './patches/splatoon3/runtime/kit-ink-vac.mjs';";
function setup(f,id){const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.alive=true;Object.assign(a.intent,{fire:false,sub:false,jump:false});a._prevIntent ||= {};Object.assign(a._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});a._resolve=()=>{};return a;}
function evidence(f,a,id,beforeDomes){
 if(id==='bubbler'){const rows=f.bigBubblerSnapshot().filter(d=>!beforeDomes.has(d.serial));assert.equal(rows.length,1,'one newly deployed native dome');assert.equal(rows[0].team,a.team);assert.ok(rows[0].hp>0&&rows[0].fieldHp>0);return rows[0].t;}
 assert.equal(a.specialActive?.id,id,'actual type-specific active token');
 if(!specialCases.has(id)){const s=a._s3AllSpecialState;assert.equal(s?.id,id);assert.strictEqual(s.controlToken,a.specialActive);assert.ok(s.serial>0);return s.t;}
 if(id==='trizooka'){assert.equal(a.s3Trizooka?.active,true);return a.specialActive.t;}
 if(id==='inkVac'){const s=f.inkVacState(a);assert.strictEqual(s?.actor,a);assert.equal(s?.phase,'inhale');assert.ok(s.serial>0);return s.activationAge;}
 if(id==='storm'){assert.equal(a.specialActive.phase,'hold');assert.equal(a.specialActive.subArmed,false);assert.equal(a.specialActive.subWasDown,false);assert.equal(f.G.projectiles.bombs.filter(b=>b.kind==='storm'&&b.owner===a).length,0);return a.specialActive.t;}
 if(id==='tacticooler'){assert.equal(a.specialActive.phase,'hold');return a.specialActive.t;}
 if(id==='tripleSplashdown'){assert.equal(a.specialActive.phase,'rise');const fists=(f.G.projectiles._catalogueFists||[]).filter(v=>v.owner===a&&v.activation===a.specialActive.activation&&!v.dead);assert.equal(fists.length,2);return a.specialActive.age;}
 throw new Error('Unhandled '+id);
}
function advance(f,a,id){for(let j=0;j<5;j++){f.G.time+=1/60;if(id==='storm'||id==='inkVac')a.update(1/60);else if(a.specialActive)a._updateSpecial(1/60);f.G.projectiles.update(1/60);}assert.ok([a.pos.x,a.pos.y,a.pos.z,a.ink,a.special].every(Number.isFinite));}
const selected=process.env.INKWAVE_SPECIAL_ACTIVATION_CASE;
const depth=process.env.INKWAVE_SPECIAL_ACTIVATION_DEPTH;
if(selected!==undefined && (!ids.includes(selected)||depth!=='1'))throw new Error('Invalid isolated special activation selection/depth');
if(selected===undefined && depth!==undefined)throw new Error('Invalid isolated special activation recursion marker');
if(selected===undefined){
 for(const id of ids)test(`aggregate positive activation and no-op rejection: ${id}`,()=>{
  const childEnv={...process.env,INKWAVE_SPECIAL_ACTIVATION_CASE:id,INKWAVE_SPECIAL_ACTIVATION_DEPTH:'1'}; delete childEnv.NODE_TEST_CONTEXT;
  const child=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-reporter=tap',fileURLToPath(import.meta.url)],{env:childEnv,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  assert.ifError(child.error);
  assert.equal(child.signal,null,`child ${id} signal; ${child.stderr}`);
  assert.equal(child.status,0,`child ${id} failed; ${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout,/^# tests 1$/m);
  assert.match(child.stdout,/^# pass 1$/m);
  assert.match(child.stdout,/^# fail 0$/m);
  assert.match(child.stdout,/^# skipped 0$/m);
  assert.match(child.stdout,/^# cancelled 0$/m);
  const lines=child.stdout.split('\n').filter(line=>line.startsWith('# {')).map(line=>JSON.parse(line.slice(2)));
  assert.equal(lines.length,1,'exactly one child evidence row');
  const row=lines[0]; assert.equal(row.id,id,'child evidence matches selected id');
  assert.ok(row?.activated===true&&row.noOpRejected===true&&row.weakNoOpAccepted===true,`child ${id} activation evidence missing`);
  assert.ok(Number.isFinite(row.initialClock)&&Number.isFinite(row.afterFiveFrames)&&row.afterFiveFrames>row.initialClock);
  console.log(JSON.stringify(row));
 });
}else{
 const {fixture}=await import('./source-fixture.mjs');
for(const id of ids.filter(id=>id===selected))test(`aggregate positive activation and no-op rejection: ${id}`,async()=>{
 const f=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true,extraExports:exportsText});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};assert.equal(f.SPECIALS[id]?.id,id);
 const n=setup(f,id),nd=new Set(f.bigBubblerSnapshot().map(d=>d.serial)),nb=n.stats.specials;n._startSpecial=()=>{};n._startSpecial();assert.ok(n.stats.specials>=nb);advance(f,n,id);assert.throws(()=>evidence(f,n,id,nd),{name:'AssertionError'},'positive oracle rejects literal no-op; old weak checks pass');
 const a=setup(f,id),before=a.stats.specials,domes=new Set(f.bigBubblerSnapshot().map(d=>d.serial));a._startSpecial();const t0=evidence(f,a,id,domes);assert.equal(a.stats.specials,before+1,'secondary admission count');advance(f,a,id);const t1=evidence(f,a,id,domes);assert.ok(Number.isFinite(t0)&&Number.isFinite(t1)&&t1>t0,'actual native initial-phase clock progressed');console.log(JSON.stringify({id,activated:true,noOpRejected:true,weakNoOpAccepted:true,initialClock:t0,afterFiveFrames:t1}));
});
}
