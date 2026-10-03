#!/bin/bash
log(){ echo "$(date +%T) $*" >> /dev/shm/cleanup2.log; }
del(){ if [ -e "$1" ]; then s=$(du -sh --apparent-size "$1" 2>/dev/null | cut -f1); rm -rf -- "$1" && log "deleted $s $1"; fi; }
del /mnt/workspace/.dev-state/xdg/cache/huggingface
del /mnt/workspace/.dev-state/npm-cache
del /mnt/workspace/.dev-state/pip-cache
del /mnt/workspace/.dev-state/apt-cache
log ALLDONE
