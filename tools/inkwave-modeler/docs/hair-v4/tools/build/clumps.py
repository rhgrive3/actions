# 毛束データ（JSON）→ Bezier 曲線オブジェクト + V4_clump GN。
import bpy, json, numpy as np
exec(open(V4+'common.py').read()); exec(open(V4+'gn.py').read())
G=clump_group()
def make(name,clumps,flat,material,center=(0.004,0.02,1.39),res=14,flatx=1.0):
    clear(name)
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=globals().get('RESU',10)
    for cl in clumps:
        P=np.array(cl['p'],float); R=np.array(cl['r'],float)
        s=cu.splines.new('BEZIER'); s.bezier_points.add(len(P)-1)
        for bp,p,r in zip(s.bezier_points,P,R):
            bp.co=p; bp.handle_left_type='AUTO'; bp.handle_right_type='AUTO'; bp.radius=r
    o=bpy.data.objects.new(name,cu); col().objects.link(o)
    g=bpy.data.node_groups.get('V4_clump_'+name)
    if g: bpy.data.node_groups.remove(g)
    g=G.copy(); g.name='V4_clump_'+name
    for it in g.interface.items_tree:
        if getattr(it,'in_out','')=='INPUT':
            if it.name=='Flat': it.default_value=flat
            if it.name=='Center': it.default_value=center
            if it.name=='Res': it.default_value=res
            if it.name=='FlatX': it.default_value=flatx
    m=o.modifiers.new('V4_clump','NODES'); m.node_group=g
    o.data.materials.append(material)
    return o
