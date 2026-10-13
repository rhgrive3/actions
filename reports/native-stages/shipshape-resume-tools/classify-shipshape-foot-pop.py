import json,math,struct,hashlib
from pathlib import Path
v=json.loads(Path('.ci-scratch/shipshape-source-foot-pop-2456.json').read_text())
root=Path('.codex-stage-sources/generated/shipshape');i=34778
with (root/'collision.bin').open('rb') as f:f.seek(i*36);raw=f.read(36)
a,b,c=[tuple(struct.unpack('<9f',raw)[j:j+3]) for j in (0,3,6)]
sub=lambda a,b:tuple(x-y for x,y in zip(a,b))
add=lambda a,b:tuple(x+y for x,y in zip(a,b))
mul=lambda a,t:tuple(x*t for x in a)
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
clamp=lambda x:max(0,min(1,x))
cross=lambda a,b:(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def point_tri(p,a,b,c):
 ab,ac,ap=sub(b,a),sub(c,a),sub(p,a);d1,d2=dot(ab,ap),dot(ac,ap)
 if d1<=0 and d2<=0:return a
 bp=sub(p,b);d3,d4=dot(ab,bp),dot(ac,bp)
 if d3>=0 and d4<=d3:return b
 vc=d1*d4-d3*d2
 if vc<=0 and d1>=0 and d3<=0:return add(a,mul(ab,d1/(d1-d3)))
 cp=sub(p,c);d5,d6=dot(ab,cp),dot(ac,cp)
 if d6>=0 and d5<=d6:return c
 vb=d5*d2-d1*d6
 if vb<=0 and d2>=0 and d6<=0:return add(a,mul(ac,d2/(d2-d6)))
 va=d3*d6-d5*d4
 if va<=0 and d4-d3>=0 and d5-d6>=0:return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))))
 den=1/(va+vb+vc);return add(a,add(mul(ab,vb*den),mul(ac,vc*den)))
def seg_dist(a,b,c,d):
 u,v,w=sub(b,a),sub(d,c),sub(a,c);aa,bb,cc,dd,ee=dot(u,u),dot(u,v),dot(v,v),dot(u,w),dot(v,w)
 den=aa*cc-bb*bb;s=clamp((bb*ee-cc*dd)/den) if den else 0;t=(bb*s+ee)/cc
 if t<0:t=0;s=clamp(-dd/aa)
 elif t>1:t=1;s=clamp((bb-dd)/aa)
 delta=sub(add(a,mul(u,s)),add(c,mul(v,t)));return dot(delta,delta)
def distance(p):
 radius,lift,height=v['body']['radius'],v['body']['lift'],v['body']['height']
 lo=add(p,(0,lift+radius,0));hi=add(p,(0,max(lift+radius,height-radius),0));normal=cross(sub(b,a),sub(c,a));den=dot(normal,sub(hi,lo))
 if abs(den)>1e-16:
  t=dot(normal,sub(a,lo))/den
  if 0<=t<=1:
   q=add(lo,mul(sub(hi,lo),t));near=point_tri(q,a,b,c)
   if dot(sub(q,near),sub(q,near))<1e-24:return 0
 return math.sqrt(min(dot(sub(p,point_tri(p,a,b,c)),sub(p,point_tri(p,a,b,c))) for p in (lo,hi)) if False else min([dot(sub(p,point_tri(p,a,b,c)),sub(p,point_tri(p,a,b,c))) for p in (lo,hi)]+[seg_dist(lo,hi,x,y) for x,y in [(a,b),(b,c),(c,a)]]))
poses={'committedBefore':v['previous'],'proposedBeforeBody':v['colliderCalls'][0]['before'],'resolvedBody':v['colliderCalls'][0]['after'],'committedAfterFeet':v['position']}
distances={k:distance(p) for k,p in poses.items()}
assert abs(distances['proposedBeforeBody']-v['sourceContacts'][0]['submittedDistance'])<1e-10
assert distances['committedBefore']>=.347 and distances['resolvedBody']>=.3499
assert .34<=distances['committedAfterFeet']<.347
proof={'sourceTriangle':i,'sourceRole':v['sourceContacts'][0]['object'],'sourceFlags':3,'sourceFace':13396,'sourceFieldBytes':36,'sourceTriangleBytesSha256':hashlib.sha256(raw).hexdigest(),'tick':v['tick'],'body':v['body'],'distancesToOriginalTriangle':distances,'nativeContactThreshold':.35-.0001,'defaultFitThreshold':.35-.01,'strictFitThreshold':.35-.003,'footRaiseSourceRawUnits':v['position'][1]-v['colliderCalls'][0]['after'][1],'nativeBodyResolvedBeforeFeet':True,'afterFeetWithinNativeContactThreshold':distances['committedAfterFeet']<.3499,'defaultFitAfterFeet':True,'strictFitAfterFeet':False,'candidateJumpRegressionClaim':False,'retailUnitsVerified':False,'scope':'Independent exact original triangle read and capsule-axis distance calculation; same current baseline post-foot pose, no second GPU and no runtime/physics/source changes'}
Path('.ci-scratch/shipshape-independent-foot-pop.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
