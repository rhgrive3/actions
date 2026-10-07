# Showcase shadow quality budget

Refs #499. Baseline main83d6b088246f760a34d0921c118482bca7cde777. This is a
project rendering-budget correction, not a Splatoon3 numerical calibration.
The existing11.3.0 gameplay reference and all actor/weapon/animation behavior
remain unchanged. Raw inkwave-public and hair/model source files are untouched.

## Root and scope

Native Showcase._buildLights always selects2048², independent of the quality
preset. Its loadout/locker/results render and direct portrait method then refresh
that target at render cadence. Native effectiveQuality returns shadowSize1024
for LOW; the field is shadowSize, not the Issue's illustrative post.q.shadow.

The patch consults the same native effectiveQuality at creation and before
Showcase/portrait rendering. The studio retains its historical2048 ceiling, so
HIGH/ULTRA desktop do not unexpectedly jump to4096. LOW uses1024 for both desktop
and touch. Existing higher-tier touch2048 policy is preserved; this patch does
not invent an untested mobile1024 cap for every quality tier.

When either requested or allocated target size differs, old map and optional
VSM mapPass targets are disposed and cleared before the next render allocates
the appropriate resolution. Stable-size frames do not dispose/rebuild anything.
Disposed targets cannot remain as stale map pointers. Final Showcase.dispose
also releases both targets once. Initial mobile metadata uses G.mobile if the
Game profile is not yet published.

Animated casters still receive their native per-frame shadow updates. Portrait
rendering still re-arms the following pedestal shadow pass. Removing those
updates without visual motion evidence would freeze shadows and is not done.

## Local verification

The actual native Showcase/Three/config modules are evaluated, then the same
cases run against production-minified modules. Cases cover all four quality
tiers×touch/desktop×iOS metadata; LOW cold boot; HIGH→LOW→HIGH; target dispose
signals; stable120-frame target identity;60renders each of loadout/locker/results;
direct native portrait rendering and restored renderer state; repeated native
dispose; shared map/mapPass disposal; old native2048 LOW negative; and missing/
duplicate source-hook rejection. Only Canvas2D/GPU drawing and character creation
are fixture boundaries. Native target objects/methods and quality policy are real.

Observed resolution1024² has one quarter of2048² texels. This is deterministic
allocation accounting, not a measured GPU-time, heat, battery, heap, or physical
phone improvement. Fresh GPU/visual capture of animated shadows remains pending
in the combined integration batch. Keep Issue499 non-closing for those broader
conditions; the fixed-resolution and release subset is implemented.
