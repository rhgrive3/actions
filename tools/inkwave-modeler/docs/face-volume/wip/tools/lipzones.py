# lipzones.py DIR.. : Lab of the lower-lip zones (outer left / right where the user saw brown, middle) vs reference
import sys, numpy as np
sys.argv = [sys.argv[0]] + sys.argv[1:]
src = open('/tmp/jawtools/lipmean.py').read(); exec(src[:src.index('out={}')])
Z = {'lowL outer': (212, 228, 416, 424), 'lowR outer': (248, 264, 416, 424), 'low mid': (236, 246, 420, 426),
     'under L': (214, 230, 424, 430), 'under R': (248, 264, 424, 430)}
for d in sys.argv[1:]:
    a, (ox, oy) = crop(d); row = '%-8s' % d.split('/')[-1]
    for n, (x0, x1, y0, y1) in Z.items():
        r = lab(sheet[y0:y1, x0:x1]).reshape(-1, 3).mean(0); v = lab(a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]).reshape(-1, 3).mean(0)
        row += ' | %s %s' % (n, ' '.join('%+5.1f' % x for x in v - r))
    print(row)
