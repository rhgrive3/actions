# Kit paint capability capacity follows bomb lifetime

Independent review of the integrated kit ledger found that 128 unused birth records permanently denied every subsequent birth for that owner. The native projectile loop removes a bomb below `PLAYER.waterY - 1.8` without calling its explosion paint. Such a legitimate birth never receives a core, so it was never reclaimed by the used-record eviction branch. Death/respawn deliberately preserves approved flights, and therefore does not clear this accumulated quota either.

Reproduction includes actual production-composed `Projectiles.throwBomb`, `_updateBombs`, NetMatch encoding/playback and PaintSystem. At each of 128 iterations the bomb crosses the native water-removal boundary, the projectile list empties, and the wire contains only `b` with no paint event. Three seconds between throws makes 384 seconds, within the existing lobby-supported 600-second match limit. A later legitimate throw/explosion must still match its observer paint grid. The baseline loses its core. Physics is a no-contact water scenario fixture; the lifecycle, encoding, removal and paint implementation are real production modules.

## Repair

Keep the existing 128-record per-owner bound. Reclaim used entries first. If every entry is unspent, retain the newest 128 birth sequences rather than permanently refusing all future throws. Retire the evicted sequence in the existing owner high-water mark so preprocessing an entire packet followed by playback cannot re-register the removed birth. A descending packet that brings an older incoming birth discards that incoming birth, rather than evicting a newer flight already in the window.

This is a bounded engineering policy, not a new Splatoon numeric parameter. At an extreme 129 simultaneous unresolved births for one owner, the oldest capability is deliberately unavailable; it does not extend the radius permit or let an unrelated sender steal another owner's quota. The alternative previous behavior permanently disabled all later valid cores. Ordinary younger flights, exact-once core consumption, sequence replay protection and owner isolation remain intact.

Source scope is the ledger's existing pinned kit radius sources. The new discrepancy is native INKWAVE water retirement versus its capability lifetime, not a newly located decompiled game rule. No executable decompile or source bundle is published.

Tests add native-water retirement and later legitimate paint, sequential unused overflow, rejection of replayed evicted births, preservation of the second-oldest retained flight, exact-once use, and ascending/descending single-envelope overflow. The existing ledger suite separately covers cross-owner capacity isolation, post-death approved flights and expired pending proof.

Verification: baseline 5 dedicated cases produce 4 expected failures and 1 passing descending-order control. Candidate passes all 5 plus all 17 existing ledger tests (22/22). The native water case was additionally rechecked with a 600-second match and simulation/network time progressing three seconds per throw. The sibling kit maintainer independently reviewed eviction, high-watermark and reverse-order boundaries. The patch applies cleanly to the integration checkout.
