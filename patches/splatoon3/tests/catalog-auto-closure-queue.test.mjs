import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../runtime/main-weapon-catalog.mjs',import.meta.url),'utf8'),baseline=fs.readFileSync(new URL('./fixtures/catalog-auto-before-closure-031426fc.mjs.txt',import.meta.url),'utf8');
const current=source.slice(source.indexOf('  function fireAutoShot('),source.indexOf('  function charge(',source.indexOf('  function fireAutoShot(')));
test('actual auto-shot helper preserves synchronous and pending captured actor/params, callback mutation and throws',()=>{
 for(let i=0;i<3000;i++){
  function run(code){const events=[],a={grounded:!!(i&2)},runner={a,cooldown:i%7===0?.2:0},r={family:['shooter','dualies','blaster'][i%3],sourceActor:i%5===0?'WeaponShooterFlash':i%7===0?'WeaponBlasterPrecision':'normal',parameters:{}},s={burst:i%4===0?2:0,burstWait:i%11===0?.1:0,pressed:!!(i&4),frame:i%20};
   const param={};let factor=1;for(const [key,value]of Object.entries({VariableShotRepeatStartFrame:10,InkConsume:.02,RepeatFrame:4,TripleShotSpanFrame:i%2?8:null,PostDelayFrame:2,PreDelayFrame_HumanShot:10}))Object.defineProperty(param,key,{get(){events.push(['get',key]);return value==null?value:value*factor;}});
   const bindings={finite:(x,d)=>Number.isFinite(x)?x:d,HZ:60,EPS:1e-9,weaponParam:()=>param,inkMod:actor=>{events.push(['mod',actor===a]);return 1;},catalogDualiesTurret:state=>!!(i&8),pay:(rr,n)=>{events.push(['pay',rr===runner,n]);if(i%29===0)throw Error('pay');return i%13!==0;},emitSingle:(rr,rec,key)=>{events.push(['emit',rr===runner,rec===r,key]);if(i%31===0)throw Error('emit');factor=2;},beginPending:(state,frames,fire)=>{events.push(['pending',frames]);state.pending={fire};}};
   const fn=new Function(...Object.keys(bindings),code+';return auto;')(...Object.values(bindings));let error;
   try{fn(runner,r,{fire:!!(i&1),firePressed:!!(i&2)},s,1/[30,60,120][i%3]);if(s.pending){runner.a={grounded:!a.grounded};factor=3;s.pending.fire();}}catch(e){error=e.message;}
   return {events,error,state:{...s,pending:!!s.pending},cooldown:runner.cooldown,firingT:runner.firingT};}
  assert.deepEqual(run(current),run(baseline),`case${i}`);
 }
});
