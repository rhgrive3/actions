# addstep.py NAME '[steps]' BEFORE_STEP : insert steps into p_NAME.json before the named step
import json, sys
f=f'/tmp/inkjaw-work/p_{sys.argv[1]}.json'; p=json.load(open(f))
i=[k for k,s in enumerate(p['steps']) if s['name']==sys.argv[3]][0]
for st in reversed(json.loads(sys.argv[2])): p['steps'].insert(i, st)
json.dump(p,open(f,'w'),indent=1)
