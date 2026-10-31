from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Patch
plt.rcParams.update({'font.family':'Noto Sans CJK JP','axes.unicode_minus':False})

def rotate(r):
 x0,x1,z0,z1=r;return (-x1,-x0,-z1,-z0)
def rect(ax,r,color,edge='#526572',hatch=None,alpha=1,lw=.6):
 x0,x1,z0,z1=r;ax.add_patch(Rectangle((x0,z0),x1-x0,z1-z0,facecolor=color,edgecolor=edge,linewidth=lw,hatch=hatch,alpha=alpha))
def fill_union(ax,rs,w,c):
 step=.25;xx=np.arange(-w,w,step)+step/2;zz=np.arange(-72,72,step)+step/2;X,Z=np.meshgrid(xx,zz);mask=np.zeros(X.shape,dtype=bool)
 for x0,x1,z0,z1 in rs: mask|=(X>=x0)&(X<x1)&(Z>=z0)&(Z<z1)
 from matplotlib.colors import ListedColormap
 ax.imshow(np.where(mask,1,np.nan),origin='lower',extent=(-w,w,-72,72),interpolation='nearest',cmap=ListedColormap([c]),vmin=0,vmax=1,aspect='equal');ax.contour(X,Z,mask.astype(int),levels=[.5],colors=['#617883'],linewidths=.65)
def scaffold(ax,title,w,lower=True):
 ax.set_facecolor('#d9e8eb' if lower else '#f0f2ee');ax.set_xlim(-w,w);ax.set_ylim(-72,72);ax.set_aspect('equal');ax.set_title(title,loc='left',fontsize=14,weight='bold');ax.set_xlabel('X（ワールド単位）');ax.set_ylabel('Z（ワールド単位）');ax.set_xticks(np.arange(-40,41,20));ax.set_yticks(np.arange(-60,61,20));ax.grid(color='#6d7f87',alpha=.13,lw=.5)
def mirror(rs):return rs+[rotate(r) for r in rs]
def both(ax,r,color,**kw):
 for rr in (r,rotate(r)):rect(ax,rr,color,**kw)
def spawn(ax,z):
 for zz,txt in [(-z,'A'),(z,'B')]:
  ax.scatter([0],[zz],s=120,c='#f7d967',edgecolors='#3a4951',linewidths=1,zorder=10);ax.text(0,zz,txt,ha='center',va='center',fontsize=8,weight='bold',color='#26383d',zorder=11)
def stairs(ax,r):
 for rr in [r,rotate(r)]:rect(ax,rr,'#e5c78d',edge='#6b5841',hatch='///',lw=.7)
def walls(ax,rs):
 for r in mirror(rs):rect(ax,r,'#40525c',edge='#263842',lw=.3)
def grid(ax,r):rect(ax,r,'#8bb5b6',edge='#425e61',hatch='xx',lw=.5)
def finish(fig,path):
 fig.legend(handles=[Patch(facecolor='#d9e8eb',label='水（下層） / 床なし（上層）'),Patch(facecolor='#e6ddc8',edgecolor='#617883',label='下層床'),Patch(facecolor='#e6b969',edgecolor='#617883',label='上層床'),Patch(facecolor='#40525c',label='壁・遮蔽'),Patch(facecolor='#e5c78d',hatch='///',label='階段'),Patch(facecolor='#8bb5b6',hatch='xx',label='金網')],loc='lower center',bbox_to_anchor=(.5,.025),ncol=3,frameon=False,fontsize=9)
 fig.text(.5,.005,'寸法はINKWAVE内の暫定座標。階段は投影、上下の接合や通行は未検証。',ha='center',fontsize=8);fig.tight_layout(rect=(0,.11,1,.95));fig.savefig(path,dpi=160);plt.close(fig)

# Tidewater: banded base plus non-overlapping additional ground rectangles.
def tidewater():
 bands=[(-18,18,-71.4,-60),(-30,34,-60,-44),(-34,38,-44,-28),(-34,34,-28,-12),(-30,30,-12,12),(-34,34,12,28),(-38,34,28,44),(-34,30,44,60),(-18,18,60,71.4)]
 extra=mirror([(-26,-18,-68,-60),(-42,-34,-60,-45),(-34,-30,-60,-44),(34,42,-60,-44),(-42,-34,-44,-28),(-38,-30,-12,12),(-42,-38,-8,8)])
 upper=mirror([(-28,-20,-28,6),(-28,-10,0,8)]);grates=mirror([(-28,-20,-6,-2)])
 wall=[(-12,-10,-54,-46),(-12,-4,-48,-46),(5,13,-34,-32),(-5,-2,-7,-4),(-26,-25.2,-57,-50),(-25.2,-22,-50.8,-50),(-18,-16.8,-50.8,-50),(-16.8,-16,-53,-50),(14,14.8,-48,-40),(14.8,22,-40.8,-40),(-17,-16.2,-34,-27),(-16.2,-9,-27.8,-27),(18,22,-26,-25.2)]
 stair=[(-28,-24,-40,-28),(-20,-10,-22,-18)]
 fig,(a,b)=plt.subplots(1,2,figsize=(11,9.8));fig.suptitle('タイドウォーター ─ 輪郭と通路を描き直した平面設計',fontsize=17,weight='bold')
 scaffold(a,'下層：地形・水際・遮蔽',42);scaffold(b,'上層：折れた市場回廊',42,False)
 fill_union(a,bands+extra,42,'#e6ddc8');fill_union(b,upper,42,'#e6b969')
 for r in upper:
  x0,x1,z0,z1=r;axr=Rectangle((x0,z0),x1-x0,z1-z0,fill=False,edgecolor='#879c9e',linestyle=':',linewidth=1);a.add_patch(axr)
 for r in grates:grid(b,r)
 for r in stair:stairs(a,r);stairs(b,r)
 walls(a,wall)
 for ax in [a,b]:spawn(ax,67.2)
 a.text(0,0,'中央',ha='center',va='center',fontsize=9,color='#253e42');a.text(-24,-13,'市場下',ha='center',fontsize=8,color='#415c61');b.text(-24,-14,'回廊',ha='center',fontsize=8)
 finish(fig,Path(__file__).with_name('tidewater-map2.png'))

def kelpline():
 center=[(-22,22,-12,12)]
 base=[(-30,12,-24,-12),(18,36,-24,-12),(12,18,-20,-14),(-36,12,-36,-24),(18,36,-36,-24),(-36,-14,-48,-36),(-8,30,-48,-36),(-14,-8,-44,-40),(-30,30,-60,-48),(-18,18,-64,-60),(-42,-36,-34,-26),(36,42,-22,-16),(22,34,-12,-8)]
 extra=[(-30,-8,-72,-64),(8,30,-72,-64),(-34,-18,-64,-60),(18,34,-64,-60),(-40,-30,-60,-48),(30,40,-60,-48),(-44,-36,-48,-36),(30,40,-48,-36),(-42,-30,-24,-12),(36,42,-24,-22),(36,42,-16,-12),(22,38,-8,0),(34,38,-12,-8)]
 ground=center+mirror(base+extra)
 upp0=[(-12,-3,-12,12),(3,12,-12,12),(-3,3,-12,-9),(-3,3,-3,3),(-3,3,9,12)]
 uppa=[(20,30,-42,-26),(24,34,-26,-20),(24,34,-16,-12),(12,34,-12,-8),(-22,-12,-12,-8),(-22,-12,-20,-12),(-22,-12,-28,-20),(-30,-22,-28,-12),(-34,-30,-28,-12),(-22,-12,-36,-28)]
 grates=[(-3,3,-9,-3),(-3,3,3,9)]+mirror([(24,34,-20,-16)])
 upper=upp0+mirror(uppa)+grates
 stairs0=[(20,24,-50,-42),(-34,-30,-36,-28),(8,12,-20,-12)]
 wall0=[(-10,-4,-5,-4),(-10,-9,-4,1),(-24,-22,-35,-27),(-22,-16,-29,-27),(28,32,-30,-28),(-6,4,-53,-52),(-6,-5,-52,-44),(-6,4,-44,-43),(3,4,-52,-50),(3,4,-46,-44),(-18,-17,-40,-32),(-17,-13,-32,-31),(14,15,-48,-40),(15,20,-41,-40),(22,23,-36,-30),(23,27,-31,-30),(-8,-7,-18,-14),(-8,8,-14,-13)]
 walltop=[(-11,-9,-8,-3),(-9,-5,-8,-7)]
 fig,(a,b)=plt.subplots(1,2,figsize=(11,9.8));fig.suptitle('ケルプライン ─ 折れる岸壁と上下に重なる荷役路',fontsize=17,weight='bold')
 scaffold(a,'下層：岸壁・水路・遮蔽',44);scaffold(b,'上層：折れ廊と中央',44,False)
 fill_union(a,ground,44,'#e6ddc8');fill_union(b,upper,44,'#e6b969')
 for r in grates:grid(b,r)
 for r in stairs0:stairs(a,r);stairs(b,r)
 walls(a,wall0);walls(b,walltop)
 for ax in [a,b]:spawn(ax,68)
 a.text(0,1,'中央',ha='center',fontsize=9,color='#253e42');b.text(0,0,'中央',ha='center',fontsize=8,color='#253e42')
 finish(fig,Path(__file__).with_name('kelpline-map2.png'))
tidewater();kelpline()
