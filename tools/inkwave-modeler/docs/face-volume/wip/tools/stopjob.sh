#!/bin/bash
# stopjob.sh NAME.. : stop jt.sh / fbb.sh runs and their Blender children for these test names
for n in "$@"; do
  for p in $(pgrep -f "jt.sh $n\$|fbb.sh $n\$"); do pkill -P "$p"; kill "$p"; done
  for p in $(pgrep -f "/tmp/inkjaw-work/$n\.blend|p_$n\.json"); do kill "$p"; done
done
