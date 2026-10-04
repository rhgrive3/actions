#!/bin/bash
# fast.sh NAME : quick trial. J0 + face_volume(p_NAME.json) + body_shape -> NAME.blend, then in parallel:
#   clay (Workbench, whole frame, seconds) and beauty (Cycles, only the jaw / neck box: JAWCROP) for front, q34R, sideR
#   into t_NAME; writes NAME.done.  Colours differ from the official build (no lash_rebuild: old face material).
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp TMP=/tmp/inkjaw-work/tmp TEMP=/tmp/inkjaw-work/tmp
K=/tmp/inkjaw-work; N=$1; O=$K/t_$N; mkdir -p $O; rm -f $K/$N.done
cd /tmp/inkjaw/tools/inkwave-modeler
S=$(date +%s)
blender -b /mnt/workspace/.dev-state/agent-work/checkpoints/inkwave-face-volume-20260929/J0.blend --python scripts/inkwave_face_volume.py -- --params $K/p_$N.json --save $K/$N.blend > $O/build.log 2>&1
blender -b $K/$N.blend --python scripts/inkwave_body_shape.py -- --save $K/$N.blend >> $O/build.log 2>&1
rm -f $K/$N.blend1; B=$(date +%s)
cd /mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929
for v in ${VIEWS:-front q34R sideR}; do
  VIEWS=$v LOOKS=clay SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1 &
  [ -z "$NOBEAUTY" ] && JAWCROP=1 VIEWS=$v LOOKS=beauty SAMPLES=${SAMPLES:-32} SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1 &
done
wait
grep -E "Traceback|Error:" $O/build.log | head -3 > $K/$N.out
echo "build $((B - S)) s, renders $(( $(date +%s) - B )) s" >> $K/$N.out
echo done > $K/$N.done
