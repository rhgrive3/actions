import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
async function setup({negative=false,weapon='charger'}={}) {
  const f = await fixture({productionComposition:true, realProjectiles:true,
    extraExports:`export { hudFrameSnapshot } from './patches/local-quality/hud-snapshots.mjs';
      export { installStormPower } from './patches/splatoon3/runtime/storm-power.mjs';
      export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
      export { HUD } from './inkwave-public/src/ui/hud.js';`,
    adaptRuntime(rel,code) {
      if (!negative || rel !== 'patches/local-quality/hud-snapshots.mjs') return code;
      const before = '  const stormGauge = stormGaugeFraction(a);\n  frame.special = stormGauge ?? a.specialFrac(); frame.specialReady = a.specialReady(); frame.specialActive = stormGauge !== null || !!a.specialActive;';
      assert.ok(code.includes(before), 'same-composition negative control finds only the new HUD projection');
      return code.replace(before, '  frame.special = a.specialFrac(); frame.specialReady = a.specialReady(); frame.specialActive = !!a.specialActive;');
    }});
  f.installStormPower(f);
  const a=f.make(weapon); a.isLocal=true; a.nid=1; a.remote=false;
  a._resolve=()=>{a.grounded=true;}; a.special=a.specialCost();
  const game={settings:{},minimap:{canvas:{}},_lowInkFlash:0}, match={time:180,teamSummary:()=>[]};
  const node=()=>({classes:new Set(),attrs:{},classList:{toggle(k,on){on?this.owner.classes.add(k):this.owner.classes.delete(k);}},setAttribute(k,v){this.attrs[k]=v;},animate(){}});
  const makeNode=()=>{const n=node();n.classList.owner=n;return n;};
  const hud=Object.assign(Object.create(f.HUD.prototype),{_L:{},sp:makeNode(),spSegments:Array.from({length:23},makeNode),flashes:[],_restart(_el,k){this.flashes.push(k);}});
  const frame=()=>{const v=f.hudFrameSnapshot(game,match,a,a.weapon,0,[],[],null,false,f.PLAYER,f.SUB);hud._updSpecial(v,1/60);return {...v};};
  const launch=()=>{a.intent.sub=true;f.tick(a);a.intent.sub=false;f.tick(a);assert.equal(f.G.projectiles.bombs.length,1);};
  return {...f,a,game,hud,frame,launch};
}

test('#469 negative control retains zero HUD gauge while the real actor lock remains live',async()=>{
  const f=await setup({negative:true});f.a._startSpecial();assert.equal(f.frame().special,0);
  f.launch();f.tick(f.a,240);close(f.a.stormGaugeLock,4);
  const view=f.frame();assert.equal(view.special,0);assert.equal(view.specialActive,false);assert.equal(f.hud._L.spSegments,0);
});

test('#469 real holding/throw/expiry drive HUD and mobile without changing spendable charge',async()=>{
  const f=await setup();assert.equal(f.frame().specialReady,true);
  f.a._startSpecial();let view=f.frame();assert.equal(view.special,1);assert.equal(view.specialReady,false);assert.equal(view.specialActive,true);
  assert.equal(f.a.special,0);assert.equal(f.a.specialFrac(),0);assert.equal(f.hud._L.spSegments,23);
  f.tick(f.a,60);assert.equal(f.frame().special,1);f.launch();close(f.a.stormGaugeDuration,8);
  let previous=1;
  for(let tick=1;tick<=480;tick++){
    f.tick(f.a);view=f.frame();assert.ok(view.special<=previous+1e-12);previous=view.special;
    assert.equal(f.game._hudTransport.mobile.special,view.special);
    assert.equal(f.game._hudTransport.mobile.activeSp,view.specialActive);
    assert.equal(view.specialReady,false);assert.equal(f.a.special,0);
    if(tick===240){close(view.special,.5);assert.equal(view.specialActive,true);assert.equal(f.a.specialActive,null);assert.equal(f.hud._L.spSegments,11);}
    if(tick<480){assert.equal(view.specialActive,true);f.a.addTurf(1);assert.equal(f.a.special,0);}
  }
  assert.equal(view.special,0);assert.equal(view.specialActive,false);assert.equal(f.hud._L.spSegments,0);
  f.a.addTurf(10);close(f.frame().special,10/f.a.specialCost());
  assert.equal(f.hud.flashes.filter(x=>x==='is-flare').length,1,'only the initial ready charge flares');
});

test('#469 death/reset preserve both used-gauge progress and the actual extended lock denominator',async()=>{
  const f=await setup();f.a.s3.modifiers.stormDuration=10;f.a._startSpecial();f.launch();
  close(f.a.stormGaugeLock,10);close(f.a.stormGaugeDuration,10);assert.equal(f.frame().special,1);
  f.tick(f.a,120);close(f.frame().special,.8);f.a.splat(null,'water');f.tick(f.a,60);
  close(f.frame().special,.7);assert.equal(f.a.special,0);
  f.a.reset();assert.equal(f.a.s3.stormPowerSnapshot,undefined);
  close(f.frame().special,.7);close(f.a.stormGaugeDuration,10);f.a.addTurf(5);assert.equal(f.a.special,0);
  f.tick(f.a,420);assert.equal(f.frame().specialActive,false);assert.equal(f.frame().special,0);
});

test('#469 native packets retain zero spent charge; remote and other-special HUD paths are unchanged',async()=>{
  const f=await setup();f.a._startSpecial();f.launch();f.tick(f.a,240);close(f.frame().special,.5);
  let packet;const sender={byNid:new Map([[1,f.a]]),out:[],stats:{out:0},s:{tr:{broadcast:m=>{packet=m;}}}};
  f.NetMatch.prototype._sendTick.call(sender);
  assert.equal(packet.a[0][13],0,'native special scalar remains spendable charge, not the displayed drain');
  f.a.remote=true;assert.equal(f.frame().special,0);assert.equal(f.frame().specialActive,false);
  const other=await setup({weapon:'dualies'});other.a.special=other.a.specialCost()/2;
  close(other.frame().special,.5);assert.equal(other.frame().specialActive,false);
  other.a.special=other.a.specialCost();other.a._startSpecial();
  assert.equal(other.a.specialActive.id,'slam');assert.equal(other.frame().special,other.a.specialFrac());assert.equal(other.frame().specialActive,true);
  other.tick(other.a,15);assert.equal(other.frame().special,other.a.specialFrac());
});

test('#469 equal fixed Storm lock ticks give equal display at 30/60/120 Hz',async()=>{
  const results=[];
  for(const hz of [30,60,120]){const f=await setup();f.a._startSpecial();f.launch();const clock=new f.FixedClock(),rows=[];
    for(let render=0;render<hz*8;render++)clock.advance(1/hz,()=>{f.tick(f.a);const view=f.frame();rows.push([view.special,view.specialActive,f.a.special,f.hud._L.spSegments]);});
    results.push(rows);
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);assert.equal(results[0].length,480);
});
