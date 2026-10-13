import mmap,json,struct,math
base='.codex-stage-sources/generated/shipshape/'
wanted={35192,35196,36583,36590,35701,35706,35527,35532}
with open(base+'manifest.json','rb') as fp,mmap.mmap(fp.fileno(),0,access=mmap.ACCESS_READ) as doc:
 start=doc.find(b'"faces":[')+9;faces={}
 for face in range(max(wanted)+1):
  end=doc.find(b'}',start)+1
  if face in wanted:faces[face]=json.loads(doc[start:end])
  start=end+1
with open(base+'collision.bin','rb') as fp,mmap.mmap(fp.fileno(),0,access=mmap.ACCESS_READ) as triangles,open(base+'mask.bin','rb') as fm,mmap.mmap(fm.fileno(),0,access=mmap.ACCESS_READ) as mask:
 def dot(a,b):return sum(x*y for x,y in zip(a,b))
 def contains(f,uv):
  for tid in f['triangles']:
   xyz=struct.unpack_from('<9f',triangles,tid*36);xy=[]
   for k in range(3):
    rel=[xyz[k*3+i]-f['origin'][i] for i in range(3)];xy.append([dot(rel,f['u']),dot(rel,f['v'])])
   (ax,ay),(bx,by),(cx,cy)=xy;x,y=uv;den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
   if abs(den)<1e-12:continue
   a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den;b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den
   if a>=-1e-6 and b>=-1e-6 and a+b<=1+1e-6:return tid
  return None
 rows=[]
 for fid in [35192,36583]:
  f=faces[fid];sign=-1 if fid==35192 else 1
  for y in [1.8,1.95,2.1,2.25,2.4,3,4,5,5.9,6.035]:
   z=sign*39;x=f['origin'][0]-(f['n'][1]*(y-f['origin'][1])+f['n'][2]*(z-f['origin'][2]))/f['n'][0]
   rel=[x-f['origin'][0],y-f['origin'][1],z-f['origin'][2]];uv=[dot(rel,f['u']),dot(rel,f['v'])]
   i=max(0,min(f['nu']-1,math.floor(uv[0]/f['cu'])));j=max(0,min(f['nv']-1,math.floor(uv[1]/f['cv'])));center=[(i+.5)*f['cu'],(j+.5)*f['cv']]
   rows.append({'face':fid,'height':y,'actualTriangle':contains(f,uv),'actualPointInside':contains(f,uv)!=None,'uv':uv,'cell':[i,j],'mask':mask[f['grid']+j*f['nu']+i],'cellCenterUV':center,'cellCenterInsideSourcePolygon':contains(f,center)!=None})
json.dump(rows,open('.ci-scratch/mask-scalar.json','w'),indent=2)
print(json.dumps(rows))
