# MOV-04a descriptor cache audit

On optimized source `e3f19ab9913824b15dfc56330ec731408890d6a3`, no production mismatch was demonstrated between the cached descriptor in `combat-gpu-cpu-perfect-adapter.mjs` and the original spread used in `PlayerController.computeAim`. The cache remains in place. Owner #1911's omission is not itself a defect.

The cache recomputes the family and refreshes range, rangeMin, rangeMax, reticleRange and combatRange on repeated use of the same weapon object. A source inventory of the 142 catalog and variant definitions found zero with own reticleRange, combatRange, inkFlightProfile or ballistics fields. Ordinary equipment/reset creates a fresh actor-local weapon object; `s3RefreshGear` changes ink, spread and special cost in place. The real gear path does not establish that arbitrary third-party mutation of every other descriptor field is safe.

The [source-composed probe](../mov04a-audit.mjs) boots actual Actor, PlayerController, Projectiles and awaited Player00 Characters in independent VM realms. One realm uses the production cache; the other restores the original descriptor spread only at the two composed PlayerController sites. It exercises one representative of nine catalog families through four phases: new equip, a deliberately injected in-place range change, real transient gear refresh, and Actor reset. One controller alternates two real actors. At four target distances it compares aim points, target selection and reticle in-range output: 432 comparisons match, with 160 in-range and 272 out-of-range. The camera and physics hit are controlled fixture inputs, not full match or browser evidence. [Production log](production.log.gz).

Installed S3 explicitly replaces `_assistTarget` with a null function. A separate, disclosed VM-only seam removes that one disable in both comparison realms to exercise the otherwise dormant composed method: the same 432 comparisons match, including 248 acquired and 184 rejected assist results. This seam does not describe production auto-aim. [Seam log](assist-seam.log.gz).

A negative control deliberately removes the five-field refresh in the cached realm only. It exits 1 at the first in-place range change, showing a stale reticle decision where the original dynamic descriptor changes; [negative log](negative.log.gz). The mutated range is a test sensitivity input, not a claim that transient gear modifies range. An earlier probe incorrectly required positive assist in the installed runtime and failed because assist is disabled; its [log](run3.log.gz) remains. A preliminary inventory-ID typo is also retained in [run.log.gz](run.log.gz). The inventory script and output are [here](../mov04a-inventory.mjs) and [here](inventory.log.gz).

Run from the tested source, with Node VM modules enabled:

```sh
node --experimental-vm-modules reports/issue-resolution-20261029/mov04a-audit.mjs
node --experimental-vm-modules reports/issue-resolution-20261029/mov04a-audit.mjs --assist-seam
node --experimental-vm-modules reports/issue-resolution-20261029/mov04a-audit.mjs --negative-no-refresh # expected exit 1
node --experimental-vm-modules reports/issue-resolution-20261029/mov04a-inventory.mjs
```

The negative-control switch was added to the saved harness after the positive runs; it leaves their path unchanged. This narrow CPU/source comparison does not release the MOV-08b or Character holds, assess all possible dynamic weapon extensions, or establish browser, device, performance, or retail-game behavior.
