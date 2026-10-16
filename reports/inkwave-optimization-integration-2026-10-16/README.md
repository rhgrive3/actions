# Expected-merge integration qualification

This supplements PR1514/1515's own complete CI without changing either tested head. Main advanced independently to `b1f571da` (Stealth Jump and gameplay/presentation RNG separation). Its changed source files do not overlap the pose, hair, material-index or composer-format implementations.

The [integration source commit](https://github.com/rhgrive3/actions/commit/359a2491ff1771aecdc41898a68a68695216cd5c) combines b1 with both PRs. Its tree is `b5a46abb5be10288151579f1105cdc634f235b40`. The actual final GitHub merge tree must equal this qualified tree before treating this receipt as evidence of the published combination. Any later main changes require a fresh assessment.

Source regressions pass 38/38, including exact pose/hair checks, depth/reset/fallback lifecycle, and main's new RNG and Stealth Jump cases. Actual emitted pose/packaging checks pass 18/18. Each of Chromium156 and LinuxWebKit27.2 passes 78 exact completed-image comparisons through the actual emitted Renderer/ScreenFX and real WebGL depth allocation checks. The exact-source full Game check passes all65kits,14accepted defaults,12gear selectors, physical keyboard movement/paint/repress,476verified responses and zero errors.

`receipt.json` binds the sources, tree, inputs and product. The complete build manifest is gzip compressed with its uncompressed SHA-256 recorded. Other JSON files and test logs retain the detailed results. This is functional and resource-allocation evidence; the separately rejected whole-game calibrations remain rejected, and physical-iPad crash/FPS/GPU-memory claims remain unverified. This evidence branch is not a production-code PR.

An additional 78 cases per engine enable MeshStandardMaterial, a shadow-casting directional light and receiving geometry on the same emitted product. Completed pixels remain exact and the compositor renderbuffer count remains two→one; the separate shadow depth texture stays present. The executed diagnostic copy is retained. These additional checks supplement the unchanged production CI fixture and do not modify production sources.
