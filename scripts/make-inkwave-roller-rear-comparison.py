from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
root=Path(__file__).resolve().parents[1]
out=root/'reports/roller-rear-20261020'
font=FontProperties(fname='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
plt.rcParams['font.family']=font.get_name()
plt.rcParams['font.sans-serif']=[font.get_name()]
from matplotlib import font_manager
font_manager.fontManager.addfont(font.get_file())
items=[dict(path='.reference-data/roller-scale/gamewatch25-full.jpg',title='本家：スプラトゥーン3／スプラローラー',subtitle='GAME Watch・2022-12-01掲載、転がして125ダメージ',drum=[539,753,441],paint=[470,864,490]),dict(path='reports/roller-overhead-20261020/gameplay.png',title='INKWAVE：main e43f0afe の実ゲーム画面',subtitle='Dローラーコート・前進＋攻撃、最高速 7.92 world/s',drum=[355,555,395],paint=[231,682,446])]
fig=plt.figure(figsize=(16,10.4),facecolor='#101822')
gs=fig.add_gridspec(2,2,left=.03,right=.97,top=.83,bottom=.145,hspace=.29,height_ratios=[1,1.1],wspace=.045)
fig.text(.03,.96,'スプラローラーの塗り跡を後ろから比較',color='white',fontsize=23,fontproperties=font,weight='bold')
fig.text(.03,.915,'上：元の画角　下：ローラー胴の表示幅をそろえた拡大（縦横比を維持）',color='#d4e2f2',fontsize=15,fontproperties=font)
for i,it in enumerate(items):
 a=np.asarray(Image.open(root/it['path']).convert('RGB'));h,w=a.shape[:2]
 ax=fig.add_subplot(gs[0,i]);ax.imshow(a);ax.axis('off')
 ax.set_title(it['title']+'\n'+it['subtitle'],fontproperties=font,color='white',fontsize=13,pad=10)
 ax=fig.add_subplot(gs[1,i]);lo,hi,cy=it['drum'];d=hi-lo;cx=(lo+hi)/2
 ax.imshow(a,extent=[-cx/d,(w-cx)/d,(h-cy)/d,-cy/d]);ax.set_xlim(-1.55,1.55);ax.set_ylim(1.1,-.38);ax.axis('off')
 # These are annotations on the source pixels, never a paint/model input.
 for bounds,y,c in [((lo,hi),cy,'#70f4ff'),(it['paint'][:2],it['paint'][2],'#ff618e')]:
  x1,x2=[(x-cx)/d for x in bounds];yy=(y-cy)/d
  ax.plot([x1,x2],[yy,yy],color=c,lw=2)
  ax.plot([x1,x1],[yy-.05,yy+.05],color=c,lw=2);ax.plot([x2,x2],[yy-.05,yy+.05],color=c,lw=2)
 ax.text(.015,.96,'水色：胴の幅　ピンク：直後の塗り幅',transform=ax.transAxes,va='top',fontsize=12,fontproperties=font,color='white',bbox=dict(facecolor='#101822',alpha=.85,edgecolor='none',pad=5))
 it['sha256']=hashlib.sha256((root/it['path']).read_bytes()).hexdigest()
fig.text(.03,.102,'この後方画像では、INKWAVEの塗りが胴の両側へより大きく張り出して見える。',color='white',fontsize=17,fontproperties=font)
fig.text(.03,.065,'本家の速度・ギア・カメラ条件は不明。胴と床では奥行きも異なるため、この図から実寸の差や修正倍率は出さない。',color='#d4e2f2',fontsize=12,fontproperties=font)
fig.text(.03,.029,'チェック専用。出典：GAME Watch https://game.watch.impress.co.jp/docs/kikaku/1460351.html　画像 © Nintendo',color='#b4c1d0',fontsize=10,fontproperties=font)
fig.savefig(out/'comparison.png',dpi=125,facecolor=fig.get_facecolor())
(out/'inputs.json').write_text(json.dumps(dict(schema=1,purpose='rear-view image comparison only; no game parameter calibration',retailSource='https://asset.watch.impress.co.jp/img/gmw/docs/1460/351/25.jpg',retailArticle='https://game.watch.impress.co.jp/docs/kikaku/1460351.html',sources=items,coordinates='Manual image pixel annotations: drum=[left,right,centreY]; paint=[left,right,rowY]. Approximate, not ground-plane rectified.',mainBuild='16b66efdb5d5d7193c7eebf6f871c3780b6cb5c8355bc1da0ff257342dc9dca1',mainRevision='e43f0afe9cce5b988ef4dca802f4b4d524787a13',liveBuild='a946c46a2a0521cff8c76fcdc2a0581da25dbe29281166c683e81fbe87bdb878',liveRevision='1b30d25ee3ca97c63c89a9d38cea21826b522d06f76924184630d1552a4ed3bb',liveCheck='2026-10-20',limitations=['retail speed/gear/camera calibration unknown','retail frame immediately after dummy contact','drum is above the floor; depth-dependent perspective not corrected','same displayed drum span does not make the cameras identical','main capture differs from current Pages build']),ensure_ascii=False,indent=2)+'\n')
