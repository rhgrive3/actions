# Booyah cadence: terminal-interval correction

Follow-up to preserved candidate `42e8ca5689c472d014b51bc0a02a3ba8acf8c361`, based on frozen main `726e338ac256ba9609086ce65e25a68ddd99df85`. The prior commit, private artifacts, original before fixture and failing logs remain intact. This branch is a review candidate; PR #1854, main and other special methods are untouched.

The previous 30 Hz lifetime result of 38 suction / 38 scatter opportunities was a correctable omission, not Float32 error or an accepted density difference. With producer-before-presentation ordering, the update ending at native frame 40 contains frame 39's suction opportunity, and removal at frame 80 hides frame 79's scatter opportunity.

The object recipe now classifies each bounded elapsed-time opportunity by its source frame within the interval. Frame 39 is consumed before the existing burst at 40. Natural removal explicitly drains the final interval from the already tracked record before normal immediate cleanup. A source frame 79 already observed before a truncated terminal interval is not replayed. Only matching Booyah records/objects with dead=true and native frameCount=80 are eligible; early cancellation never backfills. No sustain suction/scatter trials are emitted for source frame 40 or 80, before birth, or after retirement; the existing frame-40 burst is retained. Native retirement is not delayed.

| Native lifecycle | 30 Hz | 60 Hz | 120 Hz | 144 Hz | 240 Hz |
|---|---:|---:|---:|---:|---:|
| Preserved 42e8ca suction/scatter | 38/38 | 39/39 | 39/39 | 39/39 | 39/39 |
| Corrected source and emitted minified | 39/39 | 39/39 | 39/39 | 39/39 | 39/39 |

The source and emitted actual Projectiles.update -> FX.update tests still first observe the burst at source frame 40 (0.666666667 s), retire at 80, retain center/far HP 868/930.7, forty/twenty-one 3.3-damage calls, six paint-growth frames to radius 13.5, gauge 0, 62 paint calls and five events. Complete damage/paint/event sequences and gameplay RNG state remain identical with VFX on/off at each cadence. A jitter case skips a render callback at 40 (39->41) and ends with a truncated 79->80 interval: it also consumes exactly 39/39; its first render observation of the unchanged native burst is at 41, because that is the next actual callback.

The complete 60 Hz source-method producer/presentation lifecycle compares exact seeded emission arguments and RNG order with preserved 42e8ca through cleanup. The earlier seeded recipe test now bounds object calls to their actual live source frames 0..79; dedicated terminal tests assert no RNG/particles at 80 or later instead of asking a retired object to keep emitting. The original frozen-main before fixture is byte-identical. Steady-state rates, warning rotation, charged-orb code, 60 Hz particle recipes, two-trial catch-up cap, invalid-dt handling, per-record state, owner authority, pool limits, geometry, shaders and all native clocks remain unchanged.

Validation: 53 source/composed/regression tests passed, plus 5/5 tests against the actual emitted minified site. Separate production-setting target-module minification tests also passed. The preserved 42e8ca actual native test and its minified version both deliberately fail the corrected 39/39 requirement with `38 !== 39`; the immutable source fixture continues to reproduce 38/38. Additional cases cover intervals spanning 40/41, terminal single consumption, prior observation of 79, early cancellation at 39/79, independent owners, zero/invalid/huge dt, and no particles before birth/after terminal. Intermediate harness/old-expectation failures are retained privately.

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/booyah-vfx-cadence.test.mjs patches/splatoon3/tests/booyah-vfx-terminal.test.mjs patches/splatoon3/tests/booyah-vfx-production.test.mjs
BOOYAH_TEST_CANDIDATE42=1 node --experimental-vm-modules --experimental-global-webcrypto --test --test-name-pattern='native Booyah launch' patches/splatoon3/tests/booyah-vfx-production.test.mjs # expected failure: 38 != 39
ESBUILD_MODULE=/path/to/esbuild/lib/main.js node scripts/build-inkwave.mjs inkwave-public /path/to/private-built-site
INKWAVE_BUILT_SITE=/path/to/private-built-site node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/booyah-vfx-production.test.mjs
node scripts/check-inkwave-startup-budget.mjs /path/to/private-built-site
```

The production build passes. Build contentHash: `5fee0f381775a10c34f261395ebe042a96ac94010db9b7610be207c0153f6c66`. Every manifest artifact hash was read back and verified. Emitted VFX SHA-256: `ffd253d0911b20dc495c3f138f236e304de6d07e5a673b1e08fe56dc527288a3`. Startup budget passes at 2,148,829 initial-JS bytes and 7,488,377 precache bytes. The emitted test controls only the kit's presentation RNG; the emitted special-vfx module and native producer methods execute unchanged. This is VM/source/artifact verification, not WebGL or retail acceptance. The existing optional-source-motion VM diagnostic in the broader unchanged regression remains non-failing.

Runtime SHA-256 before this follow-up: `73b1a5712706f149f5071c196e1d897661e254e2f8877b290988057dc0697cf4`.
Runtime SHA-256 after: `95aa1927bc81ec46cae73c5eee63adc3741b1cc760e94bbd9123c65968b9f3dd`.
Runtime Git blob before: `ec05ebc0bc6ed0bdfc1a84348ed2409d43a7a1fe`.
Runtime Git blob after: `1789b3e905d64c7e6c0c6afc745973cfdf366085`.

Remaining gates: independent parent review, browser/GPU playback and retained retail-media comparison. No Nintendo assets, secrets or private failure logs are included in this commit; no retail frame-fidelity, browser-performance, PR approval or main integration is claimed.
