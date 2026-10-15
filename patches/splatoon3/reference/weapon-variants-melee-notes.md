# Roller, brush, slosher and splatana alternate visual models

Baseline: main `45d60b3d11a66a8abea49ecf699aa1071f638095`, Splatoon 3 reference 11.3.0. Implementation is a procedural visual extension of the current INKWAVE base builders. It does not import the alternative gameplay kits or claim retail shape, material or behavior parity.

## Identity and scope

The adjacent JSON lists all 26 exact alternate competitive source rows in these four families, their numeric source IDs, pointers, explicit base IDs and individual appearance references. Source bytes SHA256 must match the existing canonical-kits reference. `_O` replicas, campaign, cooperative and rival rows are excluded. No inferred `_01` or invented display IDs are registered. `VARIANT_MODELS` uses the source row as its key; the parent integrates selection and base behavior resolution.

Existing family modules and shared registry are unchanged. Existing open model PR1271 and its proposed changes are not incorporated. Unrelated local Tenacity edits are not touched. New paths only; no publication or merge performed.

## Appearance evidence and authored interpretation

Appearance URLs in the manifest are the cited Inkipedia appearance sections, inspected 2026-10-14. These are secondary descriptions of the game's visual assets, not independently measured official color specifications. The palette hex values, primitive badge shapes and placement coordinates below are authored approximations; no extracted retail textures, logos or models are included.

- Krak-On: orange/blue frame, small white frame mark.
- Carbon Deco: red support with chevron accents. ANG-L: muted frame, metal-gray canister, orange accent and frame lamp.
- Gold Dynamo: gold fixed metal parts. Starz: midnight-blue metal, light accents and three colored bulbs/streak marks.
- Foil Flingza: blue shell and small foil-colored mark.
- Express Big Swig: yellow lavender-replacement parts and cup badge. Planetz: red/purple/gray palette, green cup mark and colored detail.
- Inkbrush Nouveau: brass ferrule and lighter bristles, ferrule mark.
- Octobrush Nouveau: lighter wood. Cometz: pale frame, blue-purple metal, dark bristles and three colored bulbs.
- Painbrush Nouveau: tan/gold casing and bristles, darker wood. BRN-Z: bronze body, gray bristles, green collar and ration-packet-like detail.
- Slosher Deco: blue frame and light chevrons.
- Tri Nouveau: pale-blue bail and badge. ASH-N: gray bucket, brown bail and side packet.
- Sloshing Machine Neo: dark lower fixture and badge. Bloblobber Deco: yellow supports/navy chevrons.
- Custom Explosher: beige shell and side mark.
- Dread Wringer D: dark lower tray and brown fixture accents. Hornz: pink large chamber, gray small chamber, black wringing hardware and six side spikes.
- Stamper Nouveau: pale grip, green wheel/stripe and badge. Stickerz: neon-yellow hilt, black body/blade, multicolored flat sticker-like marks.
- Wiper Deco: pale fixed frame and chevrons on frame/guard. RUS-T: brown frame, green metal accents, light mark and handle packet.
- Charcoal Decavitator: dark navy body/tinted opaque sleeve and gold cap/collar/label.

## Ownership and behavior

Every builder receives a freshly constructed native family definition, invokes the existing base model builder, then updates only fixed vertex-color geometry. Color matching is exact (within float conversion tolerance) against authored base palette colors. Team-ink geometries, drum ink, glow, ink parts, muzzle, grips, roller fold, pivots and native part names are unchanged. Animation and hold callbacks are inherited by identity. Added hinge detail stays in the existing hinge channel. Geometry is cloned before recoloring; the fresh original is disposed after the copy. No material object is modified. Added geometry is merged into the existing fixed channel rather than creating extra draw calls or animations.

## Verified and unverified

Node model construction checks: 31/31 passed, covering 26 models, unique identity, repeatability, unchanged ink/anchors/channels, finite attributes/index ranges and isolation between separate builds. Tests operate on actual current base builders and Three.js geometry, not regex/mock models. No gameplay coefficients or runtime animation code are changed. This preserves current INKWAVE behavior, not proof of retail behavior equivalence.

A standalone side-by-side Chromium gallery script was prepared and run, but Chromium failed before page creation with `socket() failed: Operation not permitted` and a read-only Crash Reports directory. Browser rendering, actual held-character views, detail attachment/visibility and motion review remain unverified. No screenshot pass or real-device performance claim.

Remaining approximations: generic badges do not reproduce branded typography; apparent material finishes use the base shader surface classes except the sourced chrome ANG-L canister, explicitly classified as metal. Exact chrome/translucency, marble/holographic/star/zebra textures, ANG-L interior tube, fixed-color reservoir differences, Charcoal alternating bristle pattern, some sticker orientations and precise color boundaries are not reproduced. Existing base shapes are deliberately retained, including their acknowledged simplified sleeve, bucket/grip and bristle geometry. No team-ink channel is converted to a fixed color to conceal those inherited limitations.

## Acceptance correction pass

Source-to-region review found and corrected three first-draft over-broad color matches:

1. Carbon Deco: red applies only to the fixed hinge support channel; the unrelated yellow carabiner and drum rim remain their base colors.
2. Carbon ANG-L: the chrome-gray finish and metal surface class apply only to the canister region. The gray grip brace stays satin; its yellow carabiner is also retained. This is a procedural metal approximation, not calibrated chrome reflectance.
3. Starz Dynamo: white is restricted to the handle's original rubber region. Dark motor fins, hinge metal and drum rims no longer become white merely because they shared the original dark palette entry. The reference's white cone still needs a separately isolated authored region; it is not approximated by bleaching the whole motor.

The Nouveau Painbrush fixed collar now follows the tan casing finish; its original channel was already fixed, so there is no team-ink transfer. The BRN-Z packet was moved outward onto the body surface rather than remaining embedded inside the sphere.

The three new region tests all fail against the saved first-draft module and all pass against this revision. Full geometry/ownership/identity suite: 31/31, no skips. The browser restriction was not retried. No original base geometry or team-ink ownership was changed; the missing game-specific material/texture/ink-region details above remain limitations rather than silently recolored team ink.
