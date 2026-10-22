# Splatana charged presentation plane: narrow correction (2026-10-21)

Base: rhgrive3/actions main 7581ca9be8cf87d253918b8abb3b8ebe728c2093.
Status: draft; not approved for merge. This is not completion of the requested frame-perfect splash work.

## Confirmed mismatch
The rendering selector `saber-vertical` denotes charged fire for all three weapons. It does not mean that every charged ink wave stands vertically. The previous renderer made every charged wave vertical, including Mint/Charcoal Decavitator, and used the same incorrect plane for its firing sheet.

Evidence:
- Nintendo's update history describes Mint/Charcoal Decavitator as having a wide horizontal charged swipe: https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257
- Fixed S3 11.3.0 source, Leanny/splat3 7280ff9cde8bb1c5dcef46c700c326471584d2e6, WeaponSaberHeavy: BulletSaberVerticalParam.CollisionParam.OffsetArray is X-only (+2.4 to -2.4, Y=0), while Normal/Lite charged offsets are Y-oriented. https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSaberHeavy.game__GameParameterTable.json
- That source is used here only to identify orientation, not to assert that collision radii equal visual dimensions.

## Scope
`s3-projectile-shapes.mjs` now distinguishes charged attack kind from presentation plane using the canonical weapon record; alternate kits resolve to their base record. The main slab and trailing slab use the horizontal plane for Dental. The firing burst passes the same presentation-only plane to `s3-ink-sheets.mjs`.

No damage, paint, velocity, lifetime, origin, network, projectile admission or collision change. No new effect, mesh, draw call, texture, vertex, droplet or runtime module. Existing calibrated dimensions and timings deliberately remain unchanged. Other weapons and uncharged slashes keep their previous planes.

## Reproduction and regression
Practice Range: equip Mint or Charcoal Decavitator, fully charge and release. View the projectile head-on and from above, comparing against Stamper/Wiper. Previously the charged slab stood vertically. The existing render script only includes Stamper and therefore did not cover this error.

Added regression runs actual Actor -> WeaponRunner -> Projectiles emission for the three base weapons and Charcoal, tap and charged. It checks main/trailing instance axes, firing sheet axes, and unchanged gameplay snapshots. The old vertical basis fails Dental's horizontal-axis assertion.

## Validation status and remaining work
The pure classifier was evaluated against all three fixed catalogue records: all taps horizontal; Stamper/Wiper charged vertical; Dental charged horizontal. Actual fixture/source/emitted CI is pending at publication. Shell commands could not start because the execution environment failed its sandbox mount with ENOSPC.

No actual browser frames, matched Nintendo video frames, full-flight/impact comparison, or before/after CPU/GPU performance measurement has been completed for this candidate. Zero added draw calls is not proof of a few-percent runtime budget. Existing widths, thicknesses, bow, fixed trailing-slab offset, firing layer count, disappearance and impact presentation still require the user's requested frame-by-frame comparison; do not call these source-extracted or perfect.

The canonical comparison log reports/inkwave-splatoon3-behavior-2026-10-02.md could not be read through the connector (empty response for its oversized blob); it is preserved unchanged rather than overwritten with incomplete content. This narrow report records the current difference until that log can be safely appended.
