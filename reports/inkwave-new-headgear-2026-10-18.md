# Four new headgear: integration and review, 2026-10-18

## Scope and behavior
IDs 8–11 add Golden Gala Masque (キンギョマスケラ), Samurai Helmet (サムライヘルメット), Paintball Mask (フェイスゴーグル), and Dapperdasher Hat (カイトウ・フック). Existing IDs 0–7 remain stable. These are cosmetic render additions, not implementation of Splatoon 3 gear abilities or progression. No movement, swimming, shooting, damage, respawn, ink economy, or gameplay timing changes are included. Those existing comparison gaps remain open in the common behavior report. Source identity and visual references are documented in the four companion reference reports; S2 rear-view evidence is explicitly historical rather than S3 proof.

## Attachment and preservation
Factory attachment uses the existing head bone and native context. Face-only IDs 8 and 10 declare preserveHair and omit a crown rim; their neutral clearance avoids the old cap-only hair variant and curl flattening. All eight hairstyle geometries are byte-identical to no-hat under both quality settings and all three LODs in regression. IDs 9 and 11 use existing supported crown-fit behavior. Approved chin/neck geometry and native source are unchanged. Existing four gear module source hashes are locked; emitted old-gear modules are byte-identical to approved baseline.

## Reproducible checks
Build normally with `node scripts/build-inkwave.mjs inkwave-public _site`; run startup budget checks, source locks, and `INKWAVE_HEADGEAR_SITE="$PWD/_site" node --experimental-loader ./patches/local-quality/tests/headgear-production-loader.mjs --test patches/local-quality/tests/headgear-*.fixture.mjs`. Revision 3 passed 48 emitted regression tests plus two source-lock tests. Tests cover finite/index/winding geometry, semantic roof/front normals, closed goggles rails, native fit callbacks, ID persistence, color mutation, owned resource disposal, repeated lifecycle, native hair preservation, LOD budgets, and full-bounds camera framing. They do not substitute for WebGL or visual review.

## Historical native evidence
- Diagnostic 4480124ee0d5c25c166a0a6a91a4dbeacb023e45 timed out as one long render job. No successful artifact was recovered; it is not counted as a pass.
- Sharded cabe8359fae040275910d6d2ff3739122304c36a completed all five suites and verified 480 saved PNG hashes/dimensions at https://github.com/rhgrive3/actions/actions/runs/39103792063. Technical success did not mean visual acceptance: all four initial models were rejected after native review.
- Native review identified inverted goldfish surface winding, rigid goggles folded by per-vertex facial-normal offsets, faceted samurai horns/guard forms, and inverted hook roof winding plus crown/brim separation. Revision 2 fixes these at source and adds the builders’ emitted regression fixtures. New-gear cameras fit full gear bounds. Revision 2 underside near-plane removed feet but left cut torso/arms; this is explicitly not accepted underside evidence. Revision 3 restores normal full-character views and adds separately labeled isolated-head construction views using temporary triangle index views with an exact restoration receipt. Existing IDs 4–7 camera settings remain unchanged.
- Old-four comparison to a505 found 48 of 76 matching masked images pixel-exact; remaining small differences are retained as evidence, not claimed identical. That historical baseline predates the approved chin/neck fix. Source/emitted old gear identity is the stronger preservation gate.

## Current acceptance and draft PR gate
Revision 2 source 79ce7541e3a4bbbe079498e33a32d6869caf6816 completed all five render suites and official aggregate at https://github.com/rhgrive3/actions/actions/runs/39104753658; all 480 PNGs independently validated. All 168 old-four PNGs are byte-identical to cabe. Six one/eight-player teardown cycles returned to baseline 23 geometries and 3 textures. Hook actual added draws hero/game/far are 4/4/3 after the single-pass lens fix.

Revision 3 source cf24745f9879cdb5412b82fea9b1c3589c6588d8 includes bounded goldfish texture anti-aliasing, samurai crest/plate/material, and goggles shell-form corrections. Native run https://github.com/rhgrive3/actions/actions/runs/39105485327 remains in progress: signal/LOD suite passed with all 152 PNGs verified and six exact resource returns; complete multiview/isolated-head acceptance remains pending. Its 496-frame denominator preserves ordinary views and adds 16 separately labeled construction-only images. Those views are not evidence that the whole character is naturally unoccluded from underneath.

The draft PR additionally includes goldfish shell triangulation correction 955d013470f781552b9e1d4f5edf0210c2a0beae1741c0ca9d850fe824d100a5: interior-only constrained edge flips remove skinny folded nose triangles while preserving projected boundaries, eye apertures, palette, texture/PBR bytes and material settings. Focused regressions pass; actual native nose-seam review must happen on the final PR head. Do not infer its visual pass from earlier captures.

Final-head 496-frame QA, required CI, independent four-item visual acceptance, isolated-head underside inspection, and native goldfish nose-seam confirmation are merge gates. This document records a draft candidate, not completed visual acceptance. No merge is authorized by technical test success alone.


## Subsequent user feedback and illumination gate
The user identified insufficient samurai crown/crest prominence and dull gold appearance. PR remains draft. The [illumination audit](inkwave-headgear-production-lighting-2026-10-18.md) establishes that the earlier harness omitted the actual production PMREM. A separate actual-emitted-Environment suite adds32 images while retaining496 historical controlled frames. Gold palette compensation is explicitly excluded; new crown/crest geometry and production-illumination native visual review remain merge gates.

## User-requested side-wing and projection follow-up
The next candidate broadens Samurai's two curved side wings, enlarges their concentric medallions, refines the flat cloth field and closes the lower rolled lip. All 64 non-wing geometry parts remain byte-equivalent at every LOD; material properties are unchanged. Focused fixture passes, and the sampled front skirt intrusions fall from 11 to zero. Full source/evidence limits are in `inkwave-samurai-sidewing-2026-10-18.md`. Native appearance remains pending.

Historical e964 has all 528 PNGs and six suites independently verified for artifact/source/resource integrity. Its orthographic visible sky is visually invalid and does not clear gold appearance. The revised actual-Environment suite uses perspective projection, retains backlit views, and adds sun-facing character/view yaw with unchanged day lights and material palettes. Three projection/illumination guards pass locally. All 560 next-head captures and required CI must rerun; PR1581 remains draft until visual acceptance.

## Goggles rejection and solid-shell correction
The user rejected the prior rail-like goggles silhouette. The new candidate uses broad closed perforated forehead/cheek shells, short central chevrons and a compact curved eye window. Lens opacity changes explicitly from .19 to .30 while tint, roughness, lighting and the preserve-hair contract remain stable. Four batches and zero textures remain; hero/game/far triangles are 7216/3112/2312. General index/finite/nondegenerate checks, closed shell topology, outward lens winding and idempotent disposal pass locally. This is source/CPU evidence only; native visual acceptance is pending.

The prior head6eb640 created no native runs because an upstream report-append conflict made the PR unmergeable. The integration resolves only that common report by preserving both complete appendices, inherits current main's menu-memory adapter and all disjoint upstream changes, and retains the prior 35 headgear paths. The next merged-history candidate must pass all560 captures and required checks; no previous-head result substitutes for this gate.


## Relocated historical common-report appendix

The following exact 765-byte headgear appendix was originally appended to the common behavior report by this PR. It is retained here verbatim so the common report can inherit current main without repeated unrelated EOF conflicts. Its statements retain their historical context; later rejection and pending visual gates above supersede any earlier status.


## 2026-10-18: four additional cosmetic headgear
IDs 8–11 add キンギョマスケラ / サムライヘルメット / フェイスゴーグル / カイトウ・フック. See [integration and historical native evidence](inkwave-new-headgear-2026-10-18.md) and the four source-reference reports. These additions do not implement the original gear abilities or change movement, swimming, shooting, ink recovery, damage, respawn, or camera gameplay logic. Face-only accessories preserve existing hair geometry; crown accessories use supported native fit. Actual S3 gameplay parity and unmeasured frame values remain unconfirmed. Native rendering, geometric tests, and source reference review are recorded separately; successful CI alone is not visual acceptance.


## Bounded final geometry checks
Samurai closes side-wing/medallion boundary surfaces and removes polar zero-area triangles, preserving visible relief and materials; far/game/hero triangles are 3684/6856/19084. Goggles shortens forehead openings, keeps central chevrons inside the shell and adds low-LOD forehead subdivision to avoid native sculpt penetration; hero/game/far triangles are 7216/3796/2868. Closed topology, winding, nondegeneracy and ownership tests pass locally. Existing rear-strap/hair overlap remains a disclosed visual review item; no character or hair edit is made. Native acceptance is pending on the new head.


The subsequent native9851 side/top comparison still rejected insufficient outer wing curl and narrow border. The final bounded candidate corrects the suppressed curl mask (corner displacement approximately .0225), widens the gold border from4.5% to6%, retains topology closure, unchanged palette and zero sampled front guard crossings. Counts remain unchanged. All66 non-wing/medallion pieces are byte-identical; actual-corner-roll regression passes. Final native review is still required.


## Further requested goggles correction
The user requested additional improvement after the solid-shell revision. Actual270e front/oblique comparison motivated three connected central chevron slots with thin inset webs and a rounded closed perimeter, plus a shallow rounded forehead and closed brim underside return. Eye/lens material, cheek construction, hair contract and rear routing stay unchanged. Hero/game/far triangles are6652/3784/2848 in four batches. Topology, winding, triangle-centroid clearance and disposal tests pass locally; a new native comparison is required. Existing rear-strap intersection caveats remain open and are not relabeled as accepted.


## Native visor-lip correction
Actual8fa front/oblique frames revealed a dark broad forehead wedge. Its white material was unchanged; the visible return faced down (normal approximately[0,-.849,.528]). A bounded geometry correction gives a short vertical forward-facing lip and recessed underside return. Counts, material values and all non-brim geometry remain unchanged. The fixture now requires forward-facing lip normals and exact authored-versus-emitted geometry/index parity across allLOD, alongside closed topology and clearance checks. Native image confirmation remains pending.


## Follow-up coherent goggles form correction (after f336 lip evidence)

The narrow white-lip correction passed its bounded native gate, but the user's oblique comparison reopened full goggles shape acceptance: the shelf-like visor, thin temple posts and detached central mouth frame did not match the reference. This revision replaces them with a joined sloping brow/temple/cheek/chin shell and grouped forehead windows. Rear bands blend into the shell anchors and are lifted using the existing native-head audit; character and hair geometry remain unchanged. True Splatoon 3 rear source imagery is unavailable, so reconstructed rear details are explicitly uncertain.

Authored module SHA-256: `4c5958e21735a39f0240b27ef3068cfc9f4d3e923dd82959b87d0476b2f5c863`. Hero/game/far triangles: 6964/4844/3400; four material batches, one transparent lens, no textures. Local source fixtures pass finite/index/nondegenerate geometry, closed topology, native-envelope clearance, coarse shell cross-sections, joined anchors, color update and exact-once disposal. The integrated fixture retains exact authored-to-emitted attribute/index parity; actual emitted execution is required in the new-head CI and has not yet run locally.

Native matrix expands by exactly 11 cases/22 PNGs for goggles only: far front/back/left/right/top/under plus isolated underside, and game hair5/6 back/top. Existing cases remain unchanged. Combined denominator is 582 PNGs (518 controlled structural views/signals plus 64 actual production-environment views). A source-executed matrix fixture and aggregate per-view receipts enforce coverage. Source construction preview is suitable for capture, not visual acceptance. New fitted front/oblique/left/right/back/top/under, all LODs, rear-band fit, and all exact-head CI remain pending. Goldfish metallic appearance remains unresolved; rejected isolated F0/roughness probes are not production changes. PR1589 remains held for full goggles visual acceptance.


## User-marked cap bill / lateral shell correction after 944ad800

The 944ad800 coherent-wrap build passed all 582 native technical readbacks, but the user's marked source comparison rejected the cap profile and lateral white-shell shape. That visual rejection supersedes the earlier bounded wrap review. This next revision adds a distinct curved cap bill (measured lens-relative overhang .05036) and rear-swept lateral white shell with an ear opening and ink panels. Gear strap endpoints attach to the solid rear shell; character and hair are untouched. Source construction review permits native capture only, with a specific gate that the lateral opening must not read as thin disconnected posts.

Module SHA-256: `c825d6c758807089cd785920cbe85e0a07daac8e88c86d45757f4db772dff8e6`. Hero/game/far triangles 8132/5516/3932; four batches, one lens, zero textures. Source fixture passes closed canopy/shell topology, finite/nondegenerate/index checks, all-LOD native-envelope clearance, strap-to-shell radial-ray attachment, color and exact-once lifecycle. Integrated authored/emitted parity remains required in the new-head CI; local source execution passed, actual emitted execution is pending.

The existing 582-frame matrix is unchanged and must complete on the new head. Full oblique/left/right/back comparison, cap-bill projection, substantial lateral shell, rear-band fit and all-LOD views remain visual gates. True S3 rear source details remain uncertain. Goldfish metallic appearance remains unresolved. PR1589 stays draft and must not be merged solely from historical technical success.


## Rounded mask and volumetric rear-band candidate

The user rejected the 23a cap/side interpretation and later explicitly resumed correction. The rejected visual gate remains unresolved; dba976c only reconciled current main and repaired three approved test assertions/measurements, without changing goggles geometry.

This next isolated model revision (SHA-256 `8ca29c92730b29a66fd53f51346a044a72f4cde5b572dca7c369cef5b97a9276`) removes the unsupported large ear hoop, rounds the lower body/chin, tapers the projecting bill, and replaces flat rear ribbons with closed elliptical-section curved bands and unequal crossing depth. Side anchors remain connected. S3 front/item evidence and historical S2 rear evidence are identified separately; unchanged S3 rear construction is not established.

Hero/game/far triangles9232/6068/4212, four batches, one transparent lens, no textures. Source fixture passes closed shell/bill/rear-band topology and winding, finite/index/nondegenerate geometry, compact side/anchor criteria, color/disposal and native-envelope checks. Integrated authored/emitted attribute/index parity is retained; local source execution passed, actual emitted API execution and native appearance remain CI gates. Native audit minimum skin clearance .02453, scalp .02211, all lens rays visible; this does not establish animated-hair clearance.

Existing582 matrix remains unchanged, including front/oblique/both sides/rear/top/under across all LODs and hair5/6 rear/top. Actual four-angle comparison must show rounded main mask, distinct tapered projecting bill, compact substantial side shell and curved rear-band volume without floating joins or hair cutting. Construction preview permits capture only. No full visual acceptance or merge permission is claimed. Goldfish metallic appearance remains unresolved.
