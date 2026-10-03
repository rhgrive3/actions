#!/bin/bash
# fbb.sh NAME : like fb.sh but makes its own bare front (geometry changed): F4 -> restores -> no-paint -> bake -> paint
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp TMP=/tmp/inkjaw-work/tmp TEMP=/tmp/inkjaw-work/tmp
N=$1; K=/tmp/inkjaw-work; O=/tmp/inkjaw-work/f_$N; mkdir -p $O; T=/tmp/inkjaw-work/$N.tmp.blend; L=$O/build.log; P=$K/p_$N.json
python3 - $P $O/bare_front.png <<'PY'
import json,sys; p=json.load(open(sys.argv[1]))
for k in ('paint_nose','paint_mouth'): p[k]['bare']=sys.argv[2]
json.dump(p,open(sys.argv[1],'w'),indent=1)
PY
cd /tmp/inkjaw/tools/inkwave-modeler
blender -b ${SRC:-$K/F4.blend} --python scripts/inkwave_lash_rebuild.py -- --restore --save $T > $L 2>&1
blender -b $T --python scripts/inkwave_body_shape.py -- --restore --save $T >> $L 2>&1
blender -b $T --python scripts/inkwave_face_volume.py -- --params $P --no-paint --save $T.bare.blend >> $L 2>&1
blender -b $T.bare.blend --python analysis/face_volume/tools/bake_front.py -- $O/bake >> $L 2>&1
cp $O/bake/front_beauty.png $O/bare_front.png
blender -b $T --python scripts/inkwave_face_volume.py -- --params $P --save $T >> $L 2>&1
blender -b $T --python scripts/inkwave_body_shape.py -- --save $T >> $L 2>&1
blender -b $T --python scripts/inkwave_lash_rebuild.py -- --save $K/$N.blend >> $L 2>&1
rm -f "/tmp/inkjaw-work/$N.tmp.blend" "/tmp/inkjaw-work/$N.tmp.blend1" "/tmp/inkjaw-work/$N.tmp.blend.bare.blend" "/tmp/inkjaw-work/$N.tmp.blend.bare.blend1" "/tmp/inkjaw-work/$N.blend1"
rm -rf "/tmp/inkjaw-work/f_$N/bake"
grep -E "Traceback|Error" $L | head -3 > $K/$N.fout
cd /mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-volume-20260929
for v in ${VIEWS:-front q34R sideR}; do VIEWS=$v LOOKS=beauty SAMPLES=48 SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1; VIEWS=$v LOOKS=clay SCALE=3 blender -b $K/$N.blend --python tools/wide_render.py -- $O 1.6 > /dev/null 2>&1; done
echo done > $K/$N.fdone
