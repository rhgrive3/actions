#!/bin/bash
# cleanup1.sh : delete clearly unneeded agent-work data (log to /dev/shm/cleanup1.log)
A=/mnt/workspace/.dev-state/agent-work
log(){ echo "$(date +%T) $*" >> /dev/shm/cleanup1.log; }
del(){ if [ -e "$1" ]; then s=$(du -sh --apparent-size "$1" 2>/dev/null | cut -f1); rm -rf -- "$1" && log "deleted $s $1"; fi; }
for d in ink-identity ink-volume inkwave-walk-20261002; do del "$A/checkouts/$d"; done
for d in staged-owner-sealed v2-sealed v3-result-sealed; do del "$A/checkouts/jev-realgame-final/$d"; done
for d in inkwave-face-sapiens code-audit-impl-20260923 code-audit-next-20260923 pinpoint-jev-probe-audit-20260923 inkwave-motion-detail-20261002; do del "$A/cache/$d"; done
for f in restored.blend restored.blend1 twice.blend twice.blend1 issue-8705-method-ids-900k.dex runtime-plain.js; do del "$A/scratch/$f"; done
find "$A/scratch/claude-0" -mindepth 1 -maxdepth 1 ! -newermt '2026-10-03 00:00' -print 2>/dev/null | while read p; do del "$p"; done
E=$A/evidence/inkwave-face-volume-20260929
for d in "$E"/*; do n=$(basename "$d"); case "$n" in tools|V90|V91|qa17|qa18|qa16) ;; *) [ -d "$d" ] && del "$d";; esac; done
for d in opencode-issue-campaign-20260914-retry1 inkwave-face-identity-20260929 inkwave-face-soften-20260929 inkwave-postmigration-refinement analysis-roadmap-20260909 issue-campaign-20260912 inkwave-motion-detail-20261002 inkwave-motion-compare-20261002 inkwave-responsive-ui-20261002 inkwave-responsive-ui-core-20261002 inkwave-walk-20261002; do del "$A/evidence/$d"; done
log ALLDONE
