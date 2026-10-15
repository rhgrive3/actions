#!/bin/bash
# usage: iterate.sh <outdir> <ids comma> [--no-held]  — build site into a private dir, render gallery, compare with refs
set -e
REPO=${REPO:-/home/user/actions}; SP=${SP:?set SP to your scratch workspace (see RESUME.md)}
OUT=$1; IDS=$2; shift 2
SITE=$OUT/site; mkdir -p $OUT
(cd $REPO && node scripts/build-inkwave.mjs inkwave-public $SITE > $OUT/build.log 2>&1) || { tail -20 $OUT/build.log; exit 1; }
(cd $REPO && timeout 1500 node scripts/render-inkwave-weapon-gallery.mjs --site $SITE --out $OUT --ids $IDS "$@" 2>&1 | cut -c1-600)
python3 -I $REPO/scripts/compare-inkwave-weapon-gallery.py $OUT $SP/refs $(echo $IDS | tr ',' ' ')
