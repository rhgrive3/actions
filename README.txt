Current-main manual appearance acceptance

Pinned source: fbdcacb690ec5c9abd10e14d6b623a6f4206aab0.
Targets: Custom and Hoofz Dualie Squelchers (Maneuver_Dual_01/02), Jet Squelcher COB-R (Shooter_Long_02). The existing 45 default variants and 94 manual appearance union remain unchanged. This branch contains diagnostics only.

One hosted production build. Three actual Actor/Runner tests run against exact source and again against the full emitted site. Each uses the same gameplay kit with base/manual appearance, both teams, actual firing and native parts, near/far visibility, owner ink/material state and cleanup. A controlled public setLod game/far sequence avoids conflating automatic viewport-dependent body LOD policy with weapon appearance compatibility. No model, palette, material or gameplay changes.

Twenty actual normal-light images: two views and two teams, shared base camera fitting, eight unique base frames and twelve variant frames. The two dual-wielded instances must both exist and retain native transforms. Day Environment PMREM256, Neutral tone mapping .94 and sRGB output are validated from actual GPU readback. Blank/clipped/error/resource-binding cases fail. Source helper replay uses synthetic raster and is not GPU qualification.

Three fixed 128px source icons are downloaded only from the recorded Leanny commit and verified by byte count, SHA256 and Git blob. Broad surface placement and visual defects need human readback after the hosted artifact arrives. These single views do not establish exact retail geometry/material matching or completion.

Local source and limited emitted-registry comparison passed; full emitted-site and GPU acceptance remain pending. No FPS, GPU allocator, whole-game performance or device crash claim.
