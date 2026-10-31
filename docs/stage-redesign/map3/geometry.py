"""Independent proposal geometry, exact rectangle partition areas and seam graph.

No game imports. Linear ramp faces are sampled only for path sweeps; the area
partition is exact for the axis-aligned model. WU never means calibrated metres.
"""
import math
from collections import defaultdict, deque

EPS=1e-7
RADIUS=.675
BODY_HEIGHT=1.6

def surfaces(d):
    return [dict(s,kind='floor') for s in d['floors']]+[dict(s,kind='ramp') for s in d['ramps']]

def height(s,x,z):
    if s['kind']=='floor':return s['y']
    r=s['rect'];v,a,b=(x,r[0],r[1]) if s['axis']=='x' else (z,r[2],r[3])
    return s['y0']+(s['y1']-s['y0'])*(v-a)/(b-a)

def bottom(s,x,z):
    return s['bottom'] if s['kind']=='floor' else height(s,x,z)-s.get('thickness',.6)

def contains(r,x,z,margin=0):
    return r[0]-EPS+margin<=x<=r[1]+EPS-margin and r[2]-EPS+margin<=z<=r[3]+EPS-margin

def intersection(a,b):
    r=[max(a[0],b[0]),min(a[1],b[1]),max(a[2],b[2]),min(a[3],b[3])]
    return r if r[1]-r[0]>EPS and r[3]-r[2]>EPS else None

def area(r):return (r[1]-r[0])*(r[3]-r[2])
def corners(r):return [(x,z) for x in r[:2] for z in r[2:]]
def circle_rect(x,z,r,rect):
    return math.hypot(max(rect[0]-x,0,x-rect[1]),max(rect[2]-z,0,z-rect[3]))<r-EPS

def metric(d):
    ss=surfaces(d); obs=d['obstacles'];allrect=[s['rect'] for s in ss+obs]
    xs=sorted(set(v for r in allrect for v in r[:2]));zs=sorted(set(v for r in allrect for v in r[2:]))
    elev=defaultdict(float);regions=defaultdict(lambda:defaultdict(float));gross=net=union=overlap=grate=sloped=0.
    shade=0.;minclear=math.inf;issues=[];per_surface=defaultdict(float)
    for xa,xb in zip(xs,xs[1:]):
      for za,zb in zip(zs,zs[1:]):
        x=(xa+xb)/2;z=(za+zb)/2;A=(xb-xa)*(zb-za)
        here=[s for s in ss if contains(s['rect'],x,z)]
        if not here:continue
        gross+=A*len(here)
        available=[]
        for s in here:
          h=height(s,x,z)
          if any(contains(o['rect'],x,z) and o['y0']<=h+EPS and o['y1']>h+EPS for o in obs):continue
          available.append(s);per_surface[s['id']]+=A
          net+=A
          if s['kind']=='floor':
            if s.get('material')=='grate':grate+=A
            else:
              elev[s['y']]+=A
              regions['rear' if abs(z)>=44 else 'approach' if abs(z)>=20 else 'center'][s['y']]+=A
          else:
            r=s['rect'];run=r[1]-r[0] if s['axis']=='x' else r[3]-r[2]
            sloped+=A*math.sqrt(1+((s['y1']-s['y0'])/run)**2)
        if available:union+=A
        if len(available)>=2:
          overlap+=A
          ordered=sorted(available,key=lambda s:height(s,x,z))
          for low,high in zip(ordered,ordered[1:]):
            c=min(bottom(high,px,pz)-height(low,px,pz) for px,pz in corners([xa,xb,za,zb]))
            minclear=min(minclear,c)
            if c<2.8-EPS:issues.append((low['id'],high['id'],round(c,5)))
          if any(s.get('material')!='grate' for s in ordered[1:]):shade+=A
    totalflat=sum(elev.values());pcts={str(y):round(a/totalflat*100,4) for y,a in sorted(elev.items())}
    bounds=d['bounds'];bb=area(bounds)
    rects=[s['rect'] for s in ss]
    terrain=[min(r[0] for r in rects),max(r[1] for r in rects),min(r[2] for r in rects),max(r[3] for r in rects)]
    rampProjected=sum(per_surface[s['id']] for s in ss if s['kind']=='ramp')
    points=[s['point'] for s in d['spawns']]
    return dict(bounds=bounds,boundsArea=bb,terrainBounds=terrain,terrainBoundsArea=area(terrain),
      spawnDistance3D=math.dist(*points),spawnDistanceXZ=math.hypot(points[0][0]-points[1][0],points[0][2]-points[1][2]),
      grossLayeredProjectedArea=gross,netLayeredProjectedArea=net,netProjectedUnionArea=union,
      layeredMinusUnion=net-union,stackedXZArea=overlap,solidRoofShadowArea=shade,
      flatSolidByHeight={str(y):round(a,6) for y,a in sorted(elev.items())},flatHeightPercent=pcts,
      flatSolidArea=totalflat,grateProjectedArea=grate,rampProjectedArea=rampProjected,
      rampSlopedArea=sloped,netActualTopArea=totalflat+grate+sloped,
      paintableTopCandidateArea=totalflat+sloped,
      uncoveredXZInBounds=bb-union,projectedUnionFraction=union/bb,
      minStackedClearance=None if minclear==math.inf else minclear,
      clearanceFailures=sorted(set(issues)),regions={k:{str(y):a for y,a in sorted(v.items())} for k,v in regions.items()},
      perSurfaceArea=dict(per_surface),largestHeightShare=max(pcts.values()) if pcts else 0)

def seam_graph(d,radius=RADIUS):
    ss=surfaces(d);edges=[];g={s['id']:[] for s in ss}
    for i,a in enumerate(ss):
      for b in ss[i+1:]:
        ar,br=a['rect'],b['rect'];seam=None
        if abs(ar[1]-br[0])<EPS or abs(ar[0]-br[1])<EPS:
          x=ar[1] if abs(ar[1]-br[0])<EPS else ar[0];lo=max(ar[2],br[2]);hi=min(ar[3],br[3])
          seam=((x,lo),(x,hi))
        elif abs(ar[3]-br[2])<EPS or abs(ar[2]-br[3])<EPS:
          z=ar[3] if abs(ar[3]-br[2])<EPS else ar[2];lo=max(ar[0],br[0]);hi=min(ar[1],br[1])
          seam=((lo,z),(hi,z))
        if seam is None or hi-lo<2*radius+.05:continue
        if any(abs(height(a,*p)-height(b,*p))>EPS for p in seam):continue
        # Obstacles may trim a doorway; report maximum contiguous clear interval.
        breaks=[lo,hi]
        for o in d['obstacles']:
          r=o['rect'];v0,v1=(r[2],r[3]) if seam[0][0]==seam[1][0] else (r[0],r[1])
          breaks.extend([max(lo,min(hi,v0)),max(lo,min(hi,v1))])
        breaks=sorted(set(breaks));spans=[];start=None
        for l,h in zip(breaks,breaks[1:]):
          p=(seam[0][0],(l+h)/2) if seam[0][0]==seam[1][0] else ((l+h)/2,seam[0][1]);y=height(a,*p)
          blocked=any(contains(o['rect'],*p) and o['y0']<y+BODY_HEIGHT and o['y1']>y+.05 for o in d['obstacles'])
          if not blocked and start is None:start=l
          if blocked and start is not None:spans.append(l-start);start=None
        if start is not None:spans.append(hi-start)
        width=max(spans,default=0)
        if width<2*radius+.05:continue
        e=dict(a=a['id'],b=b['id'],seam=[list(p) for p in seam],y=[height(a,*p) for p in seam],width=width,effectiveWidth=width-2*radius)
        edges.append(e);g[a['id']].append(b['id']);g[b['id']].append(a['id'])
    comps=[];remaining=set(g)
    while remaining:
      seen=set();todo=[min(remaining)]
      while todo:
        p=todo.pop()
        if p in seen:continue
        seen.add(p);todo+=g[p]
      comps.append(sorted(seen));remaining-=seen
    return dict(edges=edges,components=comps,adjacency=g)

def support(d,p,tolerance=.04,form='human'):
    x,y,z=p
    return [s for s in surfaces(d) if contains(s['rect'],x,z) and abs(height(s,x,z)-y)<=tolerance and not(form=='squid' and s.get('material')=='grate')]

def check_point(d,p,radius=RADIUS,head=BODY_HEIGHT,ring=True):
    x,y,z=p;ss=surfaces(d)
    if not support(d,p):return 'no matching support'
    for o in d['obstacles']:
      if o['y0']<y+head-EPS and o['y1']>y+.05 and circle_rect(x,z,radius,o['rect']):return 'obstacle '+o['id']
    # Grounded body against adjacent elevated solids and overhead slabs.
    for s in ss:
      r=s['rect']
      if not circle_rect(x,z,radius,r):continue
      cx=max(r[0],min(r[1],x));cz=max(r[2],min(r[3],z));top=height(s,cx,cz)
      if top>y+.36 and bottom(s,cx,cz)<y+head-EPS:return 'terrain body collision '+s['id']
    if ring:
      for a in range(16):
        t=2*math.pi*a/16;xx=x+radius*math.cos(t);zz=z+radius*math.sin(t)
        if not any(contains(s['rect'],xx,zz) and abs(height(s,xx,zz)-y)<=.4 for s in ss):return 'support disk crosses an edge'
    return None

def check_polyline(d,points,radius=RADIUS,spacing=.25,head=BODY_HEIGHT,ring=True):
    failures=[];n=0;length=0
    for k,(a,b) in enumerate(zip(points,points[1:])):
      L=math.dist(a,b);length+=L;steps=max(1,math.ceil(L/spacing))
      for i in range(steps+1):
        t=i/steps;p=[a[j]*(1-t)+b[j]*t for j in range(3)];n+=1
        failure=check_point(d,p,radius,head,ring)
        if failure:failures.append(dict(segment=k,point=[round(v,4) for v in p],reason=failure))
    return dict(length3D=length,samples=n,failures=failures)

def symmetry(d):
    errors=[]
    for key in ('floors','ramps','obstacles'):
      for a in d[key]:
        r=a['rect'];rr=[-r[1],-r[0],-r[3],-r[2]]
        found=[]
        for b in d[key]:
          if any(abs(v-w)>EPS for v,w in zip(rr,b['rect'])):continue
          if key=='floors' and (a['y']!=b['y'] or a['bottom']!=b['bottom'] or a['material']!=b['material']):continue
          if key=='ramps' and (a['axis']!=b['axis'] or a['y0']!=b['y1'] or a['y1']!=b['y0']):continue
          if key=='obstacles' and (a['y0']!=b['y0'] or a['y1']!=b['y1']):continue
          found.append(b)
        if not found:errors.append(key+':'+a['id'])
    return errors

def tower_sweep(d,points,spacing=.25):
    """Separate deck/pole/rider envelope, with ground-following deck height.

    Runtime constants: halfWidth1.4, deck thickness.24, pole top+2.01,
    min lift.40 and support radius1.4*(sqrt(2)+1). Use a .15WU disk sampler
    including cover tops, matching the documented sampling intent. A lift
    discontinuity or obstruction is not silently accepted as a free flight.
    This is geometry QA; it does not execute ranked/world.mjs.
    """
    import numpy as np
    ss=surfaces(d);r=1.4*(math.sqrt(2)+1);fails=[];liftwarnings=[];deck=[];n=0
    ax=np.arange(-r,r+.001,.15);xx,zz=np.meshgrid(ax,ax);keep=xx*xx+zz*zz<=r*r
    dx=np.r_[xx[keep],0.];dz=np.r_[zz[keep],0.]
    for k,(a,b) in enumerate(zip(points,points[1:])):
      steps=max(1,math.ceil(math.dist(a,b)/spacing))
      for i in range(steps+1):
        t=i/steps;x,y,z=[a[j]*(1-t)+b[j]*t for j in range(3)];n+=1
        if not support(d,[x,y,z]):fails.append(dict(segment=k,point=[x,y,z],reason='tower ground center unsupported'));continue
        footprint=[x-r,x+r,z-r,z+r];px=x+dx;pz=z+dz
        maximum=y
        for s in ss:
          clip=intersection(s['rect'],footprint)
          if not clip:continue
          sr=s['rect'];mask=(px>=sr[0])&(px<=sr[1])&(pz>=sr[2])&(pz<=sr[3])
          if mask.any():
            values=height(s,px[mask],pz[mask]);maximum=max(maximum,float(np.max(values)))
        for o in d['obstacles']:
          sr=o['rect'];mask=(px>=sr[0])&(px<=sr[1])&(pz>=sr[2])&(pz<=sr[3])
          if mask.any():maximum=max(maximum,o['y1'])
        pathY=maximum+.4;deck.append([x,pathY,z])
        if maximum-y>1.4+EPS:liftwarnings.append(dict(segment=k,point=[x,y,z],groundRise=maximum-y))
        # A larger 0.675 rider radius also covers the current swim collision form.
        hd=1.4*math.sqrt(2);hp=.28*math.sqrt(2)
        envelopes=[('deck',[x-hd,x+hd,z-hd,z+hd],pathY-.24,pathY),
                   ('pole',[x-hp,x+hp,z-hp,z+hp],pathY-.12,pathY+2.01),
                   ('rider',[x-2.675,x+2.675,z-2.675,z+2.675],pathY,pathY+1.6)]
        for name,rect,lo,hi in envelopes:
          for o in d['obstacles']:
            if intersection(rect,o['rect']) and o['y0']<hi-EPS and o['y1']>lo+EPS:
              fails.append(dict(segment=k,point=[round(x,3),round(pathY,3),round(z,3)],reason=name+' / '+o['id']))
          for s in ss:
            clip=intersection(rect,s['rect'])
            if clip and max(height(s,*p) for p in corners(clip))>lo+EPS and min(bottom(s,*p) for p in corners(clip))<hi-EPS:
              fails.append(dict(segment=k,point=[round(x,3),round(pathY,3),round(z,3)],reason=name+' / terrain '+s['id']))
    return dict(samples=n,failures=fails,liftWarnings=liftwarnings,deckHeightRange=[min(p[1] for p in deck),max(p[1] for p in deck)],
      method='Independent all-yaw AABB sweep sampled <=0.25WU; support heights use .15WU disk samples and include cover tops. Deck/pole/rider volumes separate. Nominal proposal slabs, not live ranked route generation.')

def validate(d):
    m=metric(d);graph=seam_graph(d);results={}
    for route in d['routes']:results[route['id']]=check_polyline(d,route['points'])
    tower=d['rules']['tower'];tr=tower_sweep(d,tower['path'])
    rampinfo=[]
    for s in d['ramps']:
      r=s['rect'];run=r[1]-r[0] if s['axis']=='x' else r[3]-r[2];width=r[3]-r[2] if s['axis']=='x' else r[1]-r[0]
      grade=abs(s['y1']-s['y0'])/run
      rampinfo.append(dict(id=s['id'],run=run,width=width,grade=grade,angleDegrees=math.degrees(math.atan(grade))))
    drops=[]
    for drop in d['drops']:
      start=drop.get('fromPoint',drop.get('from'));end=drop['to']
      drops.append(dict(id=drop['id'],heightLoss=start[1]-end[1],landingError=check_point(d,end),humanSupportAtStart=bool(support(d,start)),squidSupportAtStart=bool(support(d,start,form='squid')),returnRoute=drop.get('returnRoute')))
    return dict(metrics=m,graph=graph,routes=results,tower=tr,ramps=rampinfo,drops=drops,symmetryFailures=symmetry(d),
      method='Static isolated model only. Seam graph is geometry derived; route sampling at <=0.25WU. Conservative circular footprint r=.675 and height1.6. Not game Actor, native collision or human playtest.')
