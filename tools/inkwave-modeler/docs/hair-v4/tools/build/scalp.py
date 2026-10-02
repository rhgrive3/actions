# 頭皮の層（髪の殻）と剃った部分（短い毛の殻）。HEAD_face の形を写した別物体。HEAD_face は変えない。
exec(open(V4+'common.py').read())
C=col(); clear('V4_scalp'); clear('V4_stubble')
HC=np.array([0.004,0.02,1.39])
def zb_hair(phi):          # 髪の下の縁（phi: 正面 0°、横 ±90°、後ろ 180°）
    a=abs(phi)
    z=np.interp(a,[0,25,49,76,95,110,130,150,180],[1.47,1.47,1.452,1.428,1.402,1.382,1.375,1.375,1.378])   # 横の参照から測った値（耳の上を下げた）
    if a>125: z+=0.010*(1-abs(((a/7.0)%2)-1))*2-0.010      # 後ろのギザギザ
    return z
def zb_stub(phi):          # 剃った部分の下の縁（耳の上 → 襟足）
    a=abs(phi)
    return np.interp(a,[0,38,50,70,85,110,140,180],[9,9,1.43,1.385,1.362,1.35,1.32,1.30])
def region(pred,name,thick,disp,material):
    src=bpy.data.objects['HEAD_face']; dg=bpy.context.evaluated_depsgraph_get()
    me=bpy.data.meshes.new_from_object(src.evaluated_get(dg)); me.transform(src.matrix_world)
    bm=bmesh.new(); bm.from_mesh(me)
    kill=[v for v in bm.verts if not pred(np.array(v.co))]
    bmesh.ops.delete(bm,geom=kill,context='VERTS')
    # 面が 2 つ未満の頂点を消す（とげの元）→ 小さい島を消す
    for _ in range(3):
        bad=[v for v in bm.verts if len(v.link_faces)<2]
        if not bad: break
        bmesh.ops.delete(bm,geom=bad,context='VERTS')
    bm.faces.ensure_lookup_table(); seen=set(); small=[]
    for f in bm.faces:
        if f.index in seen: continue
        isl=[f]; seen.add(f.index); k=0
        while k<len(isl):
            for e in isl[k].edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); isl.append(g)
            k+=1
        if len(isl)<80: small+=isl
    if small: bmesh.ops.delete(bm,geom=list(set(small)),context='FACES')
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    # 縁の頂点（2 周分）
    edge=set()
    for e in bm.edges:
        if e.is_boundary: edge.update(v.index for v in e.verts)
    ring=set(edge)
    for v in bm.verts:
        if v.index in edge:
            for e in v.link_edges: ring.add(e.other_vert(v).index)
    bm.to_mesh(me); bm.free()
    o=bpy.data.objects.new(name,me); C.objects.link(o)
    vg=o.vertex_groups.new(name='edge'); vg.add(sorted(ring),1.0,'REPLACE')
    es=o.modifiers.new('EdgeSmooth','SMOOTH'); es.vertex_group='edge'; es.iterations=25; es.factor=0.9
    sw=o.modifiers.new('OnHead','SHRINKWRAP'); sw.target=src; sw.wrap_method='NEAREST_SURFACEPOINT'
    for p in me.polygons: p.use_smooth=True
    d=o.modifiers.new('Offset','DISPLACE'); d.strength=disp; d.mid_level=0.0
    s=o.modifiers.new('Smooth','SMOOTH'); s.iterations=2; s.factor=0.3
    so=o.modifiers.new('Solidify','SOLIDIFY'); so.thickness=thick; so.offset=1.0; so.use_even_offset=False; so.thickness_clamp=1.0
    sd=o.modifiers.new('Subsurf','SUBSURF'); sd.levels=1; sd.render_levels=1
    me.materials.clear(); me.materials.append(material)
    for p in me.polygons: p.material_index=0
    return o
def phi_of(p):
    q=p-HC; return np.degrees(np.arctan2(q[0],-q[1]))
def is_face(p):              # 顔は除く
    return abs(phi_of(p))<45 and p[2]<1.468
def hair_pred(p): return (p[2]>zb_hair(phi_of(p))) and not is_face(p)
def stub_pred(p):
    ph=phi_of(p); return p[2]>zb_stub(ph)-0.008 and p[2]<zb_hair(ph)+0.02 and not is_face(p)
HM=bpy.data.materials.get('V4_hair_slick') or mat('V4_hair_slick',(0.02,0.36,0.42),0.15)
SM=bpy.data.materials.get('V4_stubble') or mat('V4_stubble',(0.42,0.43,0.45),0.8)
a=region(hair_pred,'V4_scalp',0.004,0.0015,HM)
b=region(stub_pred,'V4_stubble',0.0008,0.0006,SM)
__result__=(len(a.data.vertices),len(b.data.vertices))
