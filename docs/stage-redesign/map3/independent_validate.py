"""Review-only cross-check, independent of geometry.py and public game modules.

Run from this directory or anywhere. Loads only the isolated design builders.
Geometric rays are zero-width straight segments, not weapon/camera simulation.
"""
from pathlib import Path
import hashlib
import json
import math
import runpy

ROOT = Path(__file__).resolve().parent
EPS = 1e-8


def rect_overlap(a, b):
    q = [max(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), min(a[3], b[3])]
    return q if q[1] > q[0] + EPS and q[3] > q[2] + EPS else None


def within(r, x, z):
    return r[0] - EPS <= x <= r[1] + EPS and r[2] - EPS <= z <= r[3] + EPS


def linear(s):
    if 'y' in s:
        return (0., 0., s['y'])
    r = s['rect']
    lo, hi = (r[0], r[1]) if s['axis'] == 'x' else (r[2], r[3])
    slope = (s['y1'] - s['y0']) / (hi - lo)
    return (slope, 0., s['y0'] - slope * lo) if s['axis'] == 'x' else (0., slope, s['y0'] - slope * lo)


def top(s, x, z):
    a, b, c = linear(s)
    return a * x + b * z + c


def underside(s, x, z):
    return s['bottom'] if 'y' in s else top(s, x, z) - s.get('thickness', .6)


def surf(d):
    return d['floors'] + d['ramps']


def volume_interval(s, start, end, obstacle=False):
    """Exact line/convex-prism clipping for boxes and linear ramp slabs."""
    x, y, z = start
    dx, dy, dz = [b-a for a, b in zip(start, end)]
    r = s['rect']
    inequalities = [(x-r[0], dx), (r[1]-x, -dx), (z-r[2], dz), (r[3]-z, -dz)]
    if obstacle:
        inequalities += [(y-s['y0'], dy), (s['y1']-y, -dy)]
    else:
        a, b, c = linear(s)
        inequalities.append((a*x+b*z+c-y, a*dx+b*dz-dy))
        if 'y' in s:
            inequalities.append((y-s['bottom'], dy))
        else:
            inequalities.append((y-(a*x+b*z+c-s.get('thickness', .6)), dy-a*dx-b*dz))
    lo, hi = 0., 1.
    for value, delta in inequalities:
        if abs(delta) < EPS:
            if value < -EPS:
                return None
        elif delta > 0:
            lo = max(lo, -value/delta)
        else:
            hi = min(hi, -value/delta)
        if lo > hi + EPS:
            return None
    if hi < 1e-5 or lo > 1-1e-5:
        return None
    return (max(lo, 0.), min(hi, 1.))


def ray(d, start, end):
    hits = []
    for s in surf(d):
        if s.get('material') == 'grate':
            continue
        hit = volume_interval(s, start, end)
        if hit is not None:
            hits.append((hit[0], s['id']))
    for o in d['obstacles']:
        hit = volume_interval(o, start, end, True)
        if hit is not None:
            hits.append((hit[0], o['id']))
    hits.sort()
    return dict(clear=not hits, distance=math.dist(start, end), blocker=hits[0][1] if hits else None)


def standing(d, p, radius=.675, body=1.6):
    """Independent radial samples, including interior rings, on nominal terrain."""
    x, y, z = p
    problems = set()
    for rr, n in [(0., 1), (radius/2, 32), (radius, 64)]:
        for k in range(n):
            xx = x + rr*math.cos(k*math.tau/n)
            zz = z + rr*math.sin(k*math.tau/n)
            local = [s for s in surf(d) if within(s['rect'], xx, zz)]
            if not any(abs(top(s, xx, zz)-y) <= .04 for s in local):
                problems.add('unsupported footprint sample')
            for s in local:
                if top(s, xx, zz) > y+.04 and underside(s, xx, zz) < y+body-EPS:
                    problems.add('terrain body overlap: '+s['id'])
            for o in d['obstacles']:
                if within(o['rect'], xx, zz) and o['y1'] > y+EPS and o['y0'] < y+body-EPS:
                    problems.add('obstacle body overlap: '+o['id'])
    return sorted(problems)


def objectives(d):
    points = [(s['id']+'_spawn', s['point']) for s in d['spawns']]
    rm = d['rules']['rainmaker']
    points += [('rainmaker_center', rm['center'])]
    for kind, group in [('checkpoint', rm['checkpoints']), ('goal', rm['goals']), ('basket', d['rules']['clams']['baskets']), ('clam', d['rules']['clams']['pickupPoints'])]:
        points += [(kind+'_'+str(i), p) for i, p in enumerate(group)]
    point_results = [dict(id=label, point=p, standingFootprintFailures=standing(d, p)) for label, p in points]
    zones = []
    for i, zone in enumerate(d['rules']['zones']):
        r, y = zone['rect'], zone['y']
        xs, zs = {r[0], r[1]}, {r[2], r[3]}
        for s in surf(d)+d['obstacles']:
            q = rect_overlap(r, s['rect'])
            if q:
                xs.update(q[:2]); zs.update(q[2:])
        xs, zs = sorted(xs), sorted(zs)
        unsupported = blocked = extra_layer = 0.
        layers = set()
        for xa, xb in zip(xs, xs[1:]):
            for za, zb in zip(zs, zs[1:]):
                x, z = (xa+xb)/2, (za+zb)/2
                area = (xb-xa)*(zb-za)
                here = [s for s in surf(d) if within(s['rect'], x, z)]
                if not any(abs(top(s, x, z)-y) < EPS for s in here):
                    unsupported += area
                other = [s for s in here if abs(top(s, x, z)-y) >= EPS and s.get('material') != 'grate']
                if other:
                    extra_layer += area; layers.update(s['id'] for s in other)
                if any(within(o['rect'], x, z) and o['y0'] <= y+EPS < o['y1'] for o in d['obstacles']):
                    blocked += area
        zones.append(dict(index=i, rect=r, y=y, area=(r[1]-r[0])*(r[3]-r[2]), unsupportedArea=unsupported, obstacleFootprintArea=blocked, additionalSolidLayerArea=extra_layer, additionalLayers=sorted(layers)))
    return dict(points=point_results, zones=zones)


def overlaps(d):
    pairs = []
    same_level = []
    ss = surf(d)
    for i, a in enumerate(ss):
        for b in ss[i+1:]:
            q = rect_overlap(a['rect'], b['rect'])
            if not q:
                continue
            pts = [(x,z) for x in q[:2] for z in q[2:]]
            differences = [top(b,x,z)-top(a,x,z) for x,z in pts]
            if min(abs(v) for v in differences) < EPS or min(differences) < 0 < max(differences):
                same_level.append(dict(a=a['id'], b=b['id'], rect=q, differences=differences))
                continue
            low, high = (a,b) if min(differences) > 0 else (b,a)
            clear = min(underside(high,x,z)-top(low,x,z) for x,z in pts)
            pairs.append(dict(lower=low['id'], upper=high['id'], rect=q, area=(q[1]-q[0])*(q[3]-q[2]), minClearance=clear, upperMaterial=high.get('material','solid'), standingPivotNominalMargin=clear-1.85, pivotPlusProbeMargin=clear-1.85-.62))
    return dict(pairs=pairs, coplanarOrCrossingOverlaps=same_level, bodyHeight1_6Failures=[p for p in pairs if p['minClearance'] < 1.6], staticPivotPlusProbeFailures=[p for p in pairs if p['minClearance'] < 2.47])


def route_summary(d):
    out = []
    for r in d['routes']:
        p = r['points']
        out.append(dict(id=r['id'], start=p[0], end=p[-1], length3D=sum(math.dist(a,b) for a,b in zip(p,p[1:])), startsAtSpawn=any(math.dist(p[0],s['point'])<EPS for s in d['spawns']), endsAtRuleCenter=math.dist(p[-1],d['rules']['rainmaker']['center'])<EPS))
    return out


def sightlines(d):
    if d['id'] == 'tidewater':
        views = [('A_market_hall',[-28,4.8,-10]), ('A_bridge_tip',[-10,4.8,-3]), ('A_belvedere',[30,3.6,-14]), ('A_low_street',[-25,0,-12]), ('A_lower_court',[0,1.2,-26])]
        targets = [('A_spawn',[0,4.8,-68]),('B_spawn',[0,4.8,68]),('center',[0,0,0]),('A_main_entry',[4,0,-8]),('B_main_entry',[-4,0,8]),('A_low_exit',[-25,0,-3]),('B_low_exit',[25,0,3]),('A_east_low',[13,0,-10]),('B_east_low',[-13,0,10]),('B_bridge_tip',[10,4.8,3])]
    else:
        views = [('A_high_gantry',[-26,6,-38]),('A_boarding',[7,3.6,-16]),('A_center_bridge',[-7,3.6,0]),('A_service',[-18,0,-16]),('A_ferry',[28,1.2,-8])]
        targets = [('A_spawn',[0,6,-68]),('B_spawn',[0,6,68]),('high_objective',[0,3.6,0]),('west_zone',[-15,0,-2]),('east_zone',[15,0,2]),('A_low_entry',[-8,0,-8]),('B_low_entry',[8,0,8]),('A_ferry',[28,1.2,-8]),('B_ferry',[-28,1.2,8]),('B_boarding',[-7,3.6,16])]
    lines = []
    for label, p in views:
        for target, q in targets:
            if math.dist(p, q) < EPS:
                continue
            start = [p[0],p[1]+1.4,p[2]]
            end = [q[0],q[1]+1.4,q[2]]
            lines.append(dict(view=label, target=target, start=start, end=end, **ray(d,start,end)))
    return dict(pointOffset=1.4, lines=lines, note='Sparse review witnesses only. Straight zero-width rays, solid floor/ramp/cover volumes. Grates ignored. No weapon range, gravity, spread, ink, animation, camera boom, posture, reaction or team simulation. Clear does not mean hittable or dominant.')


def main():
    output = dict(method='Independent code, only isolated design builders loaded. No geometry.py/public runtime import. Rectangle clipping is exact for line/box and line/linear-ramp. Standing support uses 97 radial samples; objectives are point markers with reviewer assumed r=.675/h=1.6 body, not full game objects.', designs={})
    for name in ('tidewater','kelpline'):
        file = ROOT/(name+'_design.py')
        d = runpy.run_path(str(file))['build']()
        output['designs'][name] = dict(modelSha256=hashlib.sha256(file.read_bytes()).hexdigest(), objectives=objectives(d), overlaps=overlaps(d), routeEndpointAudit=route_summary(d), geometricSightlines=sightlines(d))
    path = ROOT/'independent-checks.json'
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n')
    for name, v in output['designs'].items():
        print(name, 'objective failures', [(p['id'],p['standingFootprintFailures']) for p in v['objectives']['points'] if p['standingFootprintFailures']])
        print('zones', v['objectives']['zones'])
        print('overlaps',len(v['overlaps']['pairs']),'minClear',min(p['minClearance'] for p in v['overlaps']['pairs']),'coplanar/crossing',len(v['overlaps']['coplanarOrCrossingOverlaps']))
        print('open rays', [(s['view'],s['target'],round(s['distance'],2)) for s in v['geometricSightlines']['lines'] if s['clear']])
    print(path)


if __name__ == '__main__':
    main()
