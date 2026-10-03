# 毛束用 Geometry Nodes: 曲線 → (法線 = 頭の中心から外) → 平たい楕円の断面で Curve to Mesh（太さ = 点の radius）
# → 'hair_t'（根元 0 → 先 1）を保存 → なめらか表示。
import bpy
def clump_group():
    g=bpy.data.node_groups.get('V4_clump')
    if g: bpy.data.node_groups.remove(g)
    g=bpy.data.node_groups.new('V4_clump','GeometryNodeTree')
    g.interface.new_socket('Geometry',in_out='INPUT',socket_type='NodeSocketGeometry')
    f=g.interface.new_socket('Flat',in_out='INPUT',socket_type='NodeSocketFloat'); f.default_value=0.6
    c=g.interface.new_socket('Center',in_out='INPUT',socket_type='NodeSocketVector'); c.default_value=(0.004,0.02,1.39)
    r=g.interface.new_socket('Res',in_out='INPUT',socket_type='NodeSocketInt'); r.default_value=14
    fx=g.interface.new_socket('FlatX',in_out='INPUT',socket_type='NodeSocketFloat'); fx.default_value=1.0
    g.interface.new_socket('Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    N=g.nodes; L=g.links
    gi=N.new('NodeGroupInput'); go=N.new('NodeGroupOutput')
    pos=N.new('GeometryNodeInputPosition')
    sub=N.new('ShaderNodeVectorMath'); sub.operation='SUBTRACT'
    L.new(pos.outputs[0],sub.inputs[0]); L.new(gi.outputs['Center'],sub.inputs[1])
    nrm=N.new('ShaderNodeVectorMath'); nrm.operation='NORMALIZE'; L.new(sub.outputs[0],nrm.inputs[0])
    scn=N.new('GeometryNodeSetCurveNormal')
    try: scn.mode='FREE'
    except Exception: pass
    if 'Mode' in scn.inputs:
        try: scn.inputs['Mode'].default_value='Free'
        except Exception: pass
    L.new(gi.outputs['Geometry'],scn.inputs['Curve'])
    if 'Normal' in scn.inputs: L.new(nrm.outputs[0],scn.inputs['Normal'])
    sp=N.new('GeometryNodeSplineParameter')
    cap=N.new('GeometryNodeCaptureAttribute')
    try:
        cap.capture_items.new('FLOAT','t')
    except Exception: pass
    L.new(scn.outputs[0],cap.inputs[0]); L.new(sp.outputs['Factor'],cap.inputs['t'])
    rad=N.new('GeometryNodeInputRadius')
    circ=N.new('GeometryNodeCurvePrimitiveCircle'); L.new(gi.outputs['Res'],circ.inputs['Resolution']); circ.inputs['Radius'].default_value=1.0
    comb=N.new('ShaderNodeCombineXYZ'); comb.inputs[2].default_value=1.0; L.new(gi.outputs['Flat'],comb.inputs[0]); L.new(gi.outputs['FlatX'],comb.inputs[1])   # X = 外向き（法線）= 厚み, Y = 幅
    tr=N.new('GeometryNodeTransform'); L.new(circ.outputs[0],tr.inputs[0]); L.new(comb.outputs[0],tr.inputs['Scale'])
    c2m=N.new('GeometryNodeCurveToMesh'); L.new(cap.outputs[0],c2m.inputs['Curve']); L.new(tr.outputs[0],c2m.inputs['Profile Curve'])
    L.new(rad.outputs[0],c2m.inputs['Scale']); c2m.inputs['Fill Caps'].default_value=True
    st=N.new('GeometryNodeStoreNamedAttribute'); st.data_type='FLOAT'; st.domain='POINT'; st.inputs['Name'].default_value='hair_t'
    L.new(c2m.outputs[0],st.inputs['Geometry']); L.new(cap.outputs['t'],st.inputs['Value'])
    sm=N.new('GeometryNodeSetShadeSmooth'); L.new(st.outputs[0],sm.inputs[0])
    L.new(sm.outputs[0],go.inputs[0])
    return g
