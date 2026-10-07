// #970. Cache admission is separate from the native muzzle LOS and the seven
// integration steps. Storage grows only on first use, not on an idle HUD frame.
const FIELDS = ['id','kind','projSpeed','straightTime','referenceGravity','range','shotGuideFrame','impactRadius','ballistics'];
function value(s, v) {
  const i = s.index++;
  if (!Object.is(s.values[i], v)) { s.values[i] = v; s.dirty = true; }
}
function vector(s,v) { value(s,v?.x);value(s,v?.y);value(s,v?.z); }
function matrix(s,m) { for(let i=0;i<16;i++)value(s,m?.elements?.[i]); }
export function dualiesGuideInputsChanged(system, actor, weapon, game, camera=game.camera) {
  const s=system._dualiesGuideCache||(system._dualiesGuideCache={values:[],index:0,dirty:true,ready:false,
    muzzle:actor.pos.clone(),other:actor.pos.clone(),aim:actor.pos.clone()});
  s.index=0;s.dirty=!s.ready;
  value(s,actor);value(s,weapon);vector(s,actor.pos);vector(s,actor.aimDir);vector(s,actor.aimPoint);
  value(s,actor.yaw);value(s,actor.aimPitch);value(s,actor.form);value(s,actor.grounded);value(s,actor.weaponRunner?.s3Turret);
  for(const field of FIELDS)value(s,weapon[field]);
  const ch=actor.character;
  value(s,ch);value(s,ch.getMuzzle);value(s,ch.getMuzzleHand);value(s,ch.getAimMuzzle);
  ch.getMuzzle(s.muzzle);vector(s,s.muzzle);
  if(ch.getMuzzleHand){ch.getMuzzleHand(s.other,1);vector(s,s.other);}else vector(s,null);
  const ready=ch.aimReady?ch.aimReady():1;value(s,ready);
  if(ready<.98&&ch.getAimMuzzle){value(s,ch.getAimMuzzle(s.aim,actor.aimPitch));vector(s,s.aim);}else vector(s,null);
  const physics=game.physics,level=physics?.level||game.level;
  value(s,physics);value(s,physics?.los);value(s,physics?.raycast);value(s,level);value(s,level?.blocks);value(s,level?.faces);
  value(s,level?.blocks?.length);value(s,level?.version);value(s,level?.revision);value(s,level?.collisionGeneration);
  value(s,system._muzzleHand);value(s,system._aimFrom);
  value(s,camera);matrix(s,camera?.matrixWorld);matrix(s,camera?.projectionMatrix);
  s.ready=true;return s.dirty;
}
