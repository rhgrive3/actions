# score.py DIR.. : per view mean |dL|, |da|, |db| over the skin vs the reference (ldiff's mask), and the sum
import sys, subprocess, re
for d in sys.argv[1:]:
    tot = {}
    for ch in (0, 1, 2):
        o = subprocess.run(['python3', '/tmp/jawtools/ldiff.py', '/dev/null', d, str(ch)], capture_output=True, text=True).stdout
        for line in o.splitlines():
            v = line.split()[1]; m = float(re.search(r'mean \|d\|\s+([\d.]+)', line).group(1)); mean = float(re.search(r'mean d\s+([-+\d.]+)', line).group(1))
            tot.setdefault(v, []).append((mean, m))
    print('%-8s' % d.split('/')[-1] + ''.join('  %s L %+4.1f/%3.1f a %+4.1f/%3.1f b %+4.1f/%3.1f sum %4.1f' % (v, *[x for p in t for x in p], sum(p[1] for p in t)) for v, t in tot.items()))
