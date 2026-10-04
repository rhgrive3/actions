# tstamp.py : prefix each stdin line with seconds since start (for timing a Blender run)
import sys, time
t0 = time.time()
for l in sys.stdin:
    sys.stdout.write('%7.1f %s' % (time.time() - t0, l)); sys.stdout.flush()
