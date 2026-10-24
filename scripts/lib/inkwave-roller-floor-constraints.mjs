// Read-only replay of the EXISTING noncontact right-wrist floor/left-reach
// evaluation. Diagnostic only; never imported by the production runtime.
import*as T from '../../inkwave-public/vendor/three/build/three.module.js';
const V=a=>new T.Vector3().fromArray(a),Q=a=>new T.Quaternion().fromArray(a),clamp=x=>Math.max(-1,Math.min(1,x));
export function floorEvaluator(context,targetInput){
 const c=context,dR=V(c.handR.pos),dL=V(c.handL.pos),invHand=Q(c.handR.q).invert(),
 right=V(c.right.origin),left=V(c.left.origin),target=V(targetInput),delta=target.clone().sub(right);
 if(delta.length()>c.right.reach)target.copy(right).add(delta.setLength(c.right.reach));
 const kidQ=Q(c.kid.q),scale=V(c.kid.scale),kidP=V(c.kid.position),base=V(c.drumAt);base.x+=c.bound.centerX;
 if(c.fold)base.sub(V(c.fold.pos)).applyQuaternion(Q(c.fold.q)).add(V(c.fold.pos));
 base.sub(dR);
 function align(q){
  if(!c.armLeftHeld)return;
  const weaponQ=q.clone().multiply(invHand),delta=dL.clone().sub(dR).applyQuaternion(weaponQ),toLeft=left.clone().sub(target),
   a=delta.length(),b=toLeft.length();if(a<1e-7||b<1e-7)return;
  const now=Math.acos(clamp(delta.dot(toLeft)/(a*b))),allowable=Math.acos(clamp((a*a+b*b-c.left.reach*c.left.reach)/(2*a*b)));
  if(now<=allowable)return;const axis=delta.clone().cross(toLeft);if(axis.lengthSq()<1e-12)return;
  q.premultiply(new T.Quaternion().setFromAxisAngle(axis.normalize(),now-allowable+.003));
 }
 function bottom(q){
  const weaponQ=q.clone().multiply(invHand),center=base.clone().applyQuaternion(weaponQ).add(target).multiply(scale).applyQuaternion(kidQ).add(kidP),
   x=new T.Vector3(1,0,0).applyQuaternion(weaponQ).multiply(scale).applyQuaternion(kidQ),
   y=new T.Vector3(0,1,0).applyQuaternion(weaponQ).multiply(scale).applyQuaternion(kidQ),
   z=new T.Vector3(0,0,1).applyQuaternion(weaponQ).multiply(scale).applyQuaternion(kidQ);
  return center.y+c.shoulderShift[1]-c.bound.halfWidth*Math.abs(x.y)-c.bound.radius*Math.hypot(y.y,z.y);
 }
 return (input,{applyAlign=true}={})=>{const q=Q(input);if(applyAlign)align(q);const floor=c.neededGround?bottom(q):.1;
  const weaponQ=q.clone().multiply(invHand),leftTarget=dL.clone().sub(dR).applyQuaternion(weaponQ).add(target);
  return{q:q.toArray(),floor,error:Math.max(0,-.002-floor),target:target.toArray(),rightReachError:Math.max(0,target.distanceTo(right)-c.right.reach),leftReachError:Math.max(0,leftTarget.distanceTo(left)-c.left.reach)};
 };
}
