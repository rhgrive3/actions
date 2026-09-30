#!/bin/bash
# build.sh <master.blend> <out.blend> [blender]: the whole chain on a copy of the master.
#   lash restore -> face volume without paint -> bare front render (bare_front.png) -> face volume -> lash rebuild
set -e
cd "$(dirname "$0")/../../.."
B=${3:-blender}; T=$2.tmp.blend
$B -b "$1" --python scripts/inkwave_lash_rebuild.py -- --restore --save $T > $2.log 2>&1
$B -b $T --python scripts/inkwave_face_volume.py -- --no-paint --save $T.bare.blend >> $2.log 2>&1
$B -b $T.bare.blend --python analysis/face_volume/tools/bake_front.py -- $2.bake >> $2.log 2>&1
cp $2.bake/front_beauty.png analysis/face_volume/bare_front.png
$B -b $T --python scripts/inkwave_face_volume.py -- --save $T >> $2.log 2>&1
$B -b $T --python scripts/inkwave_lash_rebuild.py -- --save "$2" >> $2.log 2>&1
rm -rf $T ${T}1 $T.bare.blend $T.bare.blend1 $2.bake
grep -E "FACE_VOLUME paint|mouth line|LASH_REBUILD done|Traceback|Error" $2.log
