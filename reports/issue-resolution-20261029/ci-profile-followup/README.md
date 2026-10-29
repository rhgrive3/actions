# Expanded sparse-audit contract follow-up

Published 043b6d5b expanded three audit checkouts to include every tracked JS/MJS/CJS file, but an independent mandatory contract still pinned the former exact build/core arrays and sparse fixture. Hosted push job [123276128714](https://github.com/rhgrive3/actions/actions/runs/40821926130/job/123276128714) reported five corresponding failures.

Fix afca10b6 explicitly reviews the expanded profiles and current fixture. It preserves the original fixture byte prefix, original authoring AST restrictions, adjacent browser-video pin and missing/duplicate/unexpected-input controls. Added code-only audit tests stay inside their lexical block and use generic non-JS binary sentinels. No CI step or test assertion is disabled.

The complete canonical verifier ran on afca10b6 with Node22.23.4: 661 cases,660 passed,0 failed,1 existing conditional emitted-pack skip. The separate full selected-prop-pack test file then ran against the source-verified normal emitted build:4/4,0 skips, including that emitted-only case. The four overlap the verifier and are not added to its count. Hosted acceptance for the next publication remains pending.

Commands: `node scripts/ci/run-inkwave-test-suite.mjs verifier`; `INKWAVE_BUILT_SITE=_site node --test scripts/tests/inkwave-selected-prop-pack-contracts.test.mjs`. The persistent logs and SHA-256 receipts are in [summary.json](summary.json). No runtime/build inputs changed in this follow-up.
