# 前髪・頭頂・横・後ろの束を作る
import json
exec(open(V4+'clumps.py').read()); exec(open(V4+'hairmat.py').read())
HM=bpy.data.materials.get('V4_hair') or hair_material()
BM=bpy.data.materials.get('V4_hair_bangs') or hair_material('V4_hair_bangs',0.35,0.92)
SLK=bpy.data.materials.get('V4_hair_slick')
SIL=bpy.data.materials.get('V4_hair_silver') or mat('V4_hair_silver',(0.72,0.78,0.80),0.2)
B=json.load(open(V4+'bangs.json')); H=json.load(open(V4+'head_clumps.json'))
make('V4_bangs',[dict(p=v['p'],r=v['r']) for v in B.values()],1.0,BM,flatx=0.42)
make('V4_crown',H['crown'],1.0,HM,flatx=0.5)
clear('V4_side')
make('V4_silver',H['silver'],1.0,SIL,flatx=0.5)
clear('V4_back')
__result__='ok'
