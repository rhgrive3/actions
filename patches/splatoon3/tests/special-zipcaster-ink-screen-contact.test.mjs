import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// PvP 11.3.0, no gear unless selected below. Production Actor/runner/projectile
// composition with controlled scene/terrain sinks; not a retail measurement.
const EXTRA="export {replaySpecial} from './patches/splatoon3/runtime/all-specials.mjs';";
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  return f;
}
function equip(f,id){
  const a=f.make('shooter');a.weapon={...a.weapon,special:id,specialCost:100};
  a.special=100;a.alive=true;a._resolve=()=>{};a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
  a._startSpecial();return a;
}
function advance(f,dt){f.G.time+=dt;f.G.projectiles.update(dt);}
function deployScreen(f){
  const owner=equip(f,'splattercolorScreen');owner.intent.sub=true;owner._updateSpecial(1/60);
  owner.intent.sub=false;
  for(let i=0;i<15&&owner.specialActive;i++)owner._updateSpecial(1/60);
  const screen=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='screen');
  assert.ok(screen);for(let i=0;i<600&&screen.phase==='flight';i++)advance(f,1/60);
  assert.equal(screen.phase,'active');return {owner,screen};
}

test('Zipcaster native main spends 67% of equipped ink cost with and without Ink Saver (Main)',async()=>{
  const f=await world();
  for(const saver of [false,true]){
    const a=equip(f,'zipcaster');
    if(saver){a.s3.loadout[0].main='inkSaverMain';a.s3RefreshGear();}
    const state=a._s3AllSpecialState,weapon=a.weapon,shared=f.WEAPONS[a.weaponId].inkPerShot;
    const normalInk=a.ink,cost=weapon.inkPerShot;
    const initial=state.inkFuel;
    a.intent.fire=true;
    let fired=false;
    for(let i=0;i<30;i++){
      const fuel=state.inkFuel,count=f.G.projectiles.list.length;
      a._updateSpecial(1/60);
      if(f.G.projectiles.list.length>count){
        const debit=fuel-state.inkFuel-state.inkDrainPerSecond/60;
        assert.ok(Math.abs(debit-cost*.67)<1e-8,`main cost ${debit}, expected ${cost*.67}`);
        fired=true;break;
      }
    }
    assert.ok(fired,'real native main projectile emitted');assert.ok(state.inkFuel<initial);
    assert.equal(a.ink,normalInk,'normal reserve is restored after every runner call');
    assert.equal(a.weapon,weapon,'equipped definition identity is retained');
    assert.equal(f.WEAPONS[a.weaponId].inkPerShot,shared,'shared definition is unchanged');
  }
});

test('Zipcaster reduced cost governs native low-ink admission as well as debit',async()=>{
  const f=await world();
  for(const [enough,offset] of [[true,1e-8],[false,-1e-8]]){
    const a=equip(f,'zipcaster'),state=a._s3AllSpecialState,cost=a.weapon.inkPerShot;
    // Isolate a shot's threshold from the independently tested automatic drain.
    state.inkDrainPerSecond=0;state.inkFuel=cost*.67+offset;a.intent.fire=true;
    const before=f.G.projectiles.list.length;
    for(let i=0;i<20;i++)if(a.specialActive)a._updateSpecial(1/60);
    assert.equal(f.G.projectiles.list.length>before,enough);
    if(enough)assert.ok(state.inkFuel>=0&&state.inkFuel<1e-7);
    else assert.ok(Math.abs(state.inkFuel-(cost*.67+offset))<1e-9);
  }
});

test('Screen stationary capsule contact repeats once per 60 source frames at 30/60/120Hz',async()=>{
  const f=await world();
  for(const hz of [30,60,120]){
    f.G.projectiles.clear();f.G.actors=[];f.G.time=0;
    const {owner,screen}=deployScreen(f);screen.moveSpeed=0;
    const victim=f.make();victim.team=1;victim.isLocal=true;victim.pos.copy(screen.pos);
    const hits=[],apply=f.G.projectiles.applyHit;
    f.G.projectiles.applyHit=(a,b,damage,id)=>{if(b===victim&&id==='splattercolorScreen')hits.push({damage,age:screen.age});return false;};
    try{
      for(let i=0;i<3*hz;i++)advance(f,1/hz);
      assert.equal(hits.length,3,`${hz}Hz stationary contact`);
      assert.deepEqual(hits.map(h=>Math.round((h.age-screen.landedAt)*60)),[1,61,121]);
      assert.ok(hits.every(h=>h.damage===40));
      assert.ok(victim.s3.splattercolorUntil>f.G.time);assert.ok(victim.s3.splattercolorMarkUntil>f.G.time);
      assert.equal(owner.alive,true);
    }finally{f.G.projectiles.applyHit=apply;}
  }
});

test('Screen catches swept crossings and collider contact, excludes allies and out-of-bounds heights',async()=>{
  const f=await world(),{screen}=deployScreen(f);screen.moveSpeed=0;
  const swept=f.make(),overlap=f.make(),outside=f.make(),above=f.make(),below=f.make(),ally=f.make();
  for(const a of [swept,overlap,outside,above,below])a.team=1;
  swept.pos.copy(screen.pos).addScaledVector(screen.normal,-20);
  overlap.pos.copy(screen.pos).addScaledVector(screen.normal,f.PLAYER.radius+.10);
  outside.pos.copy(screen.pos).addScaledVector(screen.tangent,screen.width/2+f.PLAYER.radius+.1);
  above.pos.copy(screen.pos);above.pos.y+=screen.height+.1;
  below.pos.copy(screen.pos);below.pos.y-=f.PLAYER.height+.1;
  ally.pos.copy(screen.pos);
  const hits=[],apply=f.G.projectiles.applyHit;f.G.projectiles.applyHit=(_a,b,_d,id)=>{if(id==='splattercolorScreen')hits.push(b);return false;};
  try{
    for(let i=0;i<59;i++)advance(f,1/60);
    assert.deepEqual(hits,[overlap],'startup sheet already has a contact hitbox');
    swept.pos.copy(screen.pos).addScaledVector(screen.normal,20);advance(f,1/60);
    assert.deepEqual(hits,[overlap,swept]);
  }finally{f.G.projectiles.applyHit=apply;}
});

test('Remote Screen contact changes recipient status without authoring damage',async()=>{
  const f=await world(),ghost=f.make(),victim=f.make();ghost.remote=true;ghost.team=1;victim.team=0;victim.isLocal=true;
  assert.equal(f.replaySpecial(f,{actor:ghost,id:'splattercolorScreen',activation:1,action:'deploy',pos:[0,0,0],target:[0,0,1],seed:9,object:1,index:0,hp:0,radius:15,duration:680/60,kind:'screen',width:15,height:9}),true);
  const screen=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='screen');screen.moveSpeed=0;victim.pos.copy(screen.pos);
  let hits=0;f.G.projectiles.applyHit=()=>{hits++;};
  for(let i=0;i<60;i++)advance(f,1/60);
  assert.equal(hits,0);assert.ok(victim.s3.splattercolorUntil>f.G.time);
});
