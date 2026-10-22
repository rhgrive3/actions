# #1434 final GPU-input diagnostic — DO NOT MERGE

Status: `diagnostic-two-contexts-gpu-frame-inputs-only`. Browser `151.0.7922.34` / SwiftShader. Exact production source/build unchanged. This is the final bounded diagnostic, not a calibration or performance result.

Completed contexts: 2. Final RGBA SHA256: `4a2ec73ec20382236acc09f1ea42b8fb3f58b4704fd43cd26986b7fc829e8eec`, `4a2ec73ec20382236acc09f1ea42b8fb3f58b4704fd43cd26986b7fc829e8eec`.
Actual-draw transcript equality: True. GPU section exact equality: `{"buffers": true, "draws": true, "events": true, "framebuffers": true, "textures": false}`.

Owned PID/start-ticks terminated: True. Error: `None`.

The first differing sampled texture is composer/renderTarget2/readBuffer HDR at actual draw192, the bloom bright pass. Draws190/191 target its multisample RBO; its native contents and resolve source samples are unobserved, so this does not isolate shader, raster, resolve or driver cause. Later differing sampled snapshots appear at draws205/206/207; final 8-bit RGBA matches in this pair.

174726880 transient GPU readback bytes per context were SHA256 hashed in browser; payload fields deleted before JSON and never persisted. Published records contain metadata/hash only, with no private GPU geometry/texture byte payload.

The actual-GL preflight passed native → observed → restored exact pixels and GL state, actual VBO/IBO, mip/color/fallback/raw-depth contents, nondefault PACK/UNPACK PBO state, and four compile/link/query/creation fault cleanup controls. Independent static review and four tracker units passed.

- Final bounded diagnostic only; neither two contexts nor an observer pass can replace failed strict four-trial native calibration.
- GPU buffer values and renderable color texture readbacks are observed. Depth values pass through texelFetch to R32F, not native depth/stencil storage bits.
- Renderbuffer contents and otherwise unsampled blit input contents remain unobserved; attachment/storage metadata and downstream sampled textures do not prove their byte equality.
- Raw-depth control does not verify nonzero TEXTURE_COMPARE_MODE/sampler2DShadow restoration; rejected initial shadow fixture and exploration logs are retained.
- Unsupported/nonrenderable/compressed/copy allocations and explicit budget exclusions remain unobserved. No GPU-driver cause is established.
- Additional upload tracking, GL reflection, readbacks and auxiliary depth sampling prevent timing/performance claims.
- No runtime/source substitution or pixel tolerance relaxation. Historical f11/3acf A/B remains unexecuted; iPad/Android/hardware acceptance remains open.

See the paired JSON for exact input differences, explicit unobserved texture levels, source/helper/harness SHA256 and raw evidence receipts. Raw JSON/log/transcripts are included in the archive; local PNG/RGBA are hash-only.
