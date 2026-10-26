export function adaptWalkPresentation(rel,code,replaceOnce){
  if(rel==='src/game/actor.js'){
    code=replaceOnce(code,`    const w = 24;
    const acc = -w * w * this.smoothY - 2 * w * this.smoothYV;
    this.smoothYV += acc * dt; this.smoothY += this.smoothYV * dt;`,
    '    advanceStepPresentation(this, dt);','walking visual step spring exact decay');
    return "import { advanceStepPresentation } from '../../patches/local-quality/walk-presentation.mjs';\n"+code;
  }
  if(rel==='src/game/motion/source-controller.js'){
    code=replaceOnce(code,'  this.speed=dt>0?dist/dt:0;this.velocityY=dt>0?dy/dt:0;this.distance+=dist;',
    `  const rawTravelSpeed=dt>0?dist/dt:0;
  const ordinaryWalk=(s.form||'kid')==='kid'&&(s.grounded??true)&&!this.manual;
  this.speed=walkPresentationSpeed(this,rawTravelSpeed,dt,teleport||!ordinaryWalk);this.velocityY=dt>0?dy/dt:0;this.distance+=dist;`,
    'walking visual speed rejects per-frame displacement noise');
    return "import { walkPresentationSpeed } from '../../../patches/local-quality/walk-presentation.mjs';\n"+code;
  }
  return code;
}
