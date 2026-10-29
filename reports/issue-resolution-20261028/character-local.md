# Local synthetic character QA — 2026-10-28

Two independent candidate runs used Node 22.23.4, Playwright 1.62.1, official Three 0.186.0, sandboxed Chromium 151.0.7922.34 and SwiftShader. The original fixture and acceptance thresholds were unchanged. Scratch preload only selected the installed browser and enabled Chromium sandbox; each launch receipt records the effective options. Both runs used the workflow's existing 20-minute bound.

| Candidate | Source SHA | Build content SHA-256 | Unit tests | Browser fixture |
| --- | --- | --- | --- | --- |
| CI repair | `472c85fa85e91f6e8b316f7d466c2c51209e3759` | `fcec6e8db8e58c0ff5bd0c27da583e6a105b2949c27c1a8d0970152904c2429c` | 10 passed; 1 optional private-asset case skipped | 24 cases, 10 lifecycle cycles passed |
| Optimized | `7e9686118e2137e6c4c0b8bc5786bc0aad65c1fb` | `c14fbb326bdef2888af600b72e982e10e26b8cc380e4c57d510656df84720dde` | 10 passed; 1 optional private-asset case skipped | 24 cases, 10 lifecycle cycles passed |

`verifyRuntimeBuild` verified every sealed input against each committed source and every artifact against its manifest before and after each run. Root input hash `bdb851a80a79a984f15dc002c4fb0b997a8931c4d7b51caefc24f64cbd34210e`; opt input hash `930c0227c2d08bd3fcca6e691b117497766972f721dc185316c9f3c18d1c8879`. Both source checkouts were clean at readback. Each result records zero blocked external requests and zero browser errors; 24 screenshots were saved for each.

Receipts: `/workspace/scratch/agent5-character-root/result.json`, `/workspace/scratch/agent5-character-opt/result.json`, `agent5-character-{root,opt}-launch.json`, `agent5-character-{root,opt}-identity-{before,after}.log`, `agent5-character-{root,opt}-browser.log` and `agent5-character-unit-{root,opt}.log`. The optional skipped unit case needs a private actual GLB; the synthetic fixture does not need it. The browser harness uses an isolated expanded Three core and original generated geometry/maps. These passes establish local synthetic loader/render/lifecycle behavior and source identity only; they do not establish production-core GLTFLoader compatibility, real-character appearance, retail game equivalence, physical-device performance, or hosted CI success.

Committed compressed receipts: [root](character-local-root.json.gz) / [optimized](character-local-opt.json.gz). The raw hashes and original execution paths remain in the receipts and workspace. Later fixture/admission-only changes do not alter declared production inputs or emitted runtime bytes; all hashes are reread against each published candidate.
