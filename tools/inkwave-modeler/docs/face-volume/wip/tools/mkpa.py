# mkpa.py NAME '{"<step name>":{...}, "@<top key>":{...}}' : repo params with these updates -> p_NAME.json
import json, sys
p=json.load(open('/tmp/inkjaw/tools/inkwave-modeler/analysis/face_volume/params.json'))
for k,v in json.loads(sys.argv[2]).items():
    if k.startswith('@'): p[k[1:]].update(v)
    else: [s for s in p['steps'] if s['name']==k][0].update(v)
json.dump(p,open(f'/tmp/inkjaw-work/p_{sys.argv[1]}.json','w'),indent=1)
