import contextlib,io,runpy,collections
from pathlib import Path
with contextlib.redirect_stdout(io.StringIO()): d=runpy.run_path(str(Path(__file__).with_name('check_kelpline_area.py')))
rot=d['rot']; inside=d['inside']; floor=d['low']; old=d['lowwalls']
new=[(-6,4,-53,-52),(-6,-5,-52,-44),(-6,4,-44,-43),(3,4,-52,-50),(3,4,-46,-44),(-18,-17,-40,-32),(-17,-13,-32,-31),(14,15,-48,-40),(15,20,-41,-40),(22,23,-36,-30),(23,27,-31,-30),(-8,-7,-18,-14),(-8,8,-14,-13)]
new+=list(map(rot,new))
walls=old+new
for i,a in enumerate(walls):
 for j,b in enumerate(walls[:i]):
  k=d['inter'](a,b)
  if k:print('wall overlapping',i,j,a,b,k)
for r in new:
 for ix in range(int(r[0]*2),int(r[1]*2)):
  for iz in range(int(r[2]*2),int(r[3]*2)):
   x=(ix+.5)/2;z=(iz+.5)/2
   if not any(inside(x,z,f) for f in floor): print('wall off floor',r,x,z)
# Conservative top view: stairs treated as blocked for lower-floor paths.
stairs=d['stairs']; blocked=walls+stairs
def free(x,z):
 for dx in [-.45,0,.45]:
  for dz in [-.45,0,.45]:
   if not any(inside(x+dx,z+dz,r) for r in floor):return False
   if any(inside(x+dx,z+dz,r) for r in blocked):return False
 return True
def search(start,end):
 if not free(*start) or not free(*end): return None
 q=collections.deque([start]); parents={start:None}
 while q:
  a=q.popleft()
  if a==end:
   out=[]
   while a is not None:out.append(a);a=parents[a]
   return out[::-1]
  x,z=a
  for b in [(x+1,z),(x-1,z),(x,z+1),(x,z-1)]:
   if b not in parents and free(*b):parents[b]=a;q.append(b)
 return None
routes={
 'left':[(-1,-54),(-31,-40),(-29,-32),(-16,-20),(-16,-1)],
 'middle':[(-1,-54),(8,-48),(5,-35),(9,-22),(0,-10),(0,-1)],
 'right':[(-1,-54),(27,-46),(30,-34),(30,-18),(17,-10),(17,-1)],
 'back entrance':[(-1,-54),(19,-46)],
 'center entrance':[(-1,-54),(7,-20)],
 'side entrance':[(-1,-54),(-35,-32)],
}
for name,pts in routes.items():
 status=[]
 for a,b in zip(pts,pts[1:]):
  route=search((a[0]+.5,a[1]+.5),(b[0]+.5,b[1]+.5))
  status.append(len(route)-1 if route else None)
 print(name,status)
print('New wall WU2:',sum(d['area'](r) for r in new))
