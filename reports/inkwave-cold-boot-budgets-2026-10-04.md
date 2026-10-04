# Cold-boot mobile environment budgets (#375 / #395 follow-up)

## Scope

Base: current main `866fd45992be33c51966a8acc55596bb5bac15a8`.
This is a new, narrow correction to the first allocation during boot, preserving
merged PR399's music, pause, disposal, re-entry and runtime-quality work. It does
not resume integration, change renderer policy or alter gameplay. No merge or
deployment is performed.

The only pre-existing issue comments documented completed integration and
remaining physical-device acceptance. Open/closed PR coverage and all comments
were rechecked. The new cold-boot scope was publicly claimed before editing:
[#375 owner](https://github.com/rhgrive3/actions/issues/375#issuecomment-5983259216),
[#395 owner](https://github.com/rhgrive3/actions/issues/395#issuecomment-5983260016).
Both ownership comments were read back without a competing cold-boot claim.

## Root cause and negative evidence

The actual main boot sequence publishes `G.mobile = deviceProfile()` near line58,
constructs `G.env = new Environment(...)` near line136, and only publishes
`G.game = this` near line156. Default saved-settings quality is `high`.
The merged allocation adapter used `G.game?.mobile` at both cloud and far-cube
budget sites, so the already-available touch profile was missed during boot.

The pinned source/Three reproducer verified Git blob identities and ran the
actual Environment allocation/bake methods. With touch=true and no G.game:

- LOW already chose cloud1024x320 and far cube256.
- medium/high/ultra incorrectly chose cloud2048x640 and far cube512.
- Publishing G.game later did not retroactively repair initial allocation.
- An explicit later far rebake switched512 to256 and disposed the old target.

A dedicated negative control now restores **only** the old device lookup in the
otherwise-current composed module and reproduces2048x640/512 on default-high
touch. It does not remove all prior resource fixes to manufacture a failure.

## Correction

At exactly the two first-allocation sites, use
`G.game?.mobile ?? G.mobile` rather than only `G.game?.mobile`.
The already-published Game profile retains precedence when it exists. Missing
all device metadata retains desktop behavior. Quality tiers, texture formats,
cloud appearance, rebaking and disposal policies are unchanged.

Expected first touch allocation for every saved quality tier is cloud1024x320
and far cube256. Desktop retains1024x320/256 on LOW and2048x640/512 otherwise.
Publishing G.game with the same device afterward causes no extra target resize
or disposal.

Declared RGBA16F color payload: cloud10 ->2.5MiB; far cube with its color mip
chain about16 ->4MiB. These are dimensions-derived payloads, **not measured
physical GPU memory, watts, thermals or Nintendo/Switch budgets**. This work
implements INKWAVE's existing LOW/touch budget policy; there is no new
Splatoon frame/range/weapon/90-second rule change.

## Verification

- Focused source allocation/lifecycle and strict acceptance gates:35/35.
- Same focused set with the complete emitted Environment/Three/audio graph:
  35/35. A tree-shaken renderer constant is obtained from the pinned original
  Three module in the test fixture, as the existing far-reflection test does.
- Full source gameplay/reliability/local-quality suite:868/868, no failures/skips.
- Production build: `e622815d9429` content digest prefix.
- Cold tests cover all four quality tiers x touch/desktop, initial boot order,
  Game-profile precedence, absent metadata, uniform/format dimensions, no
  post-publication reallocation, exact-once release and the specific old-lookup
  negative control. Existing audio/pause/visual assertions remain intact.

The native browser gate adds a fresh hasTouch/isMobile Chromium context with
high settings and `?map=halyard`. Before serving the unchanged main module it
observes the real G.env publication, recording target dimensions while G.game
is still absent. Served bytes remain verified against the build manifest.
After boot it verifies the same targets are retained; a later replacement
cannot disguise an oversized cold allocation. Existing cloud appearance,
audio, pause, GPU disposal and identity checks still run. Browser CI for the
published exact head remains pending.

## Issue linkage

Refs #375 and #395. This fixes their cold-boot budget remainder only. Their
previously documented physical iOS/Android long-duration acceptance remains
unverified; no automatic closure is requested for those broader conditions.
