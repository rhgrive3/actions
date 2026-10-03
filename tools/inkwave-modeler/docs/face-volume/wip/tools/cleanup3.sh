#!/bin/bash
log(){ echo "$(date +%T) $*" >> /dev/shm/cleanup3.log; }
del(){ if [ -e "$1" ]; then s=$(du -sh --apparent-size "$1" 2>/dev/null | cut -f1); rm -rf -- "$1" && log "deleted $s $1"; fi; }
for f in dot-transfer-20261001 dot-selected-20260930-1623.tar.gz dot-selected-20260930-1619.tar.gz dot-selected-names.txt dot-extra-20260930.tar.gz; do del "/mnt/workspace/$f"; done
for f in opencode.db opencode.db-wal opencode.db-shm; do del "/mnt/workspace/.dev-state/xdg/data/opencode/$f"; done
n=0; s=0
while IFS= read -r -d '' f; do b=$(stat -c %s "$f"); rm -f -- "$f" && n=$((n+1)) && s=$((s+b)); done < <(find /mnt/workspace/.dev-state/codex/sessions -type f ! -newermt '2026-10-03 00:00' -print0)
log "deleted codex sessions files $n ($((s/1048576)) MB)"
log ALLDONE
