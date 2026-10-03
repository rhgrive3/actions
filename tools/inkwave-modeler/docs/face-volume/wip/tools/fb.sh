#!/bin/bash
# fb.sh NAME : full chain like build.sh on F4.blend with p_NAME.json, keeping the repo bare_front.png (same geometry),
# then renders (VIEWS, beauty 48 samples + clay, SCALE 3) into f_NAME; NAME.fdone
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp TMP=/tmp/inkjaw-work/tmp TEMP=/tmp/inkjaw-work/tmp
K=/tmp/inkjaw-work; N=$1; O=$K/f_$N; mkdir -p $O; T=$K/$N.tmp.blend; L=$O/build.log
cd /tmp/inkjaw/tools/inkwave-modeler
blender -b ${SRC:-$K/F4.blend} --python scripts/inkwave_lash_rebuild.py -- --restore --save $T > $L 2>&1
blender -b $T --python scripts/inkwave_body_shape.py -- --restore --save $T >> $L 2>&1
blender -b $T --python scripts/inkwave_face_volume.py -- --params $K/p_$N.json --save $T >> $L 2>&1
blender -b $T --python scripts/inkwave_body_shape.py -- --save $T >> $L 2>&1
blender -b $T --python scripts/inkwave_lash_rebuild.py -- --save $K/$N.blend >> $L 2>&1
rm -f $T ${T}1 $K/$N.blend1
grep -E "Traceback|Error" $L | head -3 > $K/$N.fout
cd /mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929
for v in ${VIEWS:-front q34R sideR}; do VIEWS=$v LOOKS=beauty SAMPLES=48 SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1; VIEWS=$v LOOKS=clay SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1; done
echo done > $K/$N.fdone
