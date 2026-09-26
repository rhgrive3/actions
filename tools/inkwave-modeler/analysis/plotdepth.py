import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, sys
f = np.load(sys.argv[1]); out = sys.argv[2]
DR, DM, DT, m, LR = f['DR'], f['DM'], f['DT'], f['m'], f['LR']
px = 1000/842/2
rows = {'eye': int(LR[[468,473],1].mean()), 'nose tip': int(LR[1,1]), 'mouth': int(LR[13,1]), 'chin-8mm': int(LR[152,1] - 8/px)}
fig, ax = plt.subplots(2, 3, figsize=(16, 9))
for a, (k, r) in zip(ax.flat, rows.items()):
    x = (np.arange(DR.shape[1]) - LR[1,0]) * px
    for D, lab, st in ((DR, 'ref (sapiens)', 'r-'), (DM, 'model (sapiens)', 'b-'), (DT, 'model (true)', 'k--')):
        a.plot(x, D[r], st, label=lab)
    a.set_title(f'horizontal @ {k} (row {r})'); a.set_xlabel('x mm from nose'); a.grid(1); a.legend(fontsize=7)
c = int(LR[1,0])
y = -(np.arange(DR.shape[0]) - LR[1,1]) * px
a = ax.flat[4]
for D, lab, st in ((DR, 'ref', 'r-'), (DM, 'model(s)', 'b-'), (DT, 'model true', 'k--')): a.plot(D[:, c], y, st, label=lab)
a.set_title('vertical centre profile (z vs y)'); a.grid(1); a.legend(fontsize=7); a.set_xlabel('z mm'); a.set_ylabel('y mm from nose tip')
a = ax.flat[5]; cc = int(LR[1,0] + 30/px)
for D, lab, st in ((DR, 'ref', 'r-'), (DM, 'model(s)', 'b-'), (DT, 'model true', 'k--')): a.plot(D[:, cc], y, st, label=lab)
a.set_title('vertical profile x=+30mm (cheek)'); a.grid(1); a.legend(fontsize=7)
plt.tight_layout(); plt.savefig(out, dpi=70)
