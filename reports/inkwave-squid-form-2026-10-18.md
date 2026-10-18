# Squid form correction candidate

Reference: Nintendo official https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 , multiple frames 2.9–3.4 seconds. Reference clip SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99.

User identified inflated body and poor legs. The existing body was a near-ellipsoid, short arms tapered to thin curled ends and had a wide circular spread. This candidate changes only procedural squid geometry: reduced mantle depth and lower-belly radius, shorter thicker uncurled short arms with closer rest centers, broader long clubs. It retains all ten arm IDs, source chains, motion clocks, materials and human geometry. Surface-following eyes/band and thickness metadata share the updated surface.

Hero rest geometry measurements (metres): mantle full depth .2253→.1442, fin width .4075 unchanged, axial height .409 unchanged; short-tip group width .2359→.1622; two-club aggregate width .1131→.1401. These are bounded candidate values for visual review, not claimed exact original-game dimensions.

Body triangles hero22147→17489, game7148→6588, far2112→2100. No additional textures/materials/draw calls. Existing source binding tests remain applicable to all LODs/rates.

QA uses cf8839966e144c16f81e8c9d1bd6b0b5997b2655 as unchanged baseline and the same four original jump views plus an observational upper-front35° view of each actual Sqd_Jump sample. No mesh pose adjustment. Both revisions use identical camera/production lighting. CPU visible-skinned-vertex sweep covers564 driven frames; 100 screenshots per revision. Candidate maximum absolute projected NDC .773358, minimum margin22.66%. Native results are required before visual acceptance.

Remaining review items: original white-eye connected shape, black-band perimeter, club front spot orientation, idle-only arm splay. No perfect reproduction claim.

## Follow-on rounded-lobe / front-club-mark candidate

The e082 native comparison (all200 PNGs verified, original source clocks preserved) showed short arms still reading as pointed fingers. Short-arm length multiplier .52→.36, radius profile .032/.016→.036/.024, terminal cap length1.1→.35; omit short-arm microcup geometry and printed microcups. This simplifies the clustered support lobes without removing any arm identity or changing source binding. The mantle is unchanged from e082.

Large club marks are supported by both official ikahito2.9–3.4s and https://www.nintendo.com/jp/games/feature/splatoon/assets/mov/ika.mp4 (SHA256 b800628c57f15edf5e250d95d3b3337418ad40bb3644237ae9a38be01467c038). The existing marks occupied cup geometry on the opposite surface from the eyes (mean rest normal z−.356 versus eyes+.913); upperfront35° native capture confirmed the missing eye-facing marks. The follow-on uses antialiased flat circles in the existing arm UV on the outward hemisphere, retaining the original underside cups. No new texture, geometry for spots, fake highlights or lighting change.

Baseline for next native comparison is exact e082695ed7a33fcdacdc4c830e7c6ba4eefabfbf. Same100cases/camera/light. CPU sweep margin22.66%. Visual acceptance remains pending.

After increasing lobe thickness, the existing .17m group-width test caught excessive width. Short-arm rest centers were moved inward8–10mm while preserving that guard. Final short-tip group width .14981m, source5/5 tests passed, 564-frame CPU sweep /100cases margin22.66%. Candidate source SHA256 b0ce5223c167a03a6733ede163b7ec1015595f99bba80ed0225f1ef40a4ffa31. Body triangles14291/6288/2100 (hero/game/far).

## Outer attachment and four small support lobes

Latest feedback requested the long pair outside, with fewer smaller thicker short arms. This consolidated candidate generates six presentation arms using semantic IDs[0,2,4,6,8,9]: outer long IDs0/9 and inner short IDs2/4/6/8. N=10 and color.z=id/10 stay unchanged; the existing source mapping therefore uses its two arm chains and four leg chains correctly. The omitted four short-arm meshes are not retained as hidden duplicates. This is a stylized visible-form reconstruction informed by the official frames, not a claim about real squid anatomy.

Long roots move to x±.095m (not just their tips), paths continue outward to±.117m. Four short root centers are±.050/±.017m and length multiplier .28; their broad rounded radii/caps are retained. The widened clubs' broad surface is oriented toward face+Z, so outward flat marks cannot accidentally follow the wrong radial side after moving attachments. Existing source motion keys and bindings are unchanged.

Regression tests assert exact six semantic IDs, long root centroids outside .085m, all short roots inside .07m, grouped short tip width below .17m, finite geometry, all three LODs and source rates. Main shape adjustments and the already-tested front-club markings are consolidated before the next native publication. Native baseline is preserved14171420e3081add0145533922e71a3e72e72b62; same100cases/camera/light. Final visual acceptance pending.

Final source32c600eb464a28586ad2ec254f4fe35ff708eafaea2ef5702f75faf8e2f9ed5a: source5/5 tests passed; source-loaded100case CPU envelope margin22.66%. Body triangles12177/5248/1572. Independent posed-root audit confirms outer-root ordering throughout11rest/Wait/Walk/Jump samples. Four short centroid span10cm rest and13.3–14.1cm jump, terminal widths4.1–4.8cm. Long tip span23.5cm rest and20.3–21.2cm jump. Inherited Sqd_Wait splays long tips33.7–45.3cm; explicitly inspect dry idle native evidence before acceptance. This is not a new chain mismatch, and has not been hidden by camera changes.
