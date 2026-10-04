# run3.sh NAME.. : fast.sh for each name at once (env passes through), wait for all
for n in "$@"; do rm -f /tmp/inkjaw-work/$n.done; done
for n in "$@"; do setsid nohup bash /tmp/jawtools/fast.sh $n > /dev/null 2>&1 < /dev/null & done
for n in "$@"; do until [ -e /tmp/inkjaw-work/$n.done ]; do sleep 5; done; done
