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
    if(code.includes('  if(!this._soleCenter)this.center.fk();'))code = replaceOnce(code,
      '  if(!this._soleCenter)this.center.fk();const mean=this._soleCenter||this.center;const gainX=',
      '  if(!this._soleCenter)this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const mean=this._soleCenter||this.center;const gainX=',
      'body balance centre FK range');
    else code=replaceOnce(code,'  this.center.fk();const gainX=','  this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const gainX=','legacy body balance centre FK range');
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
    // A mixed centre is private scratch: apply() consumes its local root
    // position and the world rotations of the gain joints, not its world
    // matrices or positions. Evaluate precisely those joints and ancestors in
    // SourcePose.fk's order and arithmetic. Keep the original FK for unusual
    // skeletons, overridden FK methods or observable quaternion callbacks.
    // Older source fixtures have no _soleCenter contract and retain full FK.
    if (code.includes('  if(!this._soleCenter)this.center.fk(')) {
      code = replaceOnce(code, 'export class BodyBalance {', `const balanceCenterCanonicalFk = SourcePose.prototype.fk;
const balanceCenterEmptyChange = THREE.Quaternion.prototype._onChangeCallback;
const balanceCenterCanSkipCallbacks = typeof balanceCenterEmptyChange === 'function' &&
 /^[^{]*\\{\\s*\\}$/.test(Object.getPrototypeOf(()=>{}).toString.call(balanceCenterEmptyChange));
const balanceCenterSqrt = Math.sqrt;
const balanceCenterNativeSqrt = /\\{\\s*\\[native code\\]\\s*\\}/.test(
 Object.getPrototypeOf(()=>{}).toString.call(balanceCenterSqrt));
function updateBalanceCenterRotations(balance) {
 const pose=balance.center,bank=balance.bank;
 const count=balance._centerFk??=bank.fkCount?.([...balance.rotationGain.keys()])??true;
 if(!balanceCenterCanSkipCallbacks||!balanceCenterNativeSqrt||Math.sqrt!==balanceCenterSqrt||
    !bank.parentsFirst||pose.fk!==balanceCenterCanonicalFk||
    !Number.isInteger(count)||count<0||count>bank.bones.length)return false;
 // FK calls each output callback, including callbacks on unused joints. Do not
 // skip any observable callbacks, even when the joint itself has no reader.
 for(let i=0;i<count;i++)if(!pose.wq[i]||pose.wq[i]._onChangeCallback!==balanceCenterEmptyChange)return false;
 const bones=bank.bones,local=pose.q,world=pose.wq,indices=balance.rotationWorldIndices;
 for(let k=0;k<indices.length;k++)if(indices[k]>=count)return false;
 for(const i of indices){
  const q=local[i],target=world[i],parent=bones[i].parent,x=q._x,y=q._y,z=q._z,w=q._w;
  if(parent>=0){
   const pq=world[parent],qax=pq._x,qay=pq._y,qaz=pq._z,qaw=pq._w;
   let rx=qax*w+qaw*x+qay*z-qaz*y,ry=qay*w+qaw*y+qaz*x-qax*z;
   let rz=qaz*w+qaw*z+qax*y-qay*x,rw=qaw*w-qax*x-qay*y-qaz*z;
   let length=Math.sqrt(rx*rx+ry*ry+rz*rz+rw*rw);
   if(length===0){rx=0;ry=0;rz=0;rw=1;}
   else{length=1/length;rx=rx*length;ry=ry*length;rz=rz*length;rw=rw*length;}
   target._x=rx;target._y=ry;target._z=rz;target._w=rw;target._onChangeCallback();
  }else{target._x=x;target._y=y;target._z=z;target._w=w;target._onChangeCallback();}
 }
 return true;
}
export class BodyBalance {`, 'body balance centre quaternion closure');
      code = replaceOnce(code,
        '  if(!this._soleCenter)this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const mean=this._soleCenter||this.center;const gainX=',
        '  if(!this._soleCenter&&!updateBalanceCenterRotations(this))this.center.fk(this._centerFk??=this.bank.fkCount?.([...this.rotationGain.keys()])??true);const mean=this._soleCenter||this.center;const gainX=',
        'body balance centre quaternion-only FK');
    }
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
    // Keep the activation marker compatible with the upstream retarget rewrite.
    // adaptGroundContactFk below defers its obsolete full-subtree refresh.
    code = replaceOnce(code,
      '  if(activation<1)for(let i=0;i<this.character.boneList.length;i++){',
      '  if(activation<1)this.retarget._kidWorldFresh=false;\n  if(activation<1)for(let i=0;i<this.character.boneList.length;i++){',
      'retarget kid world invalidated by activation blend');
  }
  if (rel === 'src/game/motion/retarget.js') {
    // Preserve guarded upstream anchors until the final contact specialization
    // below replaces this historical full-tree handoff.
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
  return adaptGroundContactFk(rel, code, replaceOnce);
}

/**
 * Build-only contact-phase FK specialization. No physics, sampling cadence,
 * geometry, pose coefficients or contact mathematics are changed.
 *
 * The final renderer refreshes the complete graph. Before that boundary, the
 * contact solver reads the kid matrix and the two leg subtrees only; weapon
 * and eye world-space consumers explicitly refresh their own ancestor paths.
 * This rewrite runs LAST, after retarget-branch-update and quality adapters.
 */
export function adaptGroundContactFk(rel, code, replaceOnce) {
  if (rel !== 'src/game/motion/retarget.js') return code;
  code = replaceOnce(code,
    ' _rootWorld(){\n' +
    '  const c=this.character,fresh=this._kidWorldFresh;this._kidWorldFresh=false;\n' +
    '  if(!fresh||c.kid.parent!==c.root||!c.root.matrixAutoUpdate){c.root.updateWorldMatrix(true,true);return;}\n' +
    '  c.root.updateWorldMatrix(true,false);\n' +
    '  for(const child of c.root.children)if(child!==c.kid)child.updateWorldMatrix(false,true,true);\n' +
    ' }',
    ` _rootWorld(){
  const c=this.character,root=c.root,model=c.model,kid=c.kid,hips=c.bones.hips;
  this._kidWorldFresh=false;
  if(!model||model.parent!==root||kid.parent!==model||hips.parent!==kid||
     this.contacts[0].limb.up.parent!==hips||this.contacts[1].limb.up.parent!==hips){
   root.updateWorldMatrix(true,true);return;
  }
  // Preserve Three's dirty/force propagation even with manually managed matrices.
  // Only the contact consumers need world transforms before rendering.
  let force=!!(root.matrixAutoUpdate||root.matrixWorldNeedsUpdate);
  root.updateWorldMatrix(true,false);
  let next=force||model.matrixAutoUpdate||model.matrixWorldNeedsUpdate;
  model.updateWorldMatrix(false,false,force);force=!!next;
  next=force||kid.matrixAutoUpdate||kid.matrixWorldNeedsUpdate;
  kid.updateWorldMatrix(false,false,force);force=!!next;
  next=force||hips.matrixAutoUpdate||hips.matrixWorldNeedsUpdate;
  hips.updateWorldMatrix(false,false,force);force=!!next;
  for(const f of this.contacts)f.limb.up.updateWorldMatrix(false,true,force);
 }`, 'contact FK: update only read branches');
  code = replaceOnce(code,
    '  c.kid.updateWorldMatrix(true,true);this._kidWorldFresh=true;\n }\n applyAccessories(',
    '  // Local leg IK has no world-space reader until ground/protectTurningFeet.\n' +
    '  this._kidWorldFresh=false;\n }\n applyAccessories(',
    'contact FK: defer unused pre-contact tree walk');
  code = replaceOnce(code,
    'invRot=c.kid.getWorldQuaternion(this.groundInvQ).invert();',
    'invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundInvQ.invert());',
    'contact FK: read refreshed kid rotation');
  code = replaceOnce(code,
    'p=bone.getWorldPosition(f.ankle),q=bone.getWorldQuaternion(f.worldQ);',
    'p=f.ankle.setFromMatrixPosition(bone.matrixWorld),q=(bone.matrixWorld.decompose(this.ccdA,f.worldQ,this.ccdB),f.worldQ);',
    'contact FK: read refreshed foot pose');
  code = replaceOnce(code,
    'const hip=limb.up.getWorldPosition(this.v2),reach=',
    'const hip=this.v2.setFromMatrixPosition(limb.up.matrixWorld),reach=',
    'contact FK: read refreshed thigh position');
  // Other adapters may insert an offscreen early-return before this anchor.
  code = replaceOnce(code,
    'c.kid.updateWorldMatrix(true,true);\n  for(let side=0;side<2;side++){',
    'c.bones.hips.updateWorldMatrix(true,false);\n  for(let side=0;side<2;side++){',
    'contact FK: defer unrelated descendants after pelvis correction');
  code = replaceOnce(code,
    'f.limb.up.updateWorldMatrix(true,true);f.bone.getWorldPosition(f.actual);',
    'f.limb.up.updateWorldMatrix(true,true);f.actual.setFromMatrixPosition(f.bone.matrixWorld);',
    'contact FK: read refreshed solved foot');
  return code;
}
