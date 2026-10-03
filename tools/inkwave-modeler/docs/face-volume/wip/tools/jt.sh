#!/bin/bash
# jt.sh NAME : J0 + face_volume(p_NAME) + body_shape -> NAME.blend, hi renders (VIEWS) in t_NAME, fold check, NAME.done
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp TMP=/tmp/inkjaw-work/tmp TEMP=/tmp/inkjaw-work/tmp
K=/tmp/inkjaw-work; N=$1; O=$K/t_$N; mkdir -p $O; T=/tmp/jawtools
cd /tmp/inkjaw/tools/inkwave-modeler
blender -b /mnt/workspace/.dev-state/agent-work/checkpoints/inkwave-face-volume-20260929/J0.blend --python scripts/inkwave_face_volume.py -- --params $K/p_$N.json --save $K/$N.blend > $O/build.log 2>&1
blender -b $K/$N.blend --python scripts/inkwave_body_shape.py -- --save $K/$N.blend >> $O/build.log 2>&1
rm -f $K/$N.blend1
grep -E "neck_widen|jaw_tuck|Traceback|Error" $O/build.log | head -4 > $K/$N.out
cd /mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929
for v in ${VIEWS:-q34R sideR front}; do VIEWS=$v LOOKS=clay,beauty SAMPLES=32 SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1; done
blender -b $K/$N.blend --python $T/fold.py -- $K/fold_$N.npz 2>&1 | grep FOLD >> $K/$N.out
echo done > $K/$N.done
