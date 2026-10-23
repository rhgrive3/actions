# Ultra Stamp: observe the admitted airborne contact

## Scope and reproduced implementation difference

This is an INKWAVE animation-ownership correction, not a newly measured retail timing curve. The installed native Actor path admits a fire+jump edge with `jumpStampAt = elapsed + 8/60` while setting `nextSwing` to at least `elapsed + 48/60`. Fire pressed while already airborne uses the same pending jump contact. The existing device observer used only `nextSwing`, so its head remained fully raised until the unrelated grounded-repeat lockout; the admitted `jumpSwing` then moved it directly to the strike pose via its presentation mark.

Only `stampArc` in `patches/splatoon3/runtime/special-presentation.mjs` changes. It chooses finite `jumpStampAt` when present, otherwise the original `nextSwing`. The same existing six-frame anticipation window, ease-in, endpoints, strike hold and recovery remain. It does not author an event or timer and does not add state, meshes, particles, materials or draw calls. Grounded recovery, rig/grips, damage, paint, physics, projectile flight, random seed consumption and network rows are unchanged.

Reproduction: select Ultra Stamp, activate, wait past startup, hold fire and jump, then observe the device during the eight already scheduled native ticks before `jumpSwing`. A second case starts already airborne and presses fire. Releasing fire or holding sub cancels the native pending jump, so no anticipated contact may be invented. Reset/death must retire the holder; a fresh activation must not inherit it.

## Retail frames actually inspected

GameWith guide: https://gamewith.jp/splatoon3/362459 . Literal media: https://img.gamewith.jp/common_movies/76424cfb8a7e735a0a928b2921759933.mp4 . Local analysis used the previously acquired clip, SHA256 `dfaaab18cce13e25dd26b9b57ae2b0ee45550d723801550a025a6e0b966ea062`: 1280×720, encoded 30 fps, 236 decoded frames, 7.886667 s. Game build, capture date and input trace are unknown. Encoded frame indexes are not native simulation frames.

Every decoded frame 20–44 was inspected, including the f35 downstroke, f36–41 floor ink crown and f42–44 lift. This pass also inspected consecutive f45–74 (1.500000–2.466667 s), f65–94 (2.166667–3.133333 s), f110–139 (3.666667–4.633333 s) and f188–217 (6.266667–7.233333 s). They show repeated lift/contact cycles and the later thrown rotating stamp. The later views have substantial camera rotation/occlusion; the clip does not reliably identify an airborne input-admission segment. These observations support the motion families, not a numerical jump-retiming or camera-normalized visual match.

A possible grounded 13F repeat/recovery discontinuity and the contact face orientation were investigated but deliberately not altered: fitting those to retail needs paired current-head rendered frames and rig/camera normalization. No speculative compression of grounded recovery, new arc endpoints, added VFX or projectile retiming is included here.

## Verification and limits

`ultra-stamp-jump-presentation.test.mjs` uses the actual fully installed production-composed Actor/AllSpecials path, actual FX event marks, installed `installSpecialModels` wrapper and real existing Stamp model/holder. Its lightweight Character host has no body rig and fixture movement integration is stubbed, so this verifies native admission/animation observation and transforms, not rendered body/GPU or real collision physics.

Six cases pass in source and in the production-adapted, esbuild-minified, string-compacted complete presentation module. The exact frozen e9 presentation module is loaded as the negative control; it fails precisely the two impending-jump descent assertions in both modes, while cancellation, retirement/reuse, grounded fallback and cadence controls still pass. Native event emission remains once at +8F, not at the +48F grounded lockout. Presentation does not mutate sampled native clocks, transform/velocity or seed/count fields. Native fixed-tick samples drawn at 30/60/120Hz agree; a zero-dt redraw does not advance this observer. Existing motion parameters and primitive budgets are unchanged.

This is not full-site build/startup acceptance, browser/GPU validation, remote anticipation (no new remote timing is inferred), retail airborne-frame matching or final Stamp fidelity approval. Publication is not performed.
