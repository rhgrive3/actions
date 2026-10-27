// Performance-only carryover from reviewed PR #1870, source commit
// 1d0dc3b242113bba28752003917f3d6f4998803f. The aggregate #1878 omitted these
// transforms. Geometry/detail-key changes are deliberately outside this file.
function once(code,before,after,label){const at=code.indexOf(before);if(at<0||code.indexOf(before,at+before.length)>=0)throw Error('Reviewed world carryover anchor: '+label);return code.slice(0,at)+after+code.slice(at+before.length);}
export function adaptReviewedWorldCarryover20261026(rel,code){
 const patch=(before,after,label)=>{code=once(code,before,after,label);};
  if (rel === 'src/game/character.js') {
    patch('    const S = { t, meshes: {}, list: [] };\n    for (const p of this._tierParts(t)) {\n      const m = new THREE.SkinnedMesh(p.geo, this._matFor(p.mat));',
      "    const S = { t, meshes: {}, list: [] }, previous=this._driveTierReuse?.[t];\n    if(this._driveTierReuse)this._driveTierReuse[t]=null;\n    const reusable=previous?.list.slice();\n    for (const p of this._tierParts(t)) {\n      const name='kid:'+p.key+':'+TIERS[t], index=reusable?reusable.findIndex(m=>m.name===name):-1;\n      const m=index<0?new THREE.SkinnedMesh(p.geo,this._matFor(p.mat)):reusable.splice(index,1)[0];\n      if(index>=0){\n        m.geometry=p.geo;m.material=this._matFor(p.mat);m.userData={};\n        m.position.set(0,0,0);m.quaternion.identity();m.scale.set(1,1,1);m.matrix.identity();m.matrixWorld.identity();m.matrixWorldNeedsUpdate=true;\n        m.layers.mask=1;m.boundingBox=null;\n        m.onBeforeRender=THREE.SkinnedMesh.prototype.onBeforeRender;m.onBeforeShadow=THREE.SkinnedMesh.prototype.onBeforeShadow;\n        m.onAfterRender=THREE.SkinnedMesh.prototype.onAfterRender;m.onAfterShadow=THREE.SkinnedMesh.prototype.onAfterShadow;\n        delete m.morphTargetInfluences;delete m.morphTargetDictionary;m.updateMorphTargets();\n      }",
      'reuse same-part tier meshes on quality changes');
    patch('for (const X of this.lodSets) if (X) for (const m of X.list) this.kid.remove(m); this.lodSets = [null, null, null];',
      'const reusable=this._driveTierReuse||(this._driveTierReuse=[null,null,null]); for(let t=0;t<this.lodSets.length;t++){const X=this.lodSets[t];if(X){for(const m of X.list)this.kid.remove(m);reusable[t]=X;}} this.lodSets = [null, null, null];',
      'bounded detached tier meshes await current quality geometry');
    patch('  dispose() {\n    for (const r of (this.hairKeys483 || [])) releaseHairKey483(r.key);',
      '  dispose() {\n    this._driveTierReuse=null;\n    for (const r of (this.hairKeys483 || [])) releaseHairKey483(r.key);',
      'release detached tier mesh references on disposal');
    patch('Ld.set(0.3, 0.6, -0.75).normalize();', 'Ld.copy(DRIVE_RIM_FALLBACK);', 'constant fallback rim direction');
    code += '\nconst DRIVE_RIM_FALLBACK = new THREE.Vector3(0.3, 0.6, -0.75).normalize();\n';
    patch('        let az, ay;\n        if (pitch >= 0) { ay = ANKLE_H * Math.cos(pitch) + BALL_Z * Math.sin(pitch); az = BALL_Z + ANKLE_H * Math.sin(pitch) - BALL_Z * Math.cos(pitch); }\n        else { ay = ANKLE_H * Math.cos(pitch) - HEEL_Z * Math.sin(pitch); az = -HEEL_Z + ANKLE_H * Math.sin(pitch) + HEEL_Z * Math.cos(pitch); }',
      '        const cosPitch=Math.cos(pitch), sinPitch=Math.sin(pitch);\n        let az, ay;\n        if (pitch >= 0) { ay = ANKLE_H * cosPitch + BALL_Z * sinPitch; az = BALL_Z + ANKLE_H * sinPitch - BALL_Z * cosPitch; }\n        else { ay = ANKLE_H * cosPitch - HEEL_Z * sinPitch; az = -HEEL_Z + ANKLE_H * sinPitch + HEEL_Z * cosPitch; }',
      'ankle pitch sine/cosine shared without changing operation order');
    patch('    setE(P, ANC, c.p[0], c.p[1] + 0.012 * Math.sin(TAU * 2 * this.phase) * gw, c.p[2] - swA * 0.1);',
      '    const carryPulse=Math.sin(TAU * 2 * this.phase);\n    setE(P, ANC, c.p[0], c.p[1] + 0.012 * carryPulse * gw, c.p[2] - swA * 0.1);', 'carry pulse');
    patch('H.run.p[1] + 0.012 * Math.sin(TAU * 2 * this.phase)', 'H.run.p[1] + 0.012 * carryPulse', 'carry run pulse');
    patch('      const climbV = Math.min(1, Math.abs(this.vyS) / 5 + v / 6);',
      '      const climbV = Math.min(1, Math.abs(this.vyS) / 5 + v / 6), climbPulse=Math.sin(t * 14);', 'climb pulse');
    for (const before of ['0.025 * Math.sin(t * 14) * climbV','0.05 * Math.sin(t * 14) * climbV'])
      patch(before,before.replace('Math.sin(t * 14)','climbPulse'),'reuse '+before);
    patch('        hop = 0.14 * Math.sin(Math.PI * airU) * k;',
      '        const hopArc=Math.sin(Math.PI * airU);\n        hop = 0.14 * hopArc * k;', 'hop arc');
    patch('0.16 * Math.sin(Math.PI * airU) * k', '0.16 * hopArc * k', 'reuse hop arc');
    patch('    F.verge = Math.atan2(0.062, Math.max(0.3, A.dist));',
      '    const vergeDistance=Math.max(0.3, A.dist);\n    if (!Object.is(F._driveVergeDistance,vergeDistance) || F._driveVerge===undefined) { F._driveVergeDistance=vergeDistance; F._driveVerge=Math.atan2(0.062,vergeDistance); }\n    F.verge = F._driveVerge;', 'unchanged vergence distance');
    patch('      this.rv.lerp(_v1, 1 - Math.exp(-dt * 32));',
      '      if (dt!==this._driveRootDt) { this._driveRootDt=dt; this._driveRootAlphaV=1-Math.exp(-dt*32); this._driveRootAlphaA=1-Math.exp(-dt*16); }\n      this.rv.lerp(_v1, this._driveRootAlphaV);', 'root smoothing coefficients');
    patch('      this.ra.lerp(_v3, 1 - Math.exp(-dt * 16));', '      this.ra.lerp(_v3, this._driveRootAlphaA);', 'reuse root acceleration coefficient');
    patch('    const c = Math.cos(yaw), sn = Math.sin(yaw);',
      '    const c = Math.cos(yaw), sn = Math.sin(yaw);\n    this._driveYawValid=true; this._driveYaw=yaw; this._driveYawCos=c; this._driveYawSin=sn;', 'publish root yaw coefficients');
    const yawPair='const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);';
    if (code.split(yawPair).length-1!==4) throw new Error('Drive core queue composition conflict: four root yaw consumers');
    code=code.replaceAll(yawPair,'const c = driveRootYawCos(this), sn = this._driveYawSin;');
    code+='\nfunction driveRootYawCos(c) { if (!c._driveYawValid || !Object.is(c._driveYaw,c.yaw)) { c._driveYawValid=true; c._driveYaw=c.yaw; c._driveYawCos=Math.cos(c.yaw); c._driveYawSin=Math.sin(c.yaw); } return c._driveYawCos; }\n';
  }
  if (rel === 'src/game/motion/source-controller.js') {
    patch('this.bodyBalance.apply(this.pose,this.gaitTargets,{run,weight:1,pivot:this.pivotWeight,strafe:this.strafeBalance*(1-this.pivotWeight)})',
      'this.bodyBalance.apply(this.pose,this.gaitTargets,(this._driveBalanceArgs||=( {run:0,weight:1,pivot:0,strafe:0}),this._driveBalanceArgs.run=run,this._driveBalanceArgs.weight=1,this._driveBalanceArgs.pivot=this.pivotWeight,this._driveBalanceArgs.strafe=this.strafeBalance*(1-this.pivotWeight),this._driveBalanceArgs))', 'reuse private balance options');
    patch('this.retarget.apply(this.bodyPose||this.pose,{upper:this.sourceUpper,aimPitch:this.aimPitch,rootScale:this.character.kidScale,trajectory:this.targetsActive?this.gaitTargets:this.pose,pelvisTrajectory:balanceActive?this.bodyBalance.targets:null})',
      'this.retarget.apply(this.bodyPose||this.pose,(this._driveRetargetArgs||=({upper:true,aimPitch:0,rootScale:1,trajectory:null,pelvisTrajectory:null}),this._driveRetargetArgs.upper=this.sourceUpper,this._driveRetargetArgs.aimPitch=this.aimPitch,this._driveRetargetArgs.rootScale=this.character.kidScale,this._driveRetargetArgs.trajectory=this.targetsActive?this.gaitTargets:this.pose,this._driveRetargetArgs.pelvisTrajectory=balanceActive?this.bodyBalance.targets:null,this._driveRetargetArgs))', 'reuse private retarget options');
    patch('this.retarget.applyAccessories(this.pose,{hairTargets:!this.manual?this.hairTargets:null,shootBlend:this.shootBlend,dt})',
      'this.retarget.applyAccessories(this.pose,(this._driveAccessoryArgs||=({hairTargets:null,shootBlend:0,dt:0}),this._driveAccessoryArgs.hairTargets=!this.manual?this.hairTargets:null,this._driveAccessoryArgs.shootBlend=this.shootBlend,this._driveAccessoryArgs.dt=dt,this._driveAccessoryArgs))', 'reuse private accessory options');
    patch("this.squidRig.apply(this.squidPose,{yaw:this.squidYaw,form:s.form||'squid',wallNormal:s.wallNormal,velocityY:this.velocityY,speed:this.speed,localX:this.localX,localZ:this.localZ,scale:this.character.sqScale})",
      "this.squidRig.apply(this.squidPose,(this._driveSquidArgs||=({yaw:0,form:'squid',wallNormal:null,velocityY:0,speed:0,localX:0,localZ:1,scale:1}),this._driveSquidArgs.yaw=this.squidYaw,this._driveSquidArgs.form=s.form||'squid',this._driveSquidArgs.wallNormal=s.wallNormal,this._driveSquidArgs.velocityY=this.velocityY,this._driveSquidArgs.speed=this.speed,this._driveSquidArgs.localX=this.localX,this._driveSquidArgs.localZ=this.localZ,this._driveSquidArgs.scale=this.character.sqScale,this._driveSquidArgs))", 'reuse private squid options');
    patch('  const jumpBase=shooting?famTables.jump1:famTables.jump0;',
      "  const jumpBase=shooting?famTables.jump1:famTables.jump0;\n  let jumpClips=shooting?famTables._driveJump1:famTables._driveJump0;\n  if (!jumpClips) { jumpClips={start:this.bank.clips.get(jumpBase+'_St')||(jumpBase==='Jump_Glng00'?this.bank.clips.get('Jump_Glngl00_St'):undefined),body:this.bank.clips.get(jumpBase),end:this.bank.clips.get(jumpBase+'_Ed')}; if(shooting)famTables._driveJump1=jumpClips;else famTables._driveJump0=jumpClips; }", 'resolve immutable family jump clips');
    patch("   const st=this.bank.clips.get(jumpBase+'_St')||(jumpBase==='Jump_Glng00'?this.bank.clips.get('Jump_Glngl00_St'):undefined);",'   const st=jumpClips.start;', 'jump start reference');
    patch('u*this.bank.clips.get(jumpBase).frames','u*jumpClips.body.frames','jump body reference');
    patch("this.bank.clips.get(jumpBase+'_Ed')?.frames",'jumpClips.end?.frames','jump end reference');
  }
  if (rel === 'src/game/motion/hair-targets.js') {
    patch('    const angle=2*Math.acos(clamp(Math.abs(this.swing.w),0,1));if(angle>HOST_HAIR.maxDelta)this.swing.slerp(this.identity,1-HOST_HAIR.maxDelta/angle);',
      '    if (!(Math.abs(this.swing.w)>=DRIVE_HAIR_SAFE_COS)) { const angle=2*Math.acos(clamp(Math.abs(this.swing.w),0,1));if(angle>HOST_HAIR.maxDelta)this.swing.slerp(this.identity,1-HOST_HAIR.maxDelta/angle); }', 'bounded hair swing avoids inverse cosine');
    code+='\nconst DRIVE_HAIR_SAFE_COS=Math.cos(HOST_HAIR.maxDelta/2)+1e-12;\n';
  }
  if (rel === 'src/game/motion/locomotion-profile.js') {
    patch(' const centers=bank.bones.map(()=>new THREE.Vector3()),lowest=[Infinity,Infinity],centerPose=new SourcePose(bank),runSamples=[];',
      ' const centerIndices=[...new Set(indices.filter(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length))].sort((a,b)=>a-b);\n const centers=new Array(bank.bones.length),lowest=[Infinity,Infinity],centerPose=new SourcePose(bank),runSamples=[];\n for(const k of centerIndices)centers[k]=new THREE.Vector3();','only consumed gait center vectors');
    patch(' const hairMean=bank.bones.map(()=>new THREE.Vector3()),headInverse=new THREE.Quaternion(),hairAxis=new THREE.Vector3();',
      ' const hairMean=new Array(bank.bones.length),headInverse=new THREE.Quaternion(),hairAxis=new THREE.Vector3();\n for(const k of hairIndices)hairMean[k]=new THREE.Vector3();','only consumed hair accumulators');
    patch('  for(let k=0;k<bank.bones.length;k++)centers[k].addScaledVector(pose.wp[k],1/n);',
      '  for(const k of centerIndices)centers[k].addScaledVector(pose.wp[k],1/n);','same-order sparse center accumulation');
  }
 return code;
}
