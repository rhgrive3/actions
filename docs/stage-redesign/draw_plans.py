from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
plt.rcParams['font.family']='Noto Sans CJK JP'
plt.rcParams['axes.unicode_minus']=False

def rect(ax,x0,x1,z0,z1,c,**kw): ax.add_patch(Rectangle((x0,z0),x1-x0,z1-z0,facecolor=c,edgecolor='#eff5f5',linewidth=.8,**kw))
def setup(ax,title,w):
 ax.set_title(title,fontsize=15,loc='left',weight='bold');ax.set_xlim(-w,w);ax.set_ylim(-72,72);ax.set_aspect('equal');ax.set_facecolor('#cedfe5');ax.set_xlabel('X（m相当）');ax.set_ylabel('Z（m相当）');ax.grid(alpha=.16);ax.axhline(0,c='#778b8d',lw=.6,alpha=.35);ax.axvline(0,c='#778b8d',lw=.6,alpha=.35)
def label(ax,x,z,t,c='#18343d',size=8): ax.text(x,z,t,ha='center',va='center',fontsize=size,color=c,bbox=dict(facecolor='white',alpha=.76,edgecolor='none',boxstyle='round,pad=.15'))
def make_plaza():
 fig,(a,b)=plt.subplots(1,2,figsize=(11,9));fig.suptitle('タイドウォーター広場 — 提案する上下2層',fontsize=19,weight='bold')
 for ax,title in [(a,'下層：駅前・中間・中央'),(b,'上層：回廊　Y = 3.2')]:setup(ax,title,42)
 rect(a,-34,34,-28,28,'#e5d8bf')
 for z0,z1 in [(-39.5,-28),(28,39.5)]:rect(a,-42,42,z0,z1,'#d5bd92')
 for z0,z1 in [(-71.4,-39.5),(39.5,71.4)]:rect(a,-42,42,z0,z1,'#be9770')
 label(a,0,-53,'駅前 Y=1.2');label(a,0,53,'駅前 Y=1.2');label(a,0,-34,'中間 Y=0.6');label(a,0,34,'中間 Y=0.6')
 for sign in [-1,1]:
  x0,x1=(34,42) if sign>0 else (-42,-34)
  rect(a,x0,x1,-28,-12,'#b99770');rect(a,x0,x1,12,28,'#b99770')
  x0,x1=(18,26) if sign>0 else (-26,-18)
  rect(a,x0,x1,-28,28,'#6c8d91',alpha=.24)
  rect(b,x0,x1,-28,-4,'#dfad65');rect(b,x0,x1,4,28,'#dfad65');rect(b,x0,x1,-4,4,'#5b727b',hatch='///')
 for z,t in [(-67.2,'A'),(67.2,'B')]:
  for ax in [a,b]:ax.scatter([0],[z],s=80,c='#f2a82a',edgecolor='white',zorder=10);ax.text(0,z,t,ha='center',va='center',weight='bold',fontsize=9)
 for x in [-22,22]:
  label(a,x,0,'上層の真下\n下層も通行');label(b,x,0,'金網',size=8);label(b,x,-16,'回廊');label(b,x,16,'回廊')
 label(a,0,0,'中央の谷 Y=0');label(a,38,0,'水');label(a,-38,0,'水')
 for ax in (a,b):
  ax.annotate('南側階段',xy=(-24,-28),xytext=(-38,-49),fontsize=8,arrowprops=dict(arrowstyle='->',color='#334c4c'));ax.annotate('北側階段',xy=(24,28),xytext=(28,48),fontsize=8,arrowprops=dict(arrowstyle='->',color='#334c4c'))
 fig.text(.5,.04,'主要な床のみ。右図の青は上層床なし。階段・遮蔽・支柱・各ルールは本文を参照。',ha='center',fontsize=9);fig.tight_layout(rect=[0,.06,1,.94]);fig.savefig(Path(__file__).with_name('tidewater-plan.png'),dpi=160);plt.close(fig)
def make_terminal():
 fig,(a,b)=plt.subplots(1,2,figsize=(11,9));fig.suptitle('ケルプライン — 提案する上下2層',fontsize=19,weight='bold')
 for ax,title in [(a,'下層：桟橋と水路　Y = 0'),(b,'上層：荷役回廊　Y = 3.2')]:setup(ax,title,44)
 rect(a,-12,12,-50,50,'#dfd4bb')
 for x0,x1 in [(-40,-20),(20,40)]:rect(a,x0,x1,-50,50,'#dfd4bb')
 for z0,z1 in [(-64,-50),(50,64)]:rect(a,-40,40,z0,z1,'#dfd4bb')
 for x0,x1,z0,z1 in [(-20,-12,-8,8),(12,20,-8,8),(12,20,-24,-16),(-20,-12,16,24),(16,20,-30,-26),(-20,-16,26,30)]:rect(a,x0,x1,z0,z1,'#dfd4bb')
 for x0,x1,z0,z1 in [(-40,-20,-42,5),(-40,-20,9,42),(20,40,-42,-9),(20,40,-5,42),(-20,-3,-4,4),(3,20,-4,4)]:rect(b,x0,x1,z0,z1,'#daaa63')
 for x0,x1,z0,z1 in [(-40,-20,5,9),(20,40,-9,-5),(-3,3,-4,4)]:rect(b,x0,x1,z0,z1,'#5b727b',hatch='///')
 for z,t in [(-68,'A'),(68,'B')]:
  for ax in [a,b]:ax.scatter([0],[z],s=80,c='#f2a82a',edgecolor='white',zorder=10);ax.text(0,z,t,ha='center',va='center',weight='bold',fontsize=9)
 label(a,0,0,'中央桟橋');label(a,-30,-10,'上層の下\n下層も通行');label(a,16,35,'水');label(b,0,0,'金網');label(b,30,-7,'金網');label(b,-30,7,'金網');label(b,30,20,'荷役回廊');label(b,-30,-20,'荷役回廊')
 fig.text(.5,.04,'主要な床のみ。右図の青は上層床なし。階段・遮蔽・壁・落下口は本文を参照。',ha='center',fontsize=9);fig.tight_layout(rect=[0,.06,1,.94]);fig.savefig(Path(__file__).with_name('kelpline-plan.png'),dpi=160);plt.close(fig)
make_plaza();make_terminal()
