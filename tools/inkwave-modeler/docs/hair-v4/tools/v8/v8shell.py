# 頭頂の殻: V4_scalp を写し、頭頂ほど外へふくらませる（頂点グループの重み × Displace）。留め具のまわりと顔の近くは 0。
import bpy, numpy as np
H=HMAX if 'HMAX' in dir() else 0.025
for n in ('V8_shell',):
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
src=bpy.data.objects['V4_scalp']
o=src.copy(); o.data=src.data.copy(); o.name='V8_shell'; bpy.data.collections['HAIR_V4'].objects.link(o)
for m in list(o.modifiers):
    if m.name in ('Offset','Solidify','Subsurf'): o.modifiers.remove(m)
V=np.array([o.matrix_world@v.co for v in o.data.vertices])
x,y,z=V[:,0]-0.004,V[:,1],V[:,2]
w=np.clip((z-1.43)/0.08,0,1)**0.8                 # 上ほど高い
w*=np.clip((0.085-np.abs(x))/0.035,0,1)            # 横（留め具のまわり）は 0
w*=np.clip((0.075-y)/0.04,0,1)                     # 後ろ（尻尾の根元）は 0
w*=np.clip((y+0.075)/0.03,0,1)**0.5                # 生え際のすぐ前は低く
vg=o.vertex_groups.get('puff') or o.vertex_groups.new(name='puff')
for i,wi in enumerate(w): vg.add([i],float(wi),'REPLACE')
d=o.modifiers.new('Puff','DISPLACE'); d.vertex_group='puff'; d.strength=H; d.mid_level=0.0
s=o.modifiers.new('PuffSmooth','SMOOTH'); s.iterations=20; s.factor=0.8
so=o.modifiers.new('Solidify','SOLIDIFY'); so.thickness=0.004; so.offset=-1.0; so.thickness_clamp=1.0
sd=o.modifiers.new('Subsurf','SUBSURF'); sd.levels=1; sd.render_levels=2
o.data.materials.clear(); o.data.materials.append(bpy.data.materials['V4_hair_crown'])
__result__=(float(w.max()),int((w>0.5).sum()),len(w))
