# Mandatory projectile birth for straight main fire

Code `02050fc9869a428aa17700092d39da67684191b2`, based on common73481884. Only five production lines change, in combat-provenance.mjs. A standalone `weapon:fire` presentation cannot mint a usable main proof for native Shooter, Dualies or Splatling families. The existing accepted projectile-birth route remains mandatory for those families. Existing pairing runs first, preserving pairedFire and proof ordering. Charger no-projectile/hitscan, area-family and sub/special admission retain their existing paths. There is no optional flag or wire-format change.

The actual native035 recorded trace contains26 affected mains:14 Shooter,6 Dualies and6 Splatling. Across459 recorded main fires, every fire has an earlier projectile row in the same producer packet. The eight recorded Chargers remain outside this policy; legacy Charger has one fire and zero projectile rows. The compressed audit identifies the immutable fixture and source. This historical observation is supplemented by current native legacy/catalogue producer controls for all three affected families, not described as a current all65 replay or retail comparison.

Positive fixture updates use actual native launch/Runner and recProj output. Paired and birth-only routes retain the original single-contact, Boss/crablet and deferred-hit assertions. The native fixture now calls actual NetMatch.bind rather than accidentally hitting its idempotent early return after a manual match assignment; it consequently records genuine fire rows alongside births. The helper's optional events selector leaves its existing default birth API intact. Component display, flat terrain and Boss placement inputs remain explicit; this is not an independent socket/browser session.

New native controls cover lost birth with genuine presentation, the original late birth arriving before playback passes its sequence, an older birth arriving after presentation playback, recovery from a distinct newer birth, and reordered R2 arrays. Rejected claims preserve HP and hit/Boss nonces. A presentation does not replace a rejected old birth or bypass the native watermark. Existing proof and modeled tests were adapted without deleting assertions: accepted-receipt positives now use actual birth rows; invalid forwarded charge/beam fields exercise the still-supported Charger path. The modeled mismatched-muzzle control requires one birth proof and no pairedFire marker, preserving its discrimination without authorizing another presentation-only shot.

The independent frozen scan remains byte-for-byte frozen. Its in-memory comparison bridge adds one explicitly reviewed, unique projectile-presentation policy anchor alongside the prior two single-round-capacity anchors. Missing and duplicate anchors reject. The original180×5 full snapshot comparisons, cap160, keys, pairing, timestamps, rates, retention and reentry controls remain intact.

| Source check | Result |
|---|---:|
| Four focused files, including85 native single-round cases | 122/122 pass, zero skips |
| Eleven relevant proof/receipt/modeled files, final repeat | 99/99 pass, zero skips |
| Final targeted native receipt, modeled policy and Charger flight selection | 66/66 pass, zero skips |
| Unchanged selected native assertions under original734 runtime | 1 pass, 2 expected failures |

These scopes overlap and must not be added. In the original-runtime control, lost-birth and played-presentation/late-birth negatives fail; reordered R2 remains a passing positive because native sorting already supports it. An initial wider fixture run exposed missing native event subscriptions and an old modeled two-proof expectation; the final receipts above retain the corrected controls. No assertions were removed or tests skipped. Agent4 independently reviewed immutable02050fc and found no blocker in family precedence, producer wiring, ordering, pending claims, Charger exception, muzzle mismatch or frozen bridge.

The real native damage-owner diagnostic demonstrates the narrow production improvement:

| Self-authored owner stream, with no actual sender launch or receiver contact | Original734 | Repaired020 |
|---|---:|---:|
| Fire presentation alone, PvP/Boss/crablet | 36 each | 0 each |
| Copied complete valid native projectile row, PvP/Boss/crablet | 36 each | 36 each |

The complete row is copied from independently recorded native output; the diagnostic does not execute its sender weapon. Native Actor and Boss damage methods are real, while display/flat-world/Boss state are component inputs. Both diagnostic runs intentionally exit1: `securityAcceptancePassed=false`. The final run separately reports `presentationFallbackBlocked=true`. A successful narrow negative is not a full authority acceptance.

Reproduce with Node22.23.4 and `--experimental-vm-modules --test`. The122 selection is combat-single-round-targets, combat-boss-proof-targets, combat-native-proof-receipt and added-combat-scans. The99 selection is inkwave-combat-provenance, inkwave-boss-positive-proof, contact-provenance-deferred1/2/3, contact-provenance-receipts4/5, combat-native-receipt-order, combat-pvp-cap-queue.metadata, contact-provenance-boss-positive and queue-network-receipts-20261027. The66 selection is inkwave-combat-provenance, combat-native-proof-receipt and charger-flight-clock. The native tests support the existing `INKWAVE_BUILT_SITE` fixture; source controls explicitly reject emitted mode. A fresh combined emitted build is separate root-owned validation, not included here.

The complete valid-birth forgery remains unresolved. Native commands, trusted spawn/resource history, retained canonical world/RNG, scheduler, contact commits and migration/ACK integration are still required before claiming #1665/#1666 solved. This slice does not promote the isolated replay APIs to production authority and does not replace f958 malformed-birth validation. Historical receipts and issue holds remain unchanged. No hardware, shared worktree edits, remote push or main merge occurred.

Raw gzip receipts, original runtime, native producer audit and source hashes are bound in [manifest.json](manifest.json).
