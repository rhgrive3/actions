# mkp2.py NAME BASE '[extra steps inserted before jaw_tuck]'
import json, sys
p=json.load(open(f'/tmp/inkjaw-work/p_{sys.argv[2]}.json'))
i=[k for k,s in enumerate(p['steps']) if s['name']=='jaw_tuck'][0]
for st in reversed(json.loads(sys.argv[3])): p['steps'].insert(i, st)
json.dump(p,open(f'/tmp/inkjaw-work/p_{sys.argv[1]}.json','w'),indent=1)
