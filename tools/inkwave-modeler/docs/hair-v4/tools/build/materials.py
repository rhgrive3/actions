# 仕上げのマテリアル（Cycles 用）。形は変えない。
import bpy
def new(name):
    m=bpy.data.materials.get(name)
    if m is None: m=bpy.data.materials.new(name)
    m.use_nodes=True; nt=m.node_tree; nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputMaterial'); b=nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0],out.inputs[0])
    return m,nt,b
def setin(b,**kw):
    for k,v in kw.items():
        k=k.replace('_',' ')
        if k in b.inputs: b.inputs[k].default_value=v
def ramp(nt,stops):
    r=nt.nodes.new('ShaderNodeValToRGB'); e=r.color_ramp.elements
    e[0].position,e[0].color=stops[0][0],(*stops[0][1],1); e[1].position,e[1].color=stops[-1][0],(*stops[-1][1],1)
    for p,c in stops[1:-1]: x=e.new(p); x.color=(*c,1)
    return r
def gel(name,stops,spots=False,viewport=(0.05,0.55,0.62)):
    m,nt,b=new(name); N=nt.nodes; L=nt.links
    at=N.new('ShaderNodeAttribute'); at.attribute_name='hair_t'; at.attribute_type='GEOMETRY'
    r=ramp(nt,stops); L.new(at.outputs['Fac'],r.inputs[0]); col=r.outputs[0]
    if spots:
        tc=N.new('ShaderNodeTexCoord'); vo=N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value=22.0
        if 'Randomness' in vo.inputs: vo.inputs['Randomness'].default_value=0.85
        L.new(tc.outputs['Object'],vo.inputs['Vector'])
        # 水玉の大きさ: セルごとの乱数で 0.16〜0.30
        sep=N.new('ShaderNodeSeparateColor'); L.new(vo.outputs['Color'],sep.inputs[0])
        mr=N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value=0.28; mr.inputs['To Max'].default_value=0.42; L.new(sep.outputs[0],mr.inputs['Value'])
        cmp=N.new('ShaderNodeMath'); cmp.operation='LESS_THAN'; L.new(vo.outputs['Distance'],cmp.inputs[0]); L.new(mr.outputs[0],cmp.inputs[1])
        tm=N.new('ShaderNodeMapRange'); tm.inputs['From Min'].default_value=0.12; tm.inputs['From Max'].default_value=0.30; L.new(at.outputs['Fac'],tm.inputs['Value'])
        mk=N.new('ShaderNodeMath'); mk.operation='MULTIPLY'; L.new(cmp.outputs[0],mk.inputs[0]); L.new(tm.outputs[0],mk.inputs[1])
        mix=N.new('ShaderNodeMix'); mix.data_type='RGBA'; L.new(mk.outputs[0],mix.inputs['Factor']); L.new(col,mix.inputs[6]); mix.inputs[7].default_value=(0.90,1.0,0.72,1)
        col=mix.outputs[2]
        L.new(mk.outputs[0],b.inputs['Emission Strength']) if 'Emission Strength' in b.inputs else None
        if 'Emission Color' in b.inputs: b.inputs['Emission Color'].default_value=(0.55,0.85,0.35,1)
    L.new(col,b.inputs['Base Color'])
    if 'Subsurface Weight' in b.inputs: b.inputs['Subsurface Weight'].default_value=0.08; b.inputs['Subsurface Radius'].default_value=(0.4,0.9,0.8)
    if 'Subsurface Scale' in b.inputs: b.inputs['Subsurface Scale'].default_value=0.02
    setin(b,Roughness=0.14,Coat_Weight=0.8,Coat_Roughness=0.04,Transmission_Weight=0.04,IOR=1.45)
    m.diffuse_color=(*viewport,1); return m
TEAL=(0.008,0.29,0.38); TEAL2=(0.018,0.45,0.53); GRN=(0.12,0.62,0.40); LIME=(0.56,0.93,0.10); PALE=(0.72,0.96,0.30)
M_TAIL=gel('V4_hair',[(0.0,TEAL),(0.45,TEAL2),(0.72,GRN),(0.98,LIME)])
M_CROWN=gel('V4_hair_crown',[(0.0,TEAL2),(1.0,TEAL)])
M_BANG=gel('V4_hair_bangs',[(0.0,TEAL),(0.42,TEAL2),(0.62,GRN),(0.82,LIME),(1.0,PALE)])
M_FIN=gel('V4_hair_fin',[(0.0,GRN),(0.45,LIME),(1.0,PALE)],spots=True,viewport=(0.5,0.85,0.25))
# なでつけた層: 青緑 + うすいひし形の線（斜めの Wave 2 本）
m,nt,b=new('V4_hair_slick'); N=nt.nodes; L=nt.links
tc=N.new('ShaderNodeTexCoord'); w=[]
for rot in (0.8,-0.8):
    mp=N.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value=(0,rot,0.6*rot); L.new(tc.outputs['Object'],mp.inputs['Vector'])
    wv=N.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value=26.0; wv.inputs['Distortion'].default_value=0.0; L.new(mp.outputs[0],wv.inputs['Vector']); w.append(wv)
mx=N.new('ShaderNodeMath'); mx.operation='MAXIMUM'; L.new(w[0].outputs['Fac'],mx.inputs[0]); L.new(w[1].outputs['Fac'],mx.inputs[1])
th=N.new('ShaderNodeMapRange'); th.inputs['From Min'].default_value=0.94; th.inputs['From Max'].default_value=0.99; th.inputs['To Max'].default_value=0.5; L.new(mx.outputs[0],th.inputs['Value'])
mix=N.new('ShaderNodeMix'); mix.data_type='RGBA'; L.new(th.outputs[0],mix.inputs['Factor']); mix.inputs[6].default_value=(*TEAL2,1); mix.inputs[7].default_value=(0.35,0.62,0.66,1)
L.new(mix.outputs[2],b.inputs['Base Color']); setin(b,Roughness=0.16,Coat_Weight=0.6,Coat_Roughness=0.05); m.diffuse_color=(0.04,0.45,0.52,1)
# 剃った部分: 灰色がかった肌 + 細かい点
m,nt,b=new('V4_stubble'); N=nt.nodes; L=nt.links
nz=N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value=1.0; nz.inputs['Detail'].default_value=2.0
tcs=N.new('ShaderNodeTexCoord'); mps=N.new('ShaderNodeMapping'); mps.inputs['Scale'].default_value=(480,480,32); mps.inputs['Rotation'].default_value=(0,0.6,0); L.new(tcs.outputs['Object'],mps.inputs['Vector']); L.new(mps.outputs[0],nz.inputs['Vector'])
nz2=N.new('ShaderNodeMapRange'); nz2.inputs['From Min'].default_value=0.5; nz2.inputs['From Max'].default_value=0.62
mix=N.new('ShaderNodeMix'); mix.data_type='RGBA'; L.new(nz.outputs['Fac'],nz2.inputs['Value']); L.new(nz2.outputs[0],mix.inputs['Factor']); mix.inputs[6].default_value=(0.50,0.25,0.14,1); mix.inputs[7].default_value=(0.16,0.26,0.30,1)
L.new(mix.outputs[2],b.inputs['Base Color']); setin(b,Roughness=0.75); m.diffuse_color=(0.55,0.52,0.50,1)
m,nt,b=new('V4_hair_silver'); setin(b,Base_Color=(0.70,0.78,0.80,1),Roughness=0.15,Coat_Weight=0.6); m.diffuse_color=(0.78,0.84,0.86,1)
m,nt,b=new('V4_cuff_black'); setin(b,Base_Color=(0.014,0.014,0.016,1),Roughness=0.42,Coat_Weight=0.3); m.diffuse_color=(0.05,0.05,0.055,1)
m,nt,b=new('V4_buckle_metal'); setin(b,Base_Color=(0.62,0.63,0.65,1),Roughness=0.25,Metallic=1.0); m.diffuse_color=(0.7,0.7,0.72,1)
# 割り当て
def assign(obj,mat):
    o=bpy.data.objects.get(obj)
    if o: o.data.materials.clear(); o.data.materials.append(bpy.data.materials[mat])
for o,mn in [('V4_tail_L','V4_hair'),('V4_tail_R','V4_hair'),('V4_fins','V4_hair_fin'),('V4_crown','V4_hair_crown'),('V4_bangs','V4_hair_bangs'),('V4_silver','V4_hair_silver'),('V4_scalp','V4_hair_slick'),('V4_stubble','V4_stubble')]:
    assign(o,mn)
__result__='ok'
