# Storm calibration accounting fixture, 2026-10-19

## Scope and contract

Test/tooling-only correction against main `00b8994711809ba6d0469723c858ddef6805e2ae`. Production runtime, paint shape, ownership, rain count, simulation timing, shader, and special bookkeeping are unchanged. The historical 2026-10-09 CSV/JSON/Markdown are preserved byte-for-byte; this change does not regenerate or relabel that old measurement.

[Issue #226](https://github.com/rhgrive3/actions/issues/226) requires separate candidate-ray, ground-hit, paint-write, cosmetic-particle and area/time measurements. Its Nintendo `RainNum=72` correspondence remains unresolved. No conversion to retail units or change to 72 calls is justified here.

[Issue #264's retained acceptance contract](https://github.com/rhgrive3/actions/issues/264#issuecomment-6020956900) includes newly visible growth in authoritative ownership and credits its actual local owner exactly once. Current `paint-ownership-adapter.mjs` attaches the Storm owner; `claimAncillaryCells` in `runtime/paint-ownership.mjs` awards the later cells through that owner's real method. The immediate `splat()` return deliberately remains the native body award, as covered by `issue-264-paint-temporal-ownership.test.mjs`.

## Failure and correction

The old calibration assertion compared only the sum of immediate `splat()` returns with a grid that also includes later visible growth. Official model head `e4d3ab1c650f6d8eb6236f1a0d3c7501ce571be3`, Validate run 39241023028, shard 3, failed with immediate 142.875 versus grid 197.5 WU². Strict official main-only source reproduced the same assertion failure, with its own current shape measurement of 161.8125 versus 217.4375 WU². The different baselines are not conflated.

The harness now forwards the original Actor and PaintSystem methods while distinguishing:

- immediate splat return values (the existing field is retained);
- actual immediate and later `Actor.addTurf` callback areas;
- the independent delta of actual `Actor.stats.turf`;
- independently enumerated unique CPU turf cells at the same endpoint.

The test requires immediate callback = immediate return, actual Actor turf = immediate + late callbacks, and actual Actor turf = CPU union. Missing or repeated late credit is not accepted simply because two callback totals agree.

Production runs still use exactly 480 real fixed-clock steps over eight seconds and the original 30/60/120 Hz render cadence. There is no extra settling interval. Five growth entries remain pending at this measurement boundary in the current main fixture; that is recorded explicitly rather than silently advancing the simulation. Across all three rates, current measurements are immediate 161.8125 + late 55.625 = actual Actor turf / CPU union 217.4375 WU², with 178 candidate rays. Public-source 172/172/171 candidate counts and its no-late-credit behavior remain intact.

## Validation

- Original complete calibration file with its exact official historical CSV/JSON/Markdown present: 3 pass, 1 expected old-assert failure. Exporter safety is no longer obscured by a missing local CSV.
- Final candidate complete calibration file: 4/4, no skip. Alternate-root rejection and historical-report hashes remain checked.
- Observation-only equivalence: all six original run summaries (excluding the four additive accounting fields), complete event sequences and distributions match the uninstrumented main harness exactly.
- Two actual runtime diagnostic mutations, kept outside this patch, fail the intended Actor/grid assertion: suppress late-owner credit; double late-owner credit. Consistent missing/double ledger negatives also run in the committed production-cadence test.
- Fourteen related unchanged Storm and paint-owner/special-credit files: 93/93, no skip, file-isolated. These cover adoption, airborne/object contact, gauge, lifetime, radius, throw-lock, recovery, temporal ownership and special-projectile paint credit.
- Actual read source is checked against official main Git blobs, with only the two owned test/tool files allowed as candidate inputs. Historical report blobs: CSV `dd1fe288b4f3b9c49f704f5a5c8b7f89a3014a6f`, JSON `08a3235cf088a758e7b02d1b01d3aa180ba515bf`, Markdown `2d1aba0e983a8d1a894c3e4368554b68f789da27`.

Reproduce the changed file in a complete checkout with:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/storm-rain-calibration.test.mjs
```

This is source/CPU fixture acceptance. It does not establish new GPU pixel parity, Nintendo behavior, or native-browser acceptance, and does not close the unresolved calibration in #226.

## Latest-main publication validation

The independent Draft is based on `b75bc56e2e3fa970357b3bc92f63395c7c397353` (tree `e716b3b5ef25f2b1aae901414692df4c2d057073`). Its 37 changed paths since 00b do not overlap this patch. All consumed adapter, Roller and audio dependencies were refreshed from verified official blobs through a read-only source overlay. The complete changed test file passes 4/4 again, with 629 actual source reads matching b75 plus the two declared candidate files, and no missing or mismatched read. The earlier 93 related passes remain explicitly the 00b run; they are not represented as a second run on b75. Exact published-head CI remains a separate acceptance gate.
