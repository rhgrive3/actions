// Explicit post-frame QA reads. Never installed into production source.
export async function installRollerBrowserMetrics(){
 const G=window.__G,T=window.swingT,{CHARACTER_CHANNELS:C}=await import(new URL('src/game/character.js',document.baseURI).href);
 const gap=(ch,side)=>{const d=ch.weapon.def,bone=ch.bones[side],blend=ch._s3RollerGripBlend||0,z=d.gripL?.handZ;
  const supported=side==='handL'&&ch.weaponKind==='roller'&&ch.kidForm&&!ch.dance&&!ch.actor?.specialActive&&
   ch.P[C.IKL]>.999&&ch.P[C.LTW]<.001&&!ch.P[C.SPIN]&&blend>.001&&d.fold?.pivot&&z&&Math.abs(z.x)+Math.abs(z.y)<1e-8&&z.z>.999;
  if(supported){const palm=d.gripL.pos.clone().sub(d.handL.pos).applyQuaternion(d.handL.quat.clone().invert()),shaft=d.gripL.pos.clone();
   shaft.z+=Number.isFinite(ch._s3RollerSupportAdvance)?ch._s3RollerSupportAdvance:Math.max(0,(d.gripR.pos.z+d.fold.pivot.z)*.5-d.gripL.pos.z)*.15*blend;
   return ch.weapon.off.localToWorld(shaft).distanceTo(bone.localToWorld(palm));}
  const wrist=d[side].pos.clone();if(side==='handR'&&d.modelId==='roller'&&Number.isFinite(ch._s3RollerRightAdvance))wrist.z+=ch._s3RollerRightAdvance;
  return ch.weapon.off.localToWorld(wrist).distanceTo(bone.getWorldPosition(new T.Vector3()));};
 window.collectRollerMetrics=()=>{const ch=G.local.character,point=new T.Vector3();let vertexLowest=Infinity,vertices=0;
  ch.weapon.drum.traverse(mesh=>{const p=mesh.geometry?.attributes.position;if(!p)return;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);vertexLowest=Math.min(vertexLowest,point.y-G.local.pos.y);vertices++;}});
  return{gripGap:[gap(ch,'handR'),gap(ch,'handL')],vertexLowest,vertices,kidTransform:{position:ch.kid.position.toArray(),q:ch.kid.quaternion.toArray(),scale:ch.kid.scale.toArray()},
   liveFold:ch.weapon.fold?{position:ch.weapon.fold.position.toArray(),q:ch.weapon.fold.quaternion.toArray()}:null,handQuaternion:ch.bones.handR.getWorldQuaternion(new T.Quaternion()).toArray()};};
 window.intermediateFrames=[];
}
