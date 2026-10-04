K=/tmp/inkjaw-work; I=/mnt/workspace/.claude-homes/2/.claude/skills/inkwave-face-edit/tools
for n in "$@"; do
  blender -b $K/$n.blend --python $I/idmap.py -- front 130 205 230 245 4 $K/idc_${n}_front.png > /dev/null 2>&1 &
  blender -b $K/$n.blend --python $I/idmap.py -- q34R 150 205 210 245 4 $K/idc_${n}_q34R.png > /dev/null 2>&1 &
  blender -b $K/$n.blend --python $I/idmap.py -- sideR 190 205 250 245 4 $K/idc_${n}_sideR.png > /dev/null 2>&1 &
  blender -b $K/$n.blend --python $I/idmap.py -- sideL 150 205 210 245 4 $K/idc_${n}_sideL.png > /dev/null 2>&1 &
done; wait
