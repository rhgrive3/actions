rot=lambda r:(-r[1],-r[0],-r[3],-r[2])
base=[(-30,12,-24,-12),(18,36,-24,-12),(12,18,-20,-14),(-36,12,-36,-24),(18,36,-36,-24),(-36,-14,-48,-36),(-8,30,-48,-36),(-14,-8,-44,-40),(-30,30,-60,-48),(-18,18,-64,-60),(-42,-36,-34,-26),(36,42,-22,-16),(22,34,-12,-8)]
extra=[(-30,-8,-72,-64),(8,30,-72,-64),(-34,-18,-64,-60),(18,34,-64,-60),(-40,-30,-60,-48),(30,40,-60,-48),(-44,-36,-48,-36),(30,40,-48,-36),(-42,-30,-24,-12),(36,42,-24,-22),(36,42,-16,-12),(22,38,-8,0),(34,38,-12,-8)]
low=[(-22,22,-12,12)]+base+extra+list(map(rot,base+extra))
# Upper split around two grates, with optional branch
gr=[(-3,3,-9,-3),(-3,3,3,9),(24,34,-20,-16),rot((24,34,-20,-16))]
up=[(-12,-3,-12,12),(3,12,-12,12),(-3,3,-12,-9),(-3,3,-3,3),(-3,3,9,12),
    (20,30,-42,-26),(24,34,-26,-20),(24,34,-16,-12),(12,34,-12,-8),
    (-22,-12,-20,-12),(-30,-22,-28,-12),(-22,-12,-28,-20),(-34,-30,-28,-12),(-22,-12,-12,-8),(-22,-12,-36,-28)]
up+=list(map(rot,up[5:]))
def area(r):return (r[1]-r[0])*(r[3]-r[2])
def inter(a,b):return max(0,min(a[1],b[1])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[2],b[2]))
for name,ls in [('lower',low),('upper+grate',up+gr)]:
 for i,a in enumerate(ls):
  for j,b in enumerate(ls[:i]):
   if inter(a,b):print('OVERLAP',name,i,j,a,b,inter(a,b))
 print(name,'area',sum(map(area,ls)),'count',len(ls))
print('paint',sum(map(area,low))+sum(map(area,up)), 'grate',sum(map(area,gr)))
def inside(x,z,r):return r[0]<=x<r[1] and r[2]<=z<r[3]
def both(rs):return rs+list(map(rot,rs))
lowwalls=both([(-10,-4,-5,-4),(-10,-9,-4,1),(-24,-22,-35,-27),(-22,-16,-29,-27),(28,32,-30,-28)])
upwalls=both([(-11,-9,-8,-3),(-9,-5,-8,-7)])
stairs=both([(20,24,-50,-42),(8,12,-20,-12),(-34,-30,-36,-28),(-4,4,-64,-56),(-14,-8,-70,-66),(8,14,-70,-66)])
landing=both([(20,24,-42,-38),(8,12,-12,-8),(-34,-30,-28,-24)])
for title,rs in [('lower',low),('upper',up)]:
 print(title)
 for z in range(70,-71,-4):
  s=''
  for x in range(-42,43,4):
   c='.' if any(inside(x,z,r) for r in rs) else '~'
   if title=='lower':
    if any(inside(x,z,r) for r in lowwalls):c='X'
    if any(inside(x,z,r) for r in stairs):c='^'
    if any(inside(x,z,r) for r in [(-8,8,-71,-64),(-8,8,64,71)]):c='S'
   else:
    if any(inside(x,z,r) for r in gr):c='#'
    if any(inside(x,z,r) for r in upwalls):c='X'
    if any(inside(x,z,r) for r in landing):c='E'
   s+=c
  print(f'{z:+3} {s}')
