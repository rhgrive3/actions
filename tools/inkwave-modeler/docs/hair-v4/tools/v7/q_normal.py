import bpy
g=bpy.data.objects['V7_bangs'].modifiers[0].node_group
n=[x for x in g.nodes if x.bl_idname=='GeometryNodeSetCurveNormal'][0]
props={p.identifier:str(getattr(n,p.identifier)) for p in n.bl_rna.properties if p.identifier not in ('rna_type','inputs','outputs','internal_links','dimensions','location','width','width_hidden','height','parent','color','name','label','select','show_options','show_preview','hide','mute','show_texture','bl_idname','bl_label','bl_description','bl_icon','bl_static_type','bl_width_default','bl_width_min','bl_width_max','bl_height_default','bl_height_min','bl_height_max','type','use_custom_color','location_absolute','warning_propagation','is_active_output','color_tag')}
__result__=dict(props=props,inputs=[(s.name,s.is_linked,str(getattr(s,'default_value',''))) for s in n.inputs])
