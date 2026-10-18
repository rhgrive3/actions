# Squid form correction candidate

Reference: Nintendo official https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 , multiple frames 2.9–3.4 seconds. Reference clip SHA256 ae44ee55e679ca2b17a6c6d10552c61364076c77c56ddfda6797130bb9914e99.

User identified inflated body and poor legs. The existing body was a near-ellipsoid, short arms tapered to thin curled ends and had a wide circular spread. This candidate changes only procedural squid geometry: reduced mantle depth and lower-belly radius, shorter thicker uncurled short arms with closer rest centers, broader long clubs. It retains all ten arm IDs, source chains, motion clocks, materials and human geometry. Surface-following eyes/band and thickness metadata share the updated surface.

Hero rest geometry measurements (metres): mantle full depth .2253→.1442, fin width .4075 unchanged, axial height .409 unchanged; short-tip group width .2359→.1622; two-club aggregate width .1131→.1401. These are bounded candidate values for visual review, not claimed exact original-game dimensions.

Body triangles hero22147→17489, game7148→6588, far2112→2100. No additional textures/materials/draw calls. Existing source binding tests remain applicable to all LODs/rates.

QA uses cf8839966e144c16f81e8c9d1bd6b0b5997b2655 as unchanged baseline and the same four original jump views plus an observational upper-front35° view of each actual Sqd_Jump sample. No mesh pose adjustment. Both revisions use identical camera/production lighting. CPU visible-skinned-vertex sweep covers564 driven frames; 100 screenshots per revision. Candidate maximum absolute projected NDC .773358, minimum margin22.66%. Native results are required before visual acceptance.

Remaining review items: original white-eye connected shape, black-band perimeter, club front spot orientation, idle-only arm splay. No perfect reproduction claim.
