// #970. Cache admission is separate from the native muzzle LOS and the seven
// integration steps. Storage grows only on first use, not on an idle HUD frame.
const FIELDS = ['id','kind','projSpeed','straightTime','referenceGravity','range','shotGuideFrame','impactRadius','ballistics','inkFlightProfile'];
function value(s, v) {
  const i = s.index++;
  if (!Object.is(s.values[i], v)) { s.values[i] = v; s.dirty = true; }
}
function vector(s,v) { value(s,v?.x);value(s,v?.y);value(s,v?.z); }
function matrix(s,m) { for(let i=0;i<16;i++)value(s,m?.elements?.[i]); }

// Level/NativeLevel and actual Tower writers publish collisionRevision. Unknown
// worlds stay uncached; query stamps and elapsed time are not revisions.
export function shooterGuideCache(system,actor,weapon,game,probe) {
  const s=system._s3ShooterGuideCache||(system._s3ShooterGuideCache={values:[],index:0,dirty:true,ready:false,
    point:{x:0,y:0,z:0,frames:0}});
  const ch=actor.character,runner=actor.weaponRunner,physics=game.physics,level=physics?.level||game.level;
  // G.level cannot certify a bridge whose actual collision owner is hidden.
  const revision=physics?.level?.collisionRevision;
  s.cacheable=Number.isSafeInteger(revision)&&revision>=0;
  s.index=0;s.dirty=!s.ready||!s.cacheable;
  value(s,system);value(s,actor);value(s,weapon);value(s,actor.weapon);value(s,actor.weaponId);value(s,ch);
  for(const field of FIELDS)value(s,weapon[field]);
  value(s,weapon.inkFlightProfile);value(s,weapon.chargeTime);value(s,weapon.firstChargeTime);
  vector(s,actor.pos);vector(s,actor.vel);vector(s,actor.aimPoint);vector(s,actor.aimDir);
  value(s,actor.yaw);value(s,actor.aimPitch);value(s,actor.form);value(s,actor.grounded);value(s,actor.remote);value(s,actor.team);value(s,actor.alive);
  value(s,actor.specialActive);value(s,actor.superJumpState);value(s,runner);value(s,runner?.s3Turret);value(s,runner?.dodge);
  value(s,runner?.charge);value(s,runner?.fidelitySplatlingCharge);value(s,runner?.charging);value(s,runner?.streaming);
  value(s,ch.getMuzzle);value(s,ch.getAimMuzzle);value(s,ch.aimReady);
  value(s,system._muzzle);value(s,system._aimFrom);value(s,system._nominalInkGuide);
  value(s,system._advanceInkGuide);value(s,system._inkGuideContact);
  // Capture the actual deterministic launch after native muzzle safety and
  // convergence/spawn-velocity handling, rather than guessing a second origin.
  vector(s,probe.pos);vector(s,probe.vel);value(s,probe.inkProfile);value(s,probe.inkProfile?.collision?.field);
  value(s,probe.fidelityMove);value(s,probe.straight);value(s,probe.grav);value(s,probe.drag);value(s,probe.life);
  value(s,system.inkFlight);value(s,system.inkFlight?.world);
  value(s,physics);value(s,physics?.los);value(s,physics?.raycast);value(s,physics?.segment);
  value(s,game.level);value(s,game.stage);value(s,game.map);value(s,game.match?.mode);
  value(s,level);value(s,revision);value(s,level?.queryBlocks);value(s,level?.queryDynamicBlocks);
  value(s,level?.blocks);value(s,level?.blocks?.length);value(s,level?.faces);value(s,level?.faces?.length);
  value(s,level?.hash);value(s,level?.native);value(s,level?.data);value(s,level?.staticBlockCount);
  value(s,level?.triangleWorld);value(s,level?.triangleWorld?.sweepSphere);value(s,level?.triangleWorld?.raycast);
  // Only the world point is cached. Projection still uses the current camera;
  // observing its identities/matrices also keeps camera swaps fail-closed.
  const camera=game.rig?.gameCam||game.camera;
  value(s,camera);matrix(s,camera?.matrixWorld);matrix(s,camera?.matrixWorldInverse);matrix(s,camera?.projectionMatrix);
  s.values.length=s.index;
  return s;
}
export function dualiesGuideInputsChanged(system, actor, weapon, game, camera=game.camera) {
  const s=system._dualiesGuideCache||(system._dualiesGuideCache={values:[],index:0,dirty:true,ready:false,
    muzzle:actor.pos.clone(),other:actor.pos.clone(),aim:actor.pos.clone()});
  const physics=game.physics,level=physics?.level||game.level,revision=physics?.level?.collisionRevision;
  s.index=0;s.dirty=!s.ready||!Number.isSafeInteger(revision)||revision<0;
  value(s,actor);value(s,weapon);vector(s,actor.pos);vector(s,actor.aimDir);vector(s,actor.aimPoint);
  value(s,actor.yaw);value(s,actor.aimPitch);value(s,actor.form);value(s,actor.grounded);value(s,actor.weaponRunner?.s3Turret);
  vector(s,actor.vel);value(s,actor.remote);value(s,actor.team);
  for(const field of FIELDS)value(s,weapon[field]);
  const ch=actor.character;
  value(s,ch);value(s,ch.getMuzzle);value(s,ch.getMuzzleHand);value(s,ch.getAimMuzzle);
  ch.getMuzzle(s.muzzle);vector(s,s.muzzle);
  if(ch.getMuzzleHand){ch.getMuzzleHand(s.other,1);vector(s,s.other);}else vector(s,null);
  const ready=ch.aimReady?ch.aimReady():1;value(s,ready);
  if(ready<.98&&ch.getAimMuzzle){value(s,ch.getAimMuzzle(s.aim,actor.aimPitch));vector(s,s.aim);}else vector(s,null);
  value(s,physics);value(s,physics?.los);value(s,physics?.raycast);value(s,level);value(s,level?.blocks);value(s,level?.faces);
  value(s,level?.blocks?.length);value(s,level?.faces?.length);value(s,revision);
  value(s,level?.hash);value(s,physics?.segment);value(s,level?.queryBlocks);value(s,level?.queryDynamicBlocks);
  value(s,level?.native);value(s,level?.data);value(s,level?.staticBlockCount);
  value(s,level?.triangleWorld);value(s,level?.triangleWorld?.sweepSphere);value(s,level?.triangleWorld?.raycast);
  value(s,system._muzzleHand);value(s,system._aimFrom);value(s,system._nominalInkGuide);value(s,system._advanceInkGuide);value(s,system._inkGuideContact);
  value(s,system.inkFlight);value(s,system.inkFlight?.world);
  value(s,camera);matrix(s,camera?.matrixWorld);matrix(s,camera?.projectionMatrix);
  s.ready=true;return s.dirty;
}
