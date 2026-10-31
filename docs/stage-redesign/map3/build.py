#!/usr/bin/env python3
"""Rebuild diagrams, coordinates, validation and the isolated offline blockout.

Run from any directory: python docs/stage-redesign/map3/build.py
Requires Python 3, numpy and matplotlib. No network and no game mutation.
"""
import csv,hashlib,json,math,os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/inkwave-stage-design-mpl')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import Rectangle,Patch
from matplotlib.colors import LinearSegmentedColormap,Normalize
from tidewater_design import build as tidewater
from kelpline_design import build as kelpline
from geometry import surfaces,height,bottom,intersection,area,validate

ROOT=Path(__file__).resolve().parent
FIG=ROOT/'figures';FIG.mkdir(exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'svg.fonttype':'none','axes.titleweight':'bold','axes.unicode_minus':False})
COLORS=['#32b8cd','#63bd91','#e5c44c','#f39b63','#aa85dc','#d96eae']
CMAP=LinearSegmentedColormap.from_list('terrain',COLORS)
NORM=Normalize(0,6)
WATER='#d7edf7';INK='#182b42'
def color(y):return CMAP(NORM(y))
def center(s):r=s['rect'];return ((r[0]+r[1])/2,(r[2]+r[3])/2)
def labels(d):return {s['id']:('F' if s['kind']=='floor' else 'R')+str(i+1).zfill(2) for i,s in enumerate(surfaces(d))}
def rect(ax,r,**kw):
    return ax.add_patch(Rectangle((r[0],r[2]),r[1]-r[0],r[3]-r[2],**kw))
def scaffold(ax,title):
    ax.set(title=title,xlim=(-48,48),ylim=(-76,76),xlabel='X / WU',ylabel='Z / WU')
    ax.set_aspect('equal');ax.set_facecolor(WATER)
    ax.set_xticks(range(-40,41,20));ax.set_yticks(range(-60,61,20));ax.grid(alpha=.2,lw=.5)
    for spine in ax.spines.values():spine.set_color('#9bb2c1')
def save(fig,name):
    fig.savefig(FIG/(name+'.svg'),bbox_inches='tight',facecolor='white')
    fig.savefig(FIG/(name+'.png'),dpi=135,bbox_inches='tight',facecolor='white')
    plt.close(fig)
def paint_floor(ax,s,alpha=1,linewidth=.55):
    r=s['rect'];x,z=center(s)
    if s['kind']=='floor':
        rect(ax,r,facecolor=color(s['y']),edgecolor='#3e5269',lw=linewidth,alpha=alpha,hatch='xx' if s.get('material')=='grate' else None)
    else:
        for i in range(18):
            q=list(r);idx=0 if s['axis']=='x' else 2
            q[idx]=r[idx]+(r[idx+1]-r[idx])*i/18;q[idx+1]=r[idx]+(r[idx+1]-r[idx])*(i+1)/18
            xx,zz=(q[0]+q[1])/2,(q[2]+q[3])/2
            rect(ax,q,facecolor=color(height(s,xx,zz)),edgecolor='none',alpha=alpha)
        rect(ax,r,fill=False,edgecolor='#4f6172',lw=linewidth,hatch='///')
        low=[r[0],z] if s['axis']=='x' else [x,r[2]];high=[r[1],z] if s['axis']=='x' else [x,r[3]]
        if s['y0']>s['y1']:low,high=high,low
        mid=[(low[0]+high[0])/2,(low[1]+high[1])/2]
        ax.annotate('',xy=[mid[j]+(high[j]-mid[j])*.6 for j in range(2)],xytext=[mid[j]+(low[j]-mid[j])*.6 for j in range(2)],arrowprops=dict(arrowstyle='->',color='#303a52',lw=.8))
def spawns(ax,d):
    for s in d['spawns']:
        x,y,z=s['point'];ax.scatter([x],[z],s=95,facecolor='#fff8c8',edgecolor=INK,zorder=10)
        ax.text(x,z,s['id'],ha='center',va='center',weight='bold',fontsize=8,zorder=11)
def plan(ax,d,layer=None,route=False,ids=False):
    scaffold(ax,d['name'] if layer is None else f"y = {layer:g} WU")
    ss=surfaces(d);labs=labels(d)
    if layer is not None:
      for s in ss:rect(ax,s['rect'],facecolor='#edf0f2',edgecolor='#bac8d2',lw=.25)
    items=ss+[dict(o,kind='obstacle') for o in d['obstacles']] if layer is None else ss
    for s in sorted(items,key=lambda s:s['y1'] if s['kind']=='obstacle' else height(s,*center(s))):
      if s['kind']=='obstacle':
        rect(ax,s['rect'],facecolor='#253e53',edgecolor='#13293c',lw=.4)
        continue
      visible=layer is None or (s['kind']=='floor' and abs(s['y']-layer)<1e-8) or (s['kind']=='ramp' and min(s['y0'],s['y1'])<=layer<=max(s['y0'],s['y1']))
      if not visible:continue
      paint_floor(ax,s,alpha=.75 if layer is not None and s['kind']=='ramp' else 1)
      if ids and s['kind']=='floor':
        x,z=center(s);ax.text(x,z,labs[s['id']],ha='center',va='center',fontsize=6,color=INK)
    # Lower routes under solid or grated upper surfaces get explicit dotted footprint.
    if layer is None:
      for i,a in enumerate(ss):
        for b in ss[i+1:]:
          q=intersection(a['rect'],b['rect'])
          if q:
            rect(ax,q,fill=False,edgecolor='#7d215e',lw=.7,linestyle=':')
    if layer is not None:
      for o in d['obstacles']:
        if o['y0']<=layer+.01<o['y1']:rect(ax,o['rect'],facecolor='#253e53',edgecolor='#13293c',lw=.4)
    for zone in d['rules']['zones']:
      if layer is None or zone['y']==layer:rect(ax,zone['rect'],fill=False,edgecolor='#f21c5e',lw=1.6,linestyle='--')
    if route:
      styles=['#182b42','#8d2359','#16624b','#5e42a4']
      selected=[r for r in d['routes'] if r['team']=='A' and 'return' not in r['id'] and 'recovery' not in r['id']]
      for n,r in enumerate(selected[:4]):
        pts=r['points'];line=ax.plot([p[0] for p in pts],[p[2] for p in pts],lw=1.25,color=styles[n],alpha=.9,zorder=8)[0]
        line.set_path_effects([pe.Stroke(linewidth=2.4,foreground='white',alpha=.6),pe.Normal()])
        for k in range(2,len(pts),4):ax.annotate('',xy=(pts[k][0],pts[k][2]),xytext=(pts[k-1][0],pts[k-1][2]),arrowprops=dict(arrowstyle='->',color=styles[n],lw=1),zorder=9)
    spawns(ax,d)
    rect(ax,d['bounds'],fill=False,edgecolor='#4c6474',lw=.8,linestyle='--')

def overview(ds):
    fig,axs=plt.subplots(1,2,figsize=(12,11))
    fig.suptitle('INKWAVE / MAP 3 — ORIGINAL TERRAIN DESIGN',fontsize=18,weight='bold',y=.99)
    for ax,d in zip(axs,ds):plan(ax,d,route=True)
    legend=[Patch(color=color(y),label=f'y {y:g}') for y in [0,1.2,2.4,3.6,4.8,6]]
    legend += [Patch(facecolor=WATER,label='Water / no floor'),Patch(facecolor='white',hatch='///',label='Ramp (arrow up)'),Patch(facecolor='white',hatch='xx',label='Grate'),Patch(facecolor=INK,label='Solid cover')]
    fig.legend(handles=legend,ncol=5,loc='lower center',bbox_to_anchor=(.5,.015),frameon=False,fontsize=8)
    fig.text(.5,.075,'A route examples: dark = main; wine = high market / gantry; green = low branch; violet = east / cargo. Exact paths: coordinates.md.',ha='center',fontsize=8)
    fig.text(.5,.001,'Same scale: all plan panels use X = -48..48, Z = -76..76 WU. Dotted magenta = stacked floors. Dashed pink = zone.',ha='center',fontsize=8)
    fig.tight_layout(rect=(0,.095,1,.965));save(fig,'overview')

def layer_sheets(ds):
    for d in ds:
      levels=sorted(set(s['y'] for s in d['floors']))
      fig,axs=plt.subplots(2,3,figsize=(15,18))
      fig.suptitle(d['name']+' / EXACT HEIGHT LAYERS',fontsize=20,weight='bold')
      for i,ax in enumerate(axs.flat):
        if i<len(levels):plan(ax,d,layer=levels[i],ids=True)
        else:
          ax.axis('off');ax.text(.04,.9,'KEY\n\nColored: floor at this exact Y\nGrey: floor at another Y\nBlue: no projected floor\nHatched: full ramp footprint crossing Y\nCross-hatched: grate\nDark: obstacle at this Y\nFxx IDs: coordinates.md\n\nDo not treat grey as water.\nOverhead floors may hide water below;\nsee sections and the blockout.\n\nAll panels have identical scale.',transform=ax.transAxes,va='top',fontsize=13,linespacing=1.7)
      fig.text(.5,.02,'KEY: colored = exact-Y floor; grey = other-height floor; blue = no projected floor; dark = obstacle; /// = ramp; xx = grate.',ha='center',fontsize=9)
      fig.text(.5,.006,'Ramps show their whole footprint for each crossed level; this is not flat floor area at that level. All panels use the same X/Z scale.',ha='center',fontsize=9)
      fig.tight_layout(rect=(0,.035,1,.975));save(fig,d['id']+'-layers')

def sections(ds):
    fig,axs=plt.subplots(3,2,figsize=(15,10))
    specs=[ [('z',-3),('x',-25),('z',-40)], [('z',-24),('z',-44),('x',7)] ]
    for col,d in enumerate(ds):
      for row,(axis,value) in enumerate(specs[col]):
        ax=axs[row,col];ax.set_facecolor('#f5f9fc');ax.axhline(d['waterY'],c='#1682b0',ls='--',lw=1)
        for s in sorted(surfaces(d),key=lambda s:height(s,*center(s))):
          r=s['rect'];test=(r[2],r[3]) if axis=='z' else (r[0],r[1])
          if not test[0]<=value<=test[1]:continue
          lo,hi=(r[0],r[1]) if axis=='z' else (r[2],r[3])
          p0=(lo,value) if axis=='z' else (value,lo);p1=(hi,value) if axis=='z' else (value,hi)
          top0,top1=height(s,*p0),height(s,*p1);bot0,bot1=bottom(s,*p0),bottom(s,*p1)
          ax.fill([lo,hi,hi,lo],[bot0,bot1,top1,top0],facecolor=color((top0+top1)/2),edgecolor='#3f596d',lw=.6,hatch='xx' if s.get('material')=='grate' else None)
        for o in d['obstacles']:
          r=o['rect'];test=(r[2],r[3]) if axis=='z' else (r[0],r[1])
          if test[0]<=value<=test[1]:
            lo,hi=(r[0],r[1]) if axis=='z' else (r[2],r[3]);ax.add_patch(Rectangle((lo,o['y0']),hi-lo,o['y1']-o['y0'],facecolor=INK))
        ax.set(title=f"{d['name']} | {axis.upper()} = {value:g}",xlabel=('X' if axis=='z' else 'Z')+' / WU',ylabel='Y / WU',ylim=(-4.5,9),xlim=(-45,45) if axis=='z' else (-74,74))
        ax.grid(alpha=.2);ax.set_yticks([-4,-1.6,0,1.2,2.4,3.6,4.8,6,8])
    fig.suptitle('SECTIONS / exact coordinates; vertical scale exaggerated for legibility',fontsize=16,weight='bold')
    fig.text(.5,.01,'Dark = solid cover. Blue dashed line = runtime water Y -1.6. Blank under a slab is air, not filled ground. Cuts can pass between routes.',ha='center',fontsize=9)
    fig.tight_layout(rect=(0,.03,1,.95));save(fig,'sections')

def connections(ds,vs):
    fig,axs=plt.subplots(1,2,figsize=(14,12))
    for ax,d in zip(axs,ds):
      scaffold(ax,d['name']+' / surface connection graph')
      ss=surfaces(d);lookup={s['id']:s for s in ss};lab=labels(d)
      for s in ss:rect(ax,s['rect'],facecolor='#eef1f3',edgecolor='#b8c6d0',lw=.3)
      for e in vs[d['id']]['graph']['edges']:
        a,b=lookup[e['a']],lookup[e['b']];x0,z0=center(a);x1,z1=center(b)
        ax.plot([x0,x1],[z0,z1],color='#a2aeba',lw=.85,zorder=2)
      for s in ss:
        x,z=center(s);y=height(s,x,z);ax.scatter([x],[z],s=18,color=[color(y)],edgecolor=INK,lw=.4,marker='s' if s['kind']=='ramp' else 'o',zorder=3)
        if z<=0 and s['kind']=='floor':ax.annotate(lab[s['id']]+f' / {y:g}',(x,z),xytext=(2,3),textcoords='offset points',fontsize=5.7,color=INK,zorder=4,bbox=dict(facecolor='white',alpha=.7,edgecolor='none',pad=.2))
      spawns(ax,d)
    fig.suptitle('CONNECTIONS WITH HEIGHT / geometry-derived shared edges',fontsize=18,weight='bold')
    fig.text(.5,.025,'Circles = floor; squares = ramp. Labels Fxx / Y in WU (Alpha half). Lines are shared-edge adjacency, not walking chords through rooms.',ha='center',fontsize=9)
    fig.text(.5,.01,'Every seam coordinate, clear width and endpoint height is listed in connections.csv. A projected crossing alone never creates an edge.',ha='center',fontsize=9)
    fig.tight_layout(rect=(0,.045,1,.96));save(fig,'connectivity')

def distributions(ds,vs):
    fig,axs=plt.subplots(2,2,figsize=(13,8))
    for col,d in enumerate(ds):
      m=vs[d['id']]['metrics'];ys=list(m['flatSolidByHeight']);areas=list(m['flatSolidByHeight'].values());pcts=list(m['flatHeightPercent'].values())
      ax=axs[0,col];ax.bar(ys,areas,color=[color(float(y)) for y in ys]);ax.set(title=d['name']+' / non-ramp solid floor',xlabel='Y / WU',ylabel='net horizontal WU²')
      ax.set_ylim(0,max(areas)*1.23)
      for i,(a,p) in enumerate(zip(areas,pcts)):ax.text(i,a+max(areas)*.025,f'{a:,.1f}\n{p:.1f}%',ha='center',fontsize=8)
      ax=axs[1,col]
      chosen=[r for r in d['routes'] if r['team']=='A' and 'return' not in r['id'] and 'recovery' not in r['id']][:4]
      for route in chosen:
        pts=route['points'];dist=[0.]
        for a,b in zip(pts,pts[1:]):dist.append(dist[-1]+math.dist(a,b))
        ax.plot(dist,[p[1] for p in pts],marker='.',ms=3,label=route['id'],lw=1.5)
      ax.set(title='Route height profiles (different endpoints)',xlabel='Cumulative 3D polyline length / WU',ylabel='Y / WU',ylim=(-.2,6.5));ax.legend(fontsize=7);ax.grid(alpha=.2)
    fig.suptitle('HEIGHT AUDIT / cover tops, grates and ramps excluded from flat-height percentages',weight='bold',fontsize=15)
    fig.text(.5,.01,'Profiles show geometric paths, not travel times or first-contact equality. Some flank routes end on a vantage or branch from a main route.',ha='center',fontsize=9)
    fig.tight_layout(rect=(0,.035,1,.95));save(fig,'height-distribution')

def tables(ds,vs):
    out=['# 座標台帳 — 図とブロックアウトの共通データ','','`tidewater_design.py` / `kelpline_design.py` → `design.json` から自動生成。単位WU、面積WU²。X/Z矩形は `[xmin,xmax,zmin,zmax]`、Yは床上面。床下面と障害物は別欄。ゲーム本体への実装ではない。','', '床の占有面積は障害物の接地面を差し引く。坂の上下端は軸座標の小さい側→大きい側の順。座標表にない暗黙の全面床は存在しない。','']
    for d in ds:
      sid=d['id'];lab=labels(d);r=vs[sid]
      out += ['## '+d['name'],'','### 床・坂','','|図ID / データID|XZ範囲|上面Y / 坂端Y|下面 / 厚み|素材|役割|','|---|---|---|---|---|---|']
      for s in surfaces(d):
        yh=f"{s['y']:g}" if s['kind']=='floor' else f"{s['axis']}: {s['y0']:g} → {s['y1']:g}"
        bot=f"{s['bottom']:g}" if s['kind']=='floor' else f"厚み{s.get('thickness',.6):g}（モデル鉛直厚）"
        out.append(f"|{lab[s['id']]} / `{s['id']}`|{s['rect']}|{yh}|{bot}|{s.get('material','ramp')}|{s['role']}|")
      out += ['','### 坂の幅・勾配','','|ID|水平長|幅|勾配|角度|','|---|---:|---:|---:|---:|']
      for s in r['ramps']:out.append(f"|`{s['id']}`|{s['run']:.2f}|{s['width']:.2f}|{100*s['grade']:.2f}%|{s['angleDegrees']:.2f}°|")
      out += ['','### 障害物','','|ID|XZ範囲|下端Y|上端Y|側面塗装案|役割|','|---|---|---:|---:|---|---|']
      for o in d['obstacles']:out.append(f"|`{o['id']}`|{o['rect']}|{o['y0']}|{o['y1']}|{o['paint']}|{o['role']}|")
      out += ['','### スポーン・ルール物','','```json',json.dumps(dict(spawns=d['spawns'],rules=d['rules']),ensure_ascii=False,indent=2),'```','','### 経路・落下・復帰','','|経路|3D折線長|用途|座標列|','|---|---:|---|---|']
      for route in d['routes']:out.append(f"|`{route['id']}`|{r['routes'][route['id']]['length3D']:.3f}|{route['role']}|`{route['points']}`|")
      out += ['','高台で終わる経路・下層中央で終わる経路・主経路からの枝を同じ終点への最短距離として比較しない。移動速度・泳ぎ・インク・加減速・敵による妨害を含まない。','','```json',json.dumps(d['drops'],ensure_ascii=False,indent=2),'```','']
    (ROOT/'coordinates.md').write_text('\n'.join(out)+'\n')
    with (ROOT/'connections.csv').open('w',newline='') as f:
      w=csv.writer(f);w.writerow(['stage','from','to','seam_XZ_start','seam_XZ_end','Y_start','Y_end','clear_width_WU','center_width_for_radius_0.675'])
      for d in ds:
        for e in vs[d['id']]['graph']['edges']:w.writerow([d['id'],e['a'],e['b'],e['seam'][0],e['seam'][1],*e['y'],e['width'],e['effectiveWidth']])

def main():
    ds=[tidewater(),kelpline()];vs={d['id']:validate(d) for d in ds}
    data={'schema':1,'sourceHead':'b208addacc61009fba44ae973d5288b6f315f303','units':'WU; no SI calibration','stages':ds}
    (ROOT/'design.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'validation.json').write_text(json.dumps(vs,ensure_ascii=False,indent=2)+'\n')
    tables(ds,vs);overview(ds);layer_sheets(ds);sections(ds);connections(ds,vs);distributions(ds,vs)
    template=ROOT/'viewer_template.html'
    if template.exists():
      raw=template.read_text();assert raw.count('__DESIGN_DATA__')==1
      (ROOT/'blockout.html').write_text(raw.replace('__DESIGN_DATA__',json.dumps(dict(stages=ds,validation=vs),ensure_ascii=False,separators=(',',':')).replace('</','<\\/')))
    inputs=['tidewater_design.py','kelpline_design.py','geometry.py','build.py','viewer_template.html']
    hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in inputs}
    (ROOT/'build-manifest.json').write_text(json.dumps(dict(schema=1,inputSha256=hashes,sourceHead=data['sourceHead'],coordinateFile='design.json',validationFile='validation.json',noGameImports=True),indent=2)+'\n')
    failures=[]
    for d in ds:
      v=vs[d['id']];m=v['metrics'];routefails=sum(len(x['failures']) for x in v['routes'].values())
      print(d['id'], 'net union',round(m['netProjectedUnionArea'],3),'layered',round(m['netLayeredProjectedArea'],3),'largest height%',m['largestHeightShare'],'components',len(v['graph']['components']),'route failures',routefails,'tower failures',len(v['tower']['failures']))
      if routefails or v['symmetryFailures'] or m['clearanceFailures'] or len(v['graph']['components'])!=1 or v['tower']['failures'] or v['tower']['liftWarnings']:failures.append(d['id'])
    if failures:raise SystemExit('Model validation failed: '+','.join(failures))
if __name__=='__main__':main()
