# Narrow rolling-contact provenance preparation

Base: cc0c90afe8031643e6a890974f8f44a40a30509e. Preparation only, not a merge, release, whole-peer quarantine, or clock-protocol activation.

## Runtime scope

Only patches/network-replication/combat-provenance.mjs changes. The original blob 50a13c5b63832f8a11009127c4ccbb5832c882fb matches the reviewed historical base exactly. The candidate SHA-256 is 66e6a971c4696ca3c82e640448bb007fe166a6a2057a09d2f287c73e4bfca2ce, unchanged from the independently reviewed v3.

Rolling body authority now requires an actual native installed actor snapshot and, when provided, the accepted native physics tuple. Packet-arrival watermarks alone are insufficient. The receipt is tied to actor identity, owner, life, alive/rolling flags, position and the existing 3.5-second combat-proof bound. The scope is weapon.kind roller, PvP roller and boss crablet contact, not all weapons or specials.

Claims without contact authority retain the original 48-entry / 0.95-second deferred admission, privately restricted to genuine projectile/birth proof. Later rolling poses cannot upgrade those queued claims. Fresh explicit retransmission remains valid. Already-admitted PvP hitSequences and boss lastBossHit retire deferred copies before another proof is spent. No wire fields, clocks, time allowances, damage ceilings or count bounds change.

## Permanent actual-composition regressions

The existing repository robustness fixture is imported normally with productionComposition enabled. No local filesystem paths, diagnostic clock prototype or optional alternate-fixture environment variables are used. Eight bounded test files cover 36 cases; their shared helper only constructs existing native fixtures. Existing wildcard network tests discover them without workflow modification.

Verified on the exact cc0 fixture blob 1379f566b47c8f870ebe6bd6fd529acd40b12365:
- Native accepted rolling contact and exact 3.5-second boundary; expired/negative age, malformed/life-invalid/older-life rows, invalid physics, changed actor/owner/life, nonrolling/dead/far pose rejection.
- Delayed flick before first or refreshed snapshot; genuine earned proof and native Burst birth recovery after body receipt expiry.
- Receiver-private deferred authority, packet forgery rejection, unchanged queue bounds, PvP and boss retransmission/replay retirement.
- Native-produced paint FIFO playback and host/control/clock routing remain functional.
- Original sixty-one-second stale-claim inputs reject before native hit identity or contact proof consumption.

Local runs were sequential, at most five cases per process. All 36 passed. A hash-checked paired counterfactual loaded 650 source files: original runtime applied the stale hit and failed the assertion; candidate rejected it and passed. The local source view uses verified symlinks and therefore required --preserve-symlinks; ordinary repository files do not require that option.

Example bounded command:

    for f in patches/network-replication/tests/contact-provenance-{receipts,deferred}-*.test.mjs; do
      node --experimental-vm-modules --test "$f" || exit
    done

## Preserved failures and limits

Historical larger-process generic terminations remain recorded rather than called passes or diagnosed as infrastructure. During portable test extraction, the native paint case initially omitted a fixture import; that explicit ReferenceError was corrected and the final three-case file passed. The first symlinked run omitted --preserve-symlinks and failed module resolution, not gameplay.

Independent v3 review previously passed 36 actual-composition checks on its older base. Those results were not substituted for the new cc0 runs. Fixture scene, transport, physics and damage sinks remain test-controlled. No browser, emitted-site, full suite or final-head CI acceptance is claimed here.

The existing wrong-victim-life claim may spend a fresh contact cooldown before native hit rejection; that separate baseline defect remains. Special-proof expiry and complete unavailable-peer semantics also remain separate. Clock v5 and rejected contact intermediates are preserved, not included or activated by this preparation.
