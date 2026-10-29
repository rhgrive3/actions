import assert from 'node:assert/strict';

// Build proof inputs from the installed native launch/Runner and recProj owners,
// rather than the old 11-field synthetic row that native playback rejects.
// Sender clock, flat world and fixed muzzle remain explicit component inputs.
export function nativeMainBirth(f,nm,actor,weapon,ts) {
  const remote=actor.remote,actors=f.G.actors,boss=f.G.boss;
  actor.remote=false;actor.ink=100;actor.weaponRunner.reset();
  f.G.actors=[actor];f.G.boss=null;nm.out.length=0;f.clock.set(ts);
  try {
    if(weapon.catalogRecord) {
      for(let i=0;i<300&&!nm.out.some(e=>e[1]==='p');i++) {
        f.G.time+=1/60;
        actor.weaponRunner.update(1/60,{fire:i<130,firePressed:i===0,fireReleased:i===130,sub:false,subReleased:false});
        f.projectiles.update(1/60);
      }
    } else {
      const method={shooter:'fireShooter',dualies:'fireDualies',splatling:'fireSplatling'}[weapon.kind];
      assert.ok(method,'supported native producer');
      f.projectiles[method](actor,weapon,0,0);
    }
    const births=nm.out.filter(e=>e[1]==='p');
    assert.ok(births.length,'real installed producer must publish a native projectile row');
    assert.ok(births[0].length>=28,'native serializer includes timing and geometry');
    return structuredClone(births[0]);
  } finally {
    actor.remote=remote;f.G.actors=actors;f.G.boss=boss;f.projectiles.clear();nm.out.length=0;
  }
}
