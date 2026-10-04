#!/bin/bash
# render_only.sh NAME BLEND : beauty crops (CROP=face unless CROP set) of front, q34R, sideR into t_NAME; NAME.done
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp
K=/tmp/inkjaw-work; N=$1; O=$K/t_$N; mkdir -p $O; rm -f $K/$N.done
cd /mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929
for v in ${VIEWS:-front q34R sideR}; do CROP=${CROP:-face} VIEWS=$v LOOKS=beauty SAMPLES=${SAMPLES:-32} SCALE=3 blender -b $2 --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1 & done
wait; echo done > $K/$N.done
