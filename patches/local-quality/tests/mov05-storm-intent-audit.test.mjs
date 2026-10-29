import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const optimized = `    const stormHolding = isStormHolding(this);
    let intent = this.intent;
    if (stormHolding) {
      const si = this._stormIntent || (this._stormIntent = { move: intent.move, squid: false, jump: false, jumpPressed: undefined, fire: false, sub: false, special: false });
      si.move = intent.move; si.squid = intent.squid; si.jump = intent.jump; si.jumpPressed = intent.jumpPressed;
      si.fire = false; si.sub = false; si.special = false;
      if (intent.jumpPressed !== undefined) intent.jumpPressed = false;
      intent = si;
    }`;
const fresh = `    const stormHolding = isStormHolding(this);
    const intent = stormHolding ? { ...this.intent, fire: false, sub: false, special: false } : this.intent;`;
async function world(useFresh) {
  const f = await fixture({ fullRuntime:true, adaptNative(rel, source) {
    const out = adaptBuildSource(rel, source);
    if (!useFresh || rel !== 'src/game/actor.js') return out;
    assert.equal(out.split(optimized).length, 2);
    return out.replace(optimized, fresh);
  }});
  const a=f.make(), b=f.make();
  for(const actor of [a,b]) {
    actor.weapon={...actor.weapon, special:'storm'};
    actor.specialActive={id:'storm',t:0,phase:'hold',subWasDown:false,subArmed:false};
    actor._resolve=()=>{};
  }
  return {f,a,b};
}
async function run(useFresh, nested) {
  const {f,a,b}=await world(useFresh);const jumps=[];
  f.on('actor:jump', event=>{
    if(event.actor !== a) return;
    jumps.push('a');
    if(nested && jumps.length===1){
      a.intent.squid=false; a.intent.jump=false; a.intent.jumpPressed=false;
      b.intent.squid=true; b.intent.jump=false; b.update(1/60);
      a.update(1/60);
    }
  });
  a.intent.squid=true;a.intent.jump=true;a.intent.jumpPressed=true;
  a.update(1/60);
  return {jumps, aForm:a.form,bForm:b.form, aBuffer:a.jumpBuffer,bBuffer:b.jumpBuffer,
    aPrev:[a._prevIntent.squid,a._prevIntent.jump], bPrev:[b._prevIntent.squid,b._prevIntent.jump]};
}
test('MOV-05 actual actor state across a synchronous nested jump and second actor',async()=>{
  const base=await run(true,true), opt=await run(false,true);
  assert.deepEqual(opt,base);assert.deepEqual(base.jumps,['a']);
});
test('MOV-05 actual actor state under ordinary one-tick sampled jump',async()=>{
  const base=await run(true,false), opt=await run(false,false);
  assert.deepEqual(opt,base);assert.deepEqual(base.jumps,['a']);
});

async function queued(useFresh, drop) {
  const {f,a}=await world(useFresh); let seen=0;
  f.on('actor:jump', e=>{if(e.actor===a){seen++;a.intent.jumpPressed=true;}});
  a.intent.jump=true;a.intent.jumpPressed=true;a.update(1/60);
  assert.equal(seen,1);assert.equal(a.intent.jumpPressed,true,'listener queues a new edge after consumption');
  if(drop) a.intent.jumpPressed=false; // controller cancels the queued edge before next actor step
  a.update(1/60);
  return { seen, buffer:a.jumpBuffer, jumpSerial:a.s3JumpSerial };
}
test('MOV-05 preserves subsequently queued and canceled jump edges',async()=>{
  for(const drop of [false,true]) {
    const base=await queued(true,drop),opt=await queued(false,drop);
    assert.deepEqual(opt,base);
    if(drop) assert.equal(opt.buffer,0); else assert.ok(opt.buffer>0);
  }
});

async function release(useFresh){
  const {f,a,b}=await world(useFresh); const calls=[];
  f.G.projectiles.throwStorm=actor=>calls.push(actor===a?'a':'other');
  a.specialActive.subWasDown=true; a.specialActive.subArmed=true;
  a.intent.sub=false;a.intent.fire=true;a.intent.special=true;a.intent.jumpPressed=true;
  a.update(1/60);b.update(1/60);
  return {calls, phase:a.specialActive?.phase, aForm:a.form,bForm:b.form, prev:[a._prevIntent.fire,a._prevIntent.sub,a._prevIntent.special]};
}
test('MOV-05 keeps Storm release and separate actor early-return ownership',async()=>{
  const base=await release(true),opt=await release(false);
  assert.deepEqual(opt,base);assert.deepEqual(base.calls,['a']);assert.equal(base.phase,'throw');assert.deepEqual(base.prev,[false,false,false]);
});
