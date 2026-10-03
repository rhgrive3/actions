# 尻尾の留め具（カフ）: 頭の横に沿って曲がった平たい袖。中を平たい髪の束が前→後ろに通る。
# 外側の面 = 測った線 S（シート 5 方向）。内側の面 = S を頭の内側へ TB だけ。輪 = 外→上の端→内→下の端。
# 輪を束の向き B（= T×N, 後ろ向き）に幅 W だけ押し出し → Solidify + Bevel。外側の面にバックル 2 個。
exec(open(V4+'common.py').read())
C=col(); clear('V4_cuff'); clear('V4_buckle')
BLK=mat('V4_cuff_black',(0.016,0.016,0.018),0.4); MET=mat('V4_buckle_metal',(0.62,0.63,0.65),0.28,1.0)
SP=np.load(V4+'spine.npy'); HC=np.array([0.004,0.02,1.39])
TB=0.022; W=0.032; TH=0.0035
def frames(P):
    T=np.gradient(P,axis=0); T/=np.linalg.norm(T,axis=1,keepdims=True)
    N=P-HC; N/=np.linalg.norm(N,axis=1,keepdims=True); N-=(N*T).sum(1,keepdims=True)*T; N/=np.linalg.norm(N,axis=1,keepdims=True)
    B=np.cross(T,N); B*=np.sign(B[:,1:2])
    a=np.radians(globals().get('ROT',0.0))
    N2=np.cos(a)*N-np.sin(a)*B; B2=np.sin(a)*N+np.cos(a)*B
    return T,N2,B2
def build(side,S):
    T,N,B=frames(S); n=len(S)
    outer=S; inner=S-N*TB
    def cap(i,sgn):   # 端の半円: 外→内
        c=(outer[i]+inner[i])/2; r=TB/2
        return [c+N[i]*r*np.cos(a)+T[i]*sgn*r*np.sin(a) for a in np.linspace(0,np.pi,9)[1:-1]]
    loop=list(outer)+cap(n-1,1)+list(inner[::-1])+cap(0,-1)[::-1]
    Bl=[B[min(n-1,max(0,i))] for i in range(n)]
    Bloop=list(B)+[B[-1]]*7+list(B[::-1])+[B[0]]*7
    me=bpy.data.meshes.new('V4_cuff_'+side); bm=bmesh.new(); K=len(loop)
    L_=[bm.verts.new(Vector(p-b*W/2)) for p,b in zip(loop,Bloop)]; R_=[bm.verts.new(Vector(p+b*W/2)) for p,b in zip(loop,Bloop)]
    for k in range(K): bm.faces.new((L_[k],L_[(k+1)%K],R_[(k+1)%K],R_[k]))
    bm.normal_update(); cen=Vector(((outer+inner)/2).mean(0))
    for f in bm.faces:
        # 外向き = 輪の中心線（外と内の中間）から離れる向き
        mid=f.calc_center_median()
        if f.normal.dot(mid-cen)<0 and False: f.normal_flip()
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o=bpy.data.objects.new('V4_cuff_'+side,me); C.objects.link(o)
    sd=o.modifiers.new('Solidify','SOLIDIFY'); sd.thickness=TH; sd.offset=1.0
    bv=o.modifiers.new('Bevel','BEVEL'); bv.width=0.0012; bv.segments=3; bv.limit_method='ANGLE'
    o.data.materials.append(BLK)
    for pp in o.data.polygons: pp.use_smooth=True
    for j,i in enumerate([int(n*0.55),int(n*0.88)]):
        pos=outer[i]+N[i]*(TH+0.0005)
        mb=bpy.data.meshes.new(f'V4_buckle_{side}{j}'); bm=bmesh.new()
        def box(cx,cy,cz,sx,sy,sz):
            r=bmesh.ops.create_cube(bm,size=1.0)
            for v in r['verts']: v.co=Vector((cx+v.co.x*sx,cy+v.co.y*sy,cz+v.co.z*sz))
        A_,B_,T_,H_=0.020,0.013,0.0028,0.0032
        box(0,(B_-T_)/2,H_/2,A_,T_,H_); box(0,-(B_-T_)/2,H_/2,A_,T_,H_); box((A_-T_)/2,0,H_/2,T_,B_,H_); box(-(A_-T_)/2,0,H_/2,T_,B_,H_)
        box(0,0,H_*0.3,T_*0.9,B_,H_*0.6)
        bm.to_mesh(mb); bm.free()
        ob=bpy.data.objects.new(f'V4_buckle_{side}{j}',mb); C.objects.link(ob)
        ob.matrix_world=Matrix(((B[i][0],T[i][0],N[i][0],pos[0]),(B[i][1],T[i][1],N[i][1],pos[1]),(B[i][2],T[i][2],N[i][2],pos[2]),(0,0,0,1)))
        bb=ob.modifiers.new('Bevel','BEVEL'); bb.width=0.0006; bb.segments=2; ob.data.materials.append(MET)
    return dict(outer=outer.tolist(),inner=inner.tolist(),B=B.tolist(),N=N.tolist(),T=T.tolist())
iR=int(np.nonzero(SP[:,0]>-0.03)[0][0]); iL=int(np.nonzero(SP[:,0]>0.038)[0][0])
info={'R':build('R',SP[:iR]),'L':build('L',SP[iL:][::-1])}
import json; json.dump(info,open(V4+'cuff.json','w'))
__result__=(iR,iL,len(SP))
