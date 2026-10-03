#!/bin/bash
# final_qa.sh NAME : build NAME from the V91 master with the repo params (build.sh), then QA into qa_NAME
export PATH=/mnt/workspace/.dev-state/agent-work/scratch/xbin:$PATH TMPDIR=/tmp/inkjaw-work/tmp TMP=/tmp/inkjaw-work/tmp TEMP=/tmp/inkjaw-work/tmp
K=/tmp/inkjaw-work; N=$1; Q=$K/qa_$N; mkdir -p $Q; BC=/mnt/workspace/.claude-homes/2/.claude/skills/inkwave-face-edit/tools/blendcmp.py
TREE=/mnt/workspace/.dev-state/agent-work/evidence/inkwave-blender-migration/qa/export_tree.json
cd /tmp/inkjaw/tools/inkwave-modeler
bash analysis/face_volume/tools/build.sh $K/V91master.blend $K/$N.blend blender -- --export $K/$N.glb --game $K/${N}_game.glb > $Q/build.out 2>&1; echo BUILD $? > $Q/summary.txt
cp analysis/face_volume/bare_front.png $K/bare_$N.png
( bash analysis/face_volume/tools/build.sh $K/$N.blend $K/${N}_B.blend blender -- --export $K/${N}_B.glb > $Q/rebuild.out 2>&1; blender -b --python $BC -- $K/$N.blend $K/${N}_B.blend $Q/idem.json 2>&1 | grep BCMP > $Q/idem.txt; cmp $K/$N.glb $K/${N}_B.glb && echo GLB_SAME >> $Q/idem.txt; cmp analysis/face_volume/bare_front.png $K/bare_$N.png && echo BARE_SAME >> $Q/idem.txt ) &
( blender -b $K/$N.blend --python scripts/inkwave_lash_rebuild.py -- --restore --save $K/${N}_R.blend >/dev/null 2>&1; blender -b $K/${N}_R.blend --python scripts/inkwave_body_shape.py -- --restore --save $K/${N}_R.blend >/dev/null 2>&1; blender -b $K/${N}_R.blend --python scripts/inkwave_face_volume.py -- --restore --save $K/${N}_R.blend >/dev/null 2>&1; blender -b --python $BC -- $K/T0.blend $K/${N}_R.blend $Q/restore.json 2>&1 | grep BCMP > $Q/restore.txt ) &
( blender -b $K/$N.blend --python scripts/inkwave_blender_reopen_check.py -- --out $Q/reopen --samples 8 > $Q/reopen.out 2>&1; grep -o '"pass": [a-z]*' $Q/reopen.out > $Q/reopen.txt ) &
wait
F=(--tree $TREE --glb source=blender/inkwave_character_source.glb --edited '^HEAD_(face|skin)' --edit-budget-mm 18 --rebuilt '^(HEAD_(skin_08|skin_07|skin_05|skin_02|eyes)|BODY_torso$|HEAD_face_0[23]$|HEADGEAR_headgear(_02)?$|BODY_leg_[LR]$|LEGWEAR_cloth(_0[234])?$|CLOTHES_cloth_(6[012]|1[4-7]|18|2[123]|4[5-9]|5[0-2])$)' --rebuilt-budget-mm 30)
node scripts/inkwave_roundtrip_qa.mjs "${F[@]}" --glb master=$K/V91.glb --out $Q/rt_base.json > $Q/rt_base.out 2>&1
node scripts/inkwave_roundtrip_qa.mjs "${F[@]}" --glb master=$K/$N.glb --glb game=$K/${N}_game.glb --out $Q/rt_new.json > $Q/rt_new.out 2>&1
node scripts/inkwave_roundtrip_qa.mjs "${F[@]}" --glb master=$Q/reopen/reopen_export.glb --out $Q/rt_reopen.json > $Q/rt_reopen.out 2>&1
python3 - $Q >> $Q/summary.txt <<'PY'
import sys
Q=sys.argv[1]
def probs(f,c):
    out=[];cur=None
    for l in open(f'{Q}/{f}.out'):
        if l.startswith(('PASS','FAIL')): cur=l.split()[2]; continue
        if l.strip().startswith('- ') and cur==c: out.append(l.strip())
    return out
b=probs('rt_base','master'); v=probs('rt_new','master'); g=probs('rt_new','game'); r=probs('rt_reopen','master')
print('RT base',len(b),'new',len(v),'NEW LINES',[x for x in v if x not in b],'GONE',[x for x in b if x not in v],'reopen==new',r==v,'game==master',g==v)
PY
cat $Q/idem.txt $Q/restore.txt $Q/reopen.txt >> $Q/summary.txt; cmp $K/$N.glb $K/${N}_game.glb && echo GAME_SAME >> $Q/summary.txt
echo QA_DONE >> $Q/summary.txt
