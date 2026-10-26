import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

folder=Path(__file__).resolve().parent
data=json.loads((folder/'final-comparison.json').read_text())
plt.rcParams.update({'svg.fonttype':'none','svg.hashsalt':'inkwave-final65','font.size':10})
fig,axes=plt.subplots(1,3,figsize=(14,4.5),layout='constrained')
colors=['#6b7280','#007f8b']
for i,(name,run) in enumerate(data['raf18']['runs'].items()):
    rows=run['released'];x=[r['cycle'] for r in rows]
    label='Baseline e007' if i==0 else 'Candidate 65fa7f1'
    axes[0].plot(x,[r['heapMiB'] for r in rows],'.-',color=colors[i],label=label)
    axes[1].plot(x,[r['geometries'] for r in rows],'.-',color=colors[i],label=label)
for i,(name,run) in enumerate(data['native']['runs'].items()):
    rows=run['released'];x=[r['cycle'] for r in rows]
    axes[2].plot(x,[r['heapMiB'] for r in rows],'o-',color=colors[i])
axes[0].set(title='LOW: heap after each exit + GC',xlabel='Match exit',ylabel='JS heap (MiB)',xticks=[1,3,6,9,12,15,18])
axes[1].set(title='LOW: Three geometries after exit',xlabel='Match exit',ylabel='Geometry count',xticks=[1,3,6,9,12,15,18])
axes[2].set(title='HIGH: native stage retirement',xlabel='Match exit',ylabel='JS heap (MiB)',xticks=[1,2,3],xticklabels=['Scorch','Tidewater','Scorch'])
for ax in axes:
    ax.grid(alpha=.2)
    ax.spines[['top','right']].set_visible(False)
axes[0].legend(loc='upper left',fontsize=9)
fig.suptitle('Normal RAF gameplay — Linux Chromium / SwiftShader; not iPad hardware',fontsize=14)
fig.supxlabel('LOW: 18 matches / ~24–25 minutes. Cache warming continues. HIGH baseline warm-ups record GL1282; all candidate captures GL0.',fontsize=9)
fig.savefig(folder/'memory-trends.svg',metadata={'Date':None})
print(folder/'memory-trends.svg')
