# Private six-way epoch verification

This separate checker binds two preserved main7e pairs. It does not change the
historical `main-reviewed-special-four-delta-pair`, select a moving head, replay
paint/pose sources, modify workflow routing, or imply public integration approval.

| Profile | Exact candidate | Exact full tree |
| --- | --- | --- |
| `six` | `7c8a5ebf10c27411025522fe1d362c81c1e89e4a` | `1931a39ebab081375b5ff7b54c576c9d3ebefde7` |
| `six-plus-fixture` | `0cabb66c92c07eecc7e649ddb74d26fcab8e02a1` | `8d726abff9665ed7c8fcad77af188e22006f6fed` |

Both require actual base HEAD `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`,
full tree `965c98442df0c42cd092f7a6eb9b0535f51b8b38`. The fixture profile has
exactly one separately pinned test override. All nineteen production input
deltas and emitted output bytes remain identical. The verifier lives in its own
checkout; its new QA head is deliberately not automatically admitted as an input.

## Source and build fence

The sealed gzip inventory was authored from actual immutable Git blob bodies,
not a caller's current worktree. Its SHA256 is a literal in the verifier. It pins
all 6,254 base and 7,234 candidate Git leaves, modes, blob hashes and SHA256s.
This conservative superset covers the whole builder-readable repository:
transitive adapters/imports, helper/registration code, dynamic data reads,
manifests, compatibility inputs, account/server code, tests, docs and evidence.
There is no `.md`, `tests/`, overlay-root or `.gitignore` classification rule.
Unknown public files including `inkwave-public/tests/**` and Markdown reject.

Physical inventory checks also reject missing/extra paths, dirty bytes, mode
changes, parent/leaf symlinks, staged/conflicted index drift, and committed HEAD
drift. Only these literal development outputs are excluded from *untracked*
physical enumeration: root `.git`, `node_modules`, `_site`, `.ci-scratch`,
`.browser-evidence`, `.browser-profile-onboarding`, and the two existing Python
backup caches `tools/backup/__pycache__` and `tools/backup/tests/__pycache__`.
No pinned Git leaf may occur under an exclusion. These are not rules applied
inside the public input tree. Installed external toolchain bodies are not a
source-admission claim; the separately frozen emitted manifest authenticates
the recorded esbuild-minify 0.28.2 build and every artifact byte.

The checker authenticates the exact normal six-way manifest, all 1,426 input
keys against the chosen committed source inventory, the builder itself, and all
2,120 artifact bodies. It rejects extra output files and output symlinks. Both
source trees and physical inventories are read again after output verification.
Account/native-asset overlays and build optimization overrides reject; the
normal pinned `browser-direct` native catalog is retained.

Receipts must be new files outside both source roots, the emitted site, verifier
checkout and their Git/common metadata. Existing files are never overwritten.
No source file is written. A successful check creates only its external receipt.

## Invocation

Run from the separate verifier checkout. Every flag is mandatory; duplicate,
missing and unknown arguments reject. Prepare the external receipt directory
first and use a new receipt filename for each run.

```sh
node scripts/verify-inkwave-sixway-epoch.mjs \
  --epoch main7e-sixway-frozen-v1 --candidate-profile six --provenance local \
  --baseline /workspace/actions --candidate /workspace/inkwave-staging \
  --base-sha 7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51 \
  --candidate-sha 7c8a5ebf10c27411025522fe1d362c81c1e89e4a \
  --base-tree 965c98442df0c42cd092f7a6eb9b0535f51b8b38 \
  --candidate-tree 1931a39ebab081375b5ff7b54c576c9d3ebefde7 \
  --site /workspace/inkwave-six-site \
  --receipt /workspace/inkwave-epoch-evidence/new-six-receipt.json
```

For `six-plus-fixture`, use its exact SHA/tree and actual separate fixture-repair
worktree. `--provenance official-pr-event` additionally binds the supplied
`GITHUB_EVENT_NAME`, `GITHUB_REPOSITORY` and `GITHUB_EVENT_PATH` fields to this
exact pair. Local event fixtures test those field checks; they cannot authenticate
a real hosted event. The local mode explicitly reports that provenance limit.

## Regressions and practical limits

```sh
# Requires the preserved full Git history and normal six-way site. All mutations
# happen in disposable detached worktrees, never the original snapshots.
node --test scripts/tests/inkwave-sixway-epoch-cli.test.mjs

# One native production registry: opposing-spawn target admission and steering,
# lifecycle/action guard, active display reset, family saturation and Tri draw.
node --experimental-vm-modules --test scripts/tests/inkwave-sixway-interactions.test.mjs
INKWAVE_BUILT_SITE=/workspace/inkwave-six-site node --experimental-vm-modules \
  --test scripts/tests/inkwave-sixway-interactions.test.mjs

# One native Game/context, bounded capture set; uses the saved Playwright install.
PLAYWRIGHT_MODULE=/workspace/actions/node_modules/playwright/index.js \
  node scripts/check-inkwave-sixway-browser.mjs /workspace/inkwave-six-site \
  /workspace/inkwave-epoch-evidence/new-combined-browser
```

The CLI controls include actual tracked/untracked public inputs, tests-named
paths and Markdown, byte/mode/missing/symlink mutations on both sides, new
committed heads, wrong declarations, receipt aliases/overwrite, external build
inputs, artifact corruption and event-field mismatches. Individual pin validators
also exercise every archived row's mode/blob/SHA256 rejection.

These checks establish an exact local source/build identity and bounded combined
regressions. They do not replace mandatory final-head hosted CI, the independently
owned common projectile route, real peers, WebKit/mobile hardware or retail QA.
The known all-eight-blocked spawn fallback limitation and UNSOURCED provisional
Tri-Slosher `.5` calibration remain. No Nintendo media is obtained by this tool.
Any future source or QA head must be explicitly reviewed and bound again; none
is admitted merely by ancestry or by a new hash supplied by the caller.

## Additional nonzero-barrier and pool regressions

The later QA child retains the verifier's two exact input profiles. It adds
tests without changing the nineteen production leaves or admitting itself.
The original donor barrier=0 fixtures and original failure logs remain intact.

```sh
node --experimental-vm-modules --test --test-reporter=tap \
  scripts/tests/inkwave-sixway-spawn-acceptance.test.mjs
INKWAVE_BUILT_SITE=/workspace/inkwave-six-site node --experimental-vm-modules \
  --test --test-reporter=tap scripts/tests/inkwave-sixway-spawn-acceptance.test.mjs

# Retains the known failing same-seed legacy-sheet assertion. A nonzero exit
# here is a real aggregate blocker, never an accepted baseline or an xfail.
INKWAVE_BUILT_SITE=/workspace/inkwave-six-site node --experimental-vm-modules \
  --test --test-reporter=tap scripts/tests/inkwave-sixway-pool-acceptance.test.mjs
PLAYWRIGHT_MODULE=/workspace/actions/node_modules/playwright/index.js \
  node scripts/check-inkwave-sixway-pool-browser.mjs /workspace/inkwave-six-site \
  /workspace/inkwave-acceptance-evidence/new-pool-browser
```

The spawn group exercises both teams with barrier4.2 on every step: enemy
ingress and friendly exit; native death/aim/launch/landing/first attack;
held-through-death, release-in-flight and fresh-touchdown input; active idle
display reset with an immediate fresh life; and missed support after pose
retirement. Real Actor/Physics/Character/source-bank/Projectiles and CPU paint
run together. Unfaded controls compare full canonical state, actual shots,
paint grid/calls, source renderedPose and displayed attack. The deep -8 trench
retains native below-water projectile expiry; pre-update emissions and their
retirement are checked separately. Display readback refreshes world matrices
after a direct reset, as the renderer does before drawing. These are fixed60
VM/native geometry checks, distinct from real browser or retail results.

Pool tests use actual native special/Shooter/Splatling/Slosher emitters and
normal expiry, with no clear, pool reset or manual effect-field retirement.
Pending native sibling births occupy other Slosher records so the final real
Shooter emitter reaches the original object. The same-seed .37 case currently
fails the legacy-sheet assertion; the .38 control and the added three drops
are checked independently. Mixed 0/1/2 residual slots compare every prior
matrix/color/shape/look/petal entry, retain native newest-first old-drop order,
and allow new family additions only after that complete prefix.

The firing owner separately owns the production repair. Do not replace a frozen
source pin or relax an assertion/admission to make this aggregate pass. A
reviewed successor still needs explicit new input binding and rerun gates.
