#!/bin/bash
# stopjob.sh NAME.. : stop jt.sh / jtc.sh / fast.sh / fbb.sh runs and their Blender children for these test names.
# Never kills itself or the shells that called it (their command lines contain the names too).
mine=" $$ "; p=$PPID
while [ -n "$p" ] && [ "$p" -gt 1 ]; do mine="$mine$p "; p=$(ps -o ppid= -p "$p" | tr -d ' '); done
for n in "$@"; do
  for p in $(pgrep -f "(jt|jtc|fast|fbb)\.sh $n\$"); do [[ $mine == *" $p "* ]] || { pkill -P "$p"; kill "$p"; }; done
  for p in $(pgrep -f "/tmp/inkjaw-work/$n\.blend|p_$n\.json"); do [[ $mine == *" $p "* ]] || kill "$p"; done
done
