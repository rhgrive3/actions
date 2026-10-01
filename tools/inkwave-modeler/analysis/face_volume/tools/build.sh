#!/bin/bash
# build.sh <master.blend> <out.blend> [blender] [-- extra lash_rebuild args, e.g. --export X.glb --game Y.glb]:
# the whole chain on a copy of the master.
#   lash restore -> face volume without paint -> bare front render (bare_front.png) -> face volume -> body shape
#   -> lash rebuild
set -e
cd "$(dirname "$0")/../../.."
IN=$1; OUT=$2; B=${3:-blender}; shift 3 2>/dev/null || shift $#
[ "$1" = "--" ] && shift
T=$OUT.tmp.blend
$B -b "$IN" --python scripts/inkwave_lash_rebuild.py -- --restore --save $T > $OUT.log 2>&1
$B -b $T --python scripts/inkwave_body_shape.py -- --restore --save $T >> $OUT.log 2>&1
$B -b $T --python scripts/inkwave_face_volume.py -- --no-paint --save $T.bare.blend >> $OUT.log 2>&1
$B -b $T.bare.blend --python analysis/face_volume/tools/bake_front.py -- $OUT.bake >> $OUT.log 2>&1
cp $OUT.bake/front_beauty.png analysis/face_volume/bare_front.png
$B -b $T --python scripts/inkwave_face_volume.py -- --save $T >> $OUT.log 2>&1
$B -b $T --python scripts/inkwave_body_shape.py -- --save $T >> $OUT.log 2>&1
$B -b $T --python scripts/inkwave_lash_rebuild.py -- --save "$OUT" "$@" >> $OUT.log 2>&1
rm -rf $T ${T}1 $T.bare.blend $T.bare.blend1 $OUT.bake
grep -E "FACE_VOLUME paint|blush from|BODY_SHAPE navel|LASH_REBUILD done|EXPORT|Traceback|Error" $OUT.log
