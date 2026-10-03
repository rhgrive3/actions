#!/bin/bash
# render3.sh BLEND OUTDIR [beauty]
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp
mkdir -p "$2"; cd /mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929
for v in front q34R sideR; do
  VIEWS=$v LOOKS=beauty SAMPLES=48 SCALE=3 blender -b "$1" --python tools/wide_render.py -- "$2" 1.6 > /dev/null 2>&1
  [ "${3:-both}" = both ] && VIEWS=$v LOOKS=clay SCALE=3 blender -b "$1" --python tools/wide_render.py -- "$2" 1.6 > /dev/null 2>&1
done
echo done > "$2/DONE"
