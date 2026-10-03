# mkp.py NAME '{"tuck":{...}, "neck":{"mm":3,"y":[-112,-100,-72,-62]}}' -> /tmp/inkjaw-work/p_NAME.json (from the repo params)
import json, sys
p=json.load(open('/tmp/inkjaw/tools/inkwave-modeler/analysis/face_volume/params.json'))
a=json.loads(sys.argv[2])
i=[k for k,s in enumerate(p['steps']) if s['name']=='jaw_tuck'][0]
p['steps'][i].update(a.get('tuck',{}))
if a.get('neck'):
    p['steps'].insert(i, dict({"name":"neck_widen","kind":"neck_widen","after_delta_smooth":True},**a['neck']))
json.dump(p,open(f'/tmp/inkjaw-work/p_{sys.argv[1]}.json','w'),indent=1)
