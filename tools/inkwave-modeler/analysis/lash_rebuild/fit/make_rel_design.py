"""blender -b A.blend --python make_rel_design.py -- <out.json>
Lashes and the wing keep the reference's 3D shape (triangulated vectors), attached to the model's lid:
  lash tip = model root + (ref tip - ref root); wing tip = model root 1 + (ref wing tip - ref root 1), put on the
  front ray of the design tip (front view unchanged).  The band stays on the lid; only the wing stands off."""
import sys, json
sys.path.insert(0,'/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/scripts')
import numpy as np, bpy
import inkwave_lash_rebuild as lr
EV='/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929'
d=json.load(open(str(lr.er.ROOT/'analysis/lash_rebuild/design.json')));T=json.load(open(f'{EV}/lr/tri_lashes.json'))
rays=lr.FrontRays(lr.surface_tree(),lr.shell_tree())
out=sys.argv[sys.argv.index('--')+1]
LASH_GAIN=1.3   # the front reference sits ~2 px above the 3/4 and side views: triangulated lashes come out short in front
roots=[]
for i,k in enumerate(('1','2','3')):
    spec=d['lashes'][i]
    rm=rays.lifted(spec['root'],lr.LASH_ROOT_LIFT_MM)
    vec=LASH_GAIN*(np.array(T['L'+k]['local_mm'])-np.array(T['R'+k]['local_mm']))
    spec['tip3d_mm']=(rm+vec).tolist();roots.append(rm)
    print('LASH',k,'vector mm',np.round(vec,1).tolist(),'length',round(float(np.linalg.norm(vec)),1))
d['lashes'][3]['standoff_mm']=3.0
W=roots[0]+np.array(T['wing']['local_mm'])-np.array(T['R1']['local_mm'])
top=np.array(d['liner_top']);tip=top[0]
p,dd,t=rays.cast(*tip);o=p-dd*t
Wm=lr.M.to_world(W[None]/1000)[0];tt=float(np.dot(Wm-o,dd))
ft_tip=(rays.near(*tip)-tt)*1000-lr.LINER_LIFT_MM
print('WING stand-off along the front ray mm',round(ft_tip,1),'miss mm',round(float(np.linalg.norm(o+dd*tt-Wm))*1000,1))
r1x=d['lashes'][0]['root'][0]
ft=ft_tip*np.clip((r1x-top[:,0])/(r1x-tip[0]),0,1)**1.3
bot=np.array(d['liner_bottom']);k1=int(np.argmax(bot[:,1]>lr.corner_join(lr.rim_pixels())[1]-14.0))
seg=np.r_[0,np.cumsum(np.linalg.norm(np.diff(bot[:k1+1],axis=0),axis=1))];s=seg/seg[-1]
d['float_top']=ft.tolist();d['float_wing']=(ft_tip*(1-s)**1.3).tolist();d['float_k1']=k1
d['lower_standoff_mm']=1.5
json.dump(d,open(out,'w'));print('DESIGN',out)
