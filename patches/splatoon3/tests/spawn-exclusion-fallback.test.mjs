import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';

// Real production-composed Actor/Physics/finish. Character, paint and audio
// are stubs: these assertions concern the gameplay capsule, not rendered mesh.
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {constrainSpawnPosition} from './patches/splatoon3/runtime/spawn-exclusion.mjs';"});
const {G,THREE,Actor,Level,Physics,PLAYER}=f;
const evidence=[];
after(()=>{if(process.env.INKWAVE_SPAWN_FALLBACK_EVIDENCE)fs.writeFileSync(process.env.INKWAVE_SPAWN_FALLBACK_EVIDENCE,
  JSON.stringify({root:process.env.INKWAVE_BUILT_SITE||'production-composed-source',terrainRadius:PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,
    legacyExclusionRadius:PLAYER.radius,cases:evidence},null,2)+'\n');});
const fits=a=>G.physics.bodyFits(a.pos,(a.form==='squid'?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale,a.form==='squid'?PLAYER.squidBodyLift:PLAYER.stepUp,
  a.form==='squid'?PLAYER.squidHeight:PLAYER.height,a.form==='squid');
function setup({team=0,maxX=15.1,top=2.2,barrier=true,start=[15.39,20,0],velocity=[0,0,0]}={}){
  G.actors=[];G.projectiles.clear();G.scene=new THREE.Scene();G.time=0;
  G.level=new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:barrier?4.2:0,half:[],
    single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]},{kind:'box',min:[13,0,-2],max:[maxX,top,2]}]});
  if(team===1)G.level.spawnPads.reverse();
  G.physics=new Physics(G.level);G.paint.sample=()=>team+1;
  G.match={playing:()=>true,canRespawn:()=>false};
  const a=f.make();a.team=team;a.isLocal=true;
  a._integrate=Actor.prototype._integrate;a._finishFrame=Actor.prototype._finishFrame;
  a.character.update=()=>{};
  a.spawnAt(new THREE.Vector3(...start),0);a.grounded=false;a.vel.set(...velocity);a.invuln=0;
  a.intent.move.set(1,0,0);
  assert(fits(a),'setup is capsule-clear');return a;
}
function snapshot(a){return{pos:a.pos.toArray(),vel:a.vel.toArray(),fits:fits(a),legacyFits:G.physics.bodyFits(a.pos,PLAYER.radius,
  a.form==='squid'?PLAYER.squidBodyLift:PLAYER.stepUp,a.form==='squid'?PLAYER.squidHeight:PLAYER.height,a.form==='squid'),grounded:a.grounded};}
function tick(a,dt=1/60){G.time+=dt;a.update(dt);return snapshot(a);}

for(const team of [0,1])test(`team ${team}: natural zero-speed fall stays clear through real update and finish`,()=>{
  const a=setup({team}),rows=[];
  const record={kind:'natural-fall',team,rows};evidence.push(record);
  for(let i=0;i<180;i++)rows.push(tick(a));
  const invalid=rows.findIndex(r=>!r.fits);assert.equal(invalid,-1,JSON.stringify({firstInvalidIndex:invalid,...rows[invalid]}));
  assert(a.pos.y<2.2,'fall is not frozen at an earlier airborne height');
  const tail=rows.slice(-30).map(r=>r.pos[1]);assert(Math.max(...tail)-Math.min(...tail)<.01,'bounded stable contact');
  // The platform blocks a radial retreat. Follow its real clear side route,
  // then retreat; do not require walking through/climbing the solid ledge.
  a.intent.move.set(0,0,1);for(let i=0;i<120;i++){const r=tick(a);assert(r.fits,JSON.stringify({sideTick:i+1,...r}));}
  assert(a.pos.z>3,'clear side route works: '+JSON.stringify(snapshot(a)));
  a.intent.move.set(-1,0,0);for(let i=0;i<120;i++){const r=tick(a);assert(r.fits,JSON.stringify({retreatTick:i+1,...r}));}
  assert(a.pos.x<14,'ordinary clear retreat works');assert(a.grounded);
  record.exit=snapshot(a);
});

for(const dt of [1/60,1/30,1/24])test(`ordinary run/terminal-fall shortened case is capsule-clear at dt=${dt}`,()=>{
  const a=setup({start:[15.39,2.3,0],velocity:[PLAYER.runSpeed,-PLAYER.maxFall,0]});
  const rows=[];evidence.push({kind:'shortened',dt,rows});
  for(let i=0;i<12;i++){rows.push(tick(a,dt));assert(rows.at(-1).fits,JSON.stringify({tick:i+1,...snapshot(a)}));}
});

for(const team of [0,1])test(`team ${team}: native squid terrain capsule also stays clear during the natural fall`,()=>{
  const a=setup({team});a.form='squid';a.intent.squid=true;
  for(let i=0;i<180;i++){const r=tick(a);assert.equal(a.form,'squid');assert(r.fits,JSON.stringify({tick:i+1,...r}));}
});

test('reported .1-second raised-box reproduction restores a complete clear position',()=>{
  const a=setup({maxX:16,top:2,start:[14,2,0],velocity:[40,-20,0]});
  a._integrate(.1,false,false);a._finishFrame(.1);
  assert(fits(a),JSON.stringify(snapshot(a)));
  for(let i=0;i<60;i++)assert(tick(a).fits);
});

test('no-exclusion negative control and its ordinary movement segment are clear',()=>{
  const a=setup({barrier:false,start:[15.39,2.3,0],velocity:[PLAYER.runSpeed,-PLAYER.maxFall,0]}),from=a.pos.clone();
  tick(a);const to=a.pos.clone();assert(fits(a));
  for(let i=0;i<=100;i++){a.pos.lerpVectors(from,to,i/100);assert(fits(a),'raw path sample '+i);}
  a.pos.copy(to);assert(a.pos.x>15.4);assert(a.pos.y<2);
});

test('free vertical fall and upward launch outside the conflicting edge retain native Y/velocity',()=>{
  for(const velocity of [[0,-15,0],[0,PLAYER.jumpVel,0]]){
    const histories=[];
    for(const barrier of [false,true]){
      const a=setup({barrier,start:[12,12,5],velocity});a.intent.move.set(0,0,0);const rows=[];
      for(let i=0;i<15;i++)rows.push(tick(a));histories.push(rows);
    }
    assert.deepEqual(histories[0],histories[1]);
  }
});

test('horizontal spawn contact above the ledge preserves ordinary vertical fall and launch',()=>{
  for(const velocity of [[0,-15,0],[0,PLAYER.jumpVel,0]]){
    const histories=[];
    for(const barrier of [false,true]){
      const a=setup({barrier,start:[15.39,12,0],velocity}),rows=[];
      for(let i=0;i<15;i++){const r=tick(a);assert(r.fits);rows.push([r.pos[1],r.vel[1]]);}
      histories.push(rows);
    }
    assert.deepEqual(histories[0],histories[1]);
  }
});

test('when no outside candidate fits, retain the clear native endpoint with bounded stable work',()=>{
  const a=setup({barrier:false,start:[20,0,0]});
  G.level=new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:4.2,half:[],single:[
    {kind:'box',min:[-50,-.5,-50],max:[50,0,50]},
    {kind:'box',min:[14,0,-6],max:[18,8,6]},{kind:'box',min:[22,0,-6],max:[26,8,6]},
    {kind:'box',min:[14,0,-6],max:[26,8,-2]},{kind:'box',min:[14,0,2],max:[26,8,6]}]});
  G.physics=new Physics(G.level);assert(fits(a));a.vel.set(0,0,0);
  let calls=0;const check=G.physics.bodyFits.bind(G.physics);G.physics.bodyFits=(...args)=>{calls++;return check(...args);};
  const origin=a.pos.clone();
  for(let i=0;i<20;i++){
    calls=0;assert.equal(f.constrainSpawnPosition(a,G.level,PLAYER,null,G.physics),false);
    assert(calls<=9,'one candidate plus the existing eight recovery samples');
    assert(a.pos.equals(origin));assert(check(a.pos,PLAYER.s3HumanoidTerrainRadiusRaw,PLAYER.stepUp,PLAYER.height));
  }
});
