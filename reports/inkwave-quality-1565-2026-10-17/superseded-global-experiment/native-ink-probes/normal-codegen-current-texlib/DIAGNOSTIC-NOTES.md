# Single-realm production ink shader diagnostic

Runtime inputs: f2a9e79a75fd1f930c1bf7eb04498ab69e87bfed, candidate content c70ff01bfc49cc9ff974336d902abaa85bf66c6e6b9752cac6dc189a21b5aba2. Browser: same Chromium 141 / SwiftShader used by whole-game calibration.

This final run copies the real native overlay's custom material defines and verifies USE_TEXLIB in the live expanded fragment source. It preserves actual Scorch geometry, paint atlas, texture library, light/shadow uniforms and a frozen real-world depth prefill. Actual expanded sources differ only in the intended normal expression. No production shader bytes were rewritten; diagnostic material variants are runtime-only controls.

12 warm draws per material; two ABBA/BAAB cycles; 16 measured windows, 8 overlay draws per window. A is the original two-normalization expression; B is the current mat3/facing expression. One-pixel readPixels completes each batch after gl.finish. All 16 elapsed queries are available/nondisjoint. All 102 pre/post error checks are zero, final WebGL error is zero, and page errors are empty. Optional driver-translated getters are not invoked; expanded GLSL is captured at gl.shaderSource, passing the exact string through unchanged.

Completed mean per draw: A 194.689 ms, B 198.052 ms (+1.73%). Software elapsed-query mean per draw: A 193.583 ms, B 197.104 ms (+1.82%). Individual paired GPU block changes are -6.60%, +6.61%, +2.99%, +3.04%. Durations drift from about 151 to 234 ms; the sample does not consistently reproduce the roughly 11% whole-frame calibration slowdown and does not prove zero degradation. No full variant sweep followed this run.

Pixels match exactly: 0 / 144,000 changed, and the original endpoint redraw also matches exactly. The overlay is present (3,168 non-background pixels). Every window has exactly 8 actual GL draws, 624,696 submitted indices and the same geometry/index version/draw range. Warm resources are stable at 415 geometries, 131 textures and 153 programs. These resource counts are observations in a resident test context, not heap/GPU-memory or lifecycle proof.

Raw batch rows and complete query/error checks are in normal-codegen.json; paired block summaries in paired-blocks.json; the expanded-source difference is normal-expression.diff. This is one frozen component/software workload and cannot replace whole-game or physical-device acceptance.

Earlier attempts remain separate: normal-codegen-current was aborted before timing for temporary-profile storage; normal-codegen-current-persistent failed with WebGL 1282 after optional deleted-shader getters and lacked mandatory readback completion; normal-codegen-current-clean was error-free but mistakenly lost custom USE_TEXLIB defines during Material.clone and is explicitly fallback-only. None qualifies the production-path result above.
