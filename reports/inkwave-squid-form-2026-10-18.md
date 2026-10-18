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
