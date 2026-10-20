// Build-only exact motion hot paths. Keep coefficient sampling, local blends
// and world-space consumers unchanged; unused FK results have no readers.
export function adaptMotionFkHotpath(rel, code, replaceOnce) {
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code,
      '   this.pose.fk();\n   if(stepAmplitude<1){',
      '   // World transforms are evaluated after the remaining local blends.\n   if(stepAmplitude<1){',
      'motion FK before local gait blend');
    code = replaceOnce(code,
      '    this.pose.mix(this.restGait,1-stepAmplitude).fk();',
      '    this.pose.mix(this.restGait,1-stepAmplitude);',
      'motion FK after local gait blend');
    code = replaceOnce(code,
      '  this.pose.fk();\n  if(transition<1)this.gaitTargets.mix(this.previousTargets,1-transition);',
      '  // The pre-balance FK is still current unless transition changed local TRS.\n  if(transition<1)this.pose.fk();\n  if(transition<1)this.gaitTargets.mix(this.previousTargets,1-transition);',
      'motion FK after unchanged transition');
  }
  if (rel === 'src/game/motion/body-balance.js') {
    // apply() reads the centre pose's WORLD rotation only for the gain bones
    // (hip..head); every other bone blends local rotations.
    code = replaceOnce(code,
      '  this.center.fk();const gainX=',
      '  this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const gainX=',
      'body balance centre FK range');
    // Without a short-step rest blend only that same range of the centre's
    // local pose is ever read; callers then pass it as `count`.
    code = replaceOnce(code,
      ' add(profile,weight){\n  if(weight<=0)return;',
      ' add(profile,weight,count=undefined){\n  if(weight<=0)return;',
      'body balance centre blend range parameter');
    code = replaceOnce(code,
      '  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);',
      '  if(!this.total)this.center.copy(profile.centerPose,count);else this.center.mix(profile.centerPose,a,count);',
      'body balance centre blend range');
  }
  // A settled contact's four Hermite coefficients are exactly +0. Retain the
  // clamp, active polynomial order and final zero additions for signed-zero
  // and nonfinite parity; bind existing fields without allocating new state.
  if (rel === 'src/game/motion/contact-transition.js') {
    code = replaceOnce(code,
      '  const u=clamp(this.age/this.duration,0,1),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;\n' +
      '  const a=1-10*u3+15*u4-6*u5,b=this.duration*(u-6*u3+8*u4-3*u5);\n' +
      '  const da=(-30*u2+60*u3-30*u4)/this.duration,db=1-18*u2+32*u3-15*u4;\n' +
      '  this.position.copy(goal).addScaledVector(this.offset,a).addScaledVector(this.offsetVelocity,b);\n' +
      '  this.velocity.copy(velocity).addScaledVector(this.offset,da).addScaledVector(this.offsetVelocity,db);',
      '  const {duration,offset,offsetVelocity}=this,u=clamp(this.age/duration,0,1);let a=0,b=0,da=0,db=0;\n' +
      '  if(u!==1){\n' +
      '   const u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;\n' +
      '   a=1-10*u3+15*u4-6*u5;b=duration*(u-6*u3+8*u4-3*u5);\n' +
      '   da=(-30*u2+60*u3-30*u4)/duration;db=1-18*u2+32*u3-15*u4;\n  }\n' +
      '  this.position.copy(goal).addScaledVector(offset,a).addScaledVector(offsetVelocity,b);\n' +
      '  this.velocity.copy(velocity).addScaledVector(offset,da).addScaledVector(offsetVelocity,db);',
      'source settled contact transition');
  }
  return code;
}

// Runs after every other quality source rewrite, whose anchors include these
// sample calls verbatim.
export function adaptMotionSampleFkRange(rel, code, replaceOnce) {
  if (rel === 'src/game/motion/source-controller.js') {
    // Per-clip and idle/special samples feed only gait end-effectors, foot/toe
    // lift and head-space hair swing before the final full-pose FK. Evaluate
    // world transforms for that leading bone range only; arms, face and weapon
    // bones are recomputed by the unconditional full FK that follows.
    code = replaceOnce(code,
      'export class SourceMotionController {\n',
      'function sourceSampleFk(c){\n' +
      ' const b=c.bank;if(c._sampleFkBank===b)return c._sampleFk;\n' +
      " if(typeof b.fkCount!=='function')return true;\n" +
      ' const names=i=>i.filter(x=>x>=0).map(x=>b.bones[x].name);\n' +
      ' c._sampleFkBank=b;c._gaitFk=b.fkCount(names(c.shortTargets.indices));\n' +
      ' return c._sampleFk=b.fkCount(names([...c.gaitTargets.indices,b.index.toe_L,b.index.toe_R,b.index.head,...c.hairTargets.indices,...c.hairTargets.entries.map(e=>e.child)]));\n' +
      '}\nexport class SourceMotionController {\n',
      'motion sample FK range helper');
    code = replaceOnce(code,
      'this.bank.sample(special.name,special.frame,this.pose,false);',
      'this.bank.sample(special.name,special.frame,this.pose,false,sourceSampleFk(this));',
      'motion special sample FK range');
    code = replaceOnce(code,
      'this.bank.sample(clip,frame,this.tmp,true);',
      'this.bank.sample(clip,frame,this.tmp,true,sourceSampleFk(this));',
      'motion locomotion sample FK range');
    code = replaceOnce(code,
      'this.restGait.copy(this.bodyBalance.center).fk();',
      'this.restGait.copy(this.bodyBalance.center).fk((sourceSampleFk(this),this._gaitFk));',
      'motion short-gait rest FK range');
    code = replaceOnce(code,
      'this.bank.sample(name,frame,this.pose);',
      'this.bank.sample(name,frame,this.pose,undefined,sourceSampleFk(this));',
      'motion idle sample FK range');
    // The centre's complete local pose is read only by the short-step rest
    // gait blend (moving with stepAmplitude < 1).
    code = replaceOnce(code,
      'this.bodyBalance.add(p,item.weight);',
      'this.bodyBalance.add(p,item.weight,stepAmplitude<1?undefined:this.bodyBalance._centerFk);',
      'motion locomotion balance centre range');
    code = replaceOnce(code,
      'this.bodyBalance.add(idleProfile,1);',
      'this.bodyBalance.add(idleProfile,1,this.bodyBalance._centerFk);',
      'motion idle balance centre range');
    // applyBody runs retarget.apply, which ends by updating the whole kid
    // subtree, then retarget.ground. Only the activation crossfade touches
    // bone transforms between the two.
    code = replaceOnce(code,
      '  if(activation<1)for(let i=0;i<this.character.boneList.length;i++){',
      '  if(activation<1)this.retarget._kidWorldFresh=false;\n  if(activation<1)for(let i=0;i<this.character.boneList.length;i++){',
      'retarget kid world invalidated by activation blend');
  }
  if (rel === 'src/game/motion/retarget.js') {
    // ground()/protectTurningFeet() start by updating the complete root
    // subtree. When apply() has just updated the kid subtree and no transform
    // changed since, recomputing it reproduces the same matrices; the root,
    // its ancestors and its other children are still updated.
    code = replaceOnce(code,
      ' apply(pose,{upper=true,aimPitch=0,rootScale=1,trajectory=pose,pelvisTrajectory=null}={}) {\n',
      ' _rootWorld(){\n' +
      '  const c=this.character,fresh=this._kidWorldFresh;this._kidWorldFresh=false;\n' +
      '  if(!fresh||c.kid.parent!==c.root||!c.root.matrixAutoUpdate){c.root.updateWorldMatrix(true,true);return;}\n' +
      '  c.root.updateWorldMatrix(true,false);\n' +
      '  for(const child of c.root.children)if(child!==c.kid)child.updateWorldMatrix(false,true,true);\n' +
      ' }\n' +
      ' apply(pose,{upper=true,aimPitch=0,rootScale=1,trajectory=pose,pelvisTrajectory=null}={}) {\n  this._kidWorldFresh=false;\n',
      'retarget root world reuse helper');
    code = replaceOnce(code,
      '  c.kid.updateWorldMatrix(true,true);\n }\n applyAccessories(',
      '  c.kid.updateWorldMatrix(true,true);this._kidWorldFresh=true;\n }\n applyAccessories(',
      'retarget kid world fresh after leg footpaths');
    code = replaceOnce(code,
      '  if(!grounded||!enabled){this.reset();if(grounded&&freeProtect)this.protectTurningFeet();return;}\n  c.root.updateWorldMatrix(true,true);',
      '  if(!grounded||!enabled){this.reset();if(grounded&&freeProtect)this.protectTurningFeet();this._kidWorldFresh=false;return;}\n  this._rootWorld();',
      'retarget ground reuses fresh kid world');
    code = replaceOnce(code,
      ' protectTurningFeet(){\n  const c=this.character;\n  c.root.updateWorldMatrix(true,true);',
      ' protectTurningFeet(){\n  const c=this.character;\n  this._rootWorld();',
      'retarget turning feet reuse fresh kid world');
  }
  return code;
}
