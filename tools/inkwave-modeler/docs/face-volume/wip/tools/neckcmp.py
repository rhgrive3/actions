# neckcmp.py DIR.. : numbers for the neck vs the reference
#   front: left/right edge per row 436..458 (the neck under the jaw)
#   sideR: neck front x per row 440..466, and the under-jaw height per column 2000..2070
import sys, numpy as np
sys.argv = [sys.argv[0], '/dev/null'] + sys.argv[1:]
src = open('/tmp/jawtools/trace.py').read()
exec(src[:src.index('out_rows = []')])
dirs = sys.argv[2:]
for v in ('front', 'sideR'):
    x0, y0, x1, y1 = BOX[v]
    R = edges(ref_fig(v), v)
    Ms = [edges(np.asarray(model(d, v, 'clay')).astype(float).max(2) > 14, v) for d in dirs]
    if v == 'front':
        print('front  y   ref L/R    ' + '  '.join('%-12s' % d.rstrip('/').split('/')[-1] for d in dirs))
        for y in range(436, 459, 2):
            r = y - y0
            print('      %d  %4.0f %4.0f   ' % (y, R[r, 0] + x0, R[r, 1] + x0) + '  '.join('%4.0f %4.0f   ' % (M[r, 0] + x0, M[r, 1] + x0) for M in Ms))
    else:
        # neck front: per row, the front-most figure pixel in the band below the chin
        fig_r = ref_fig(v); figs = [np.asarray(model(d, v, 'clay')).astype(float).max(2) > 14 for d in dirs]
        print('sideR neck front x  y   ref   ' + '  '.join('%-10s' % d.rstrip('/').split('/')[-1] for d in dirs))
        for y in range(440, 467, 2):
            r = y - y0
            def nf(f):
                idx = np.nonzero(f[r, :int(2050 - x0)])[0]
                return idx.max() + x0 if len(idx) else np.nan
            print('      %d  %5.0f   ' % (y, nf(fig_r)) + '  '.join('%5.0f     ' % nf(f) for f in figs))
        RU = underside(fig_r); MU = [underside(f) for f in figs]
        print('sideR under-jaw y  x   ref   ' + '  '.join('%-10s' % d.rstrip('/').split('/')[-1] for d in dirs))
        for x in range(1995, 2071, 5):
            c = x - x0
            print('      %d  %5.0f   ' % (x, RU[c] + y0) + '  '.join('%5.0f     ' % (U[c] + y0) for U in MU))
