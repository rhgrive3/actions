# Final integration closure

Tested source: `f4cff06eadf63eda0d2ab803659d9a2b7832f9e8`. The delivery receipt binds the complete emitted artifact set and both actual-browser results to identical input/content hashes. Final report-only commits do not change these runtime inputs.

The first combined build correctly rejected the new lightmap metadata retry because it contained two cache-option sites where the strict compiled startup adapter expects one. Commit94c22dd6 consolidates the same operations into one bounded two-pass fetch/validation loop. The existing AST topology guard is unchanged. Actual composition plus production esbuild plus compiled adaptation and negative cache/PNG topology controls pass8/8. The final full build passes.

The emitted prop-pack contract then found two sealed public compatibility entry points absent from offline precache. Commitf4cff06e explicitly retains only `src/world/props.js` and `src/world/stages/index.js`, adding1019 bytes in the diagnostic build. There are no new eager HTML hints and no broad orphan inclusion. Actual loading preparation, sealed worker installation and network-disabled reads cover all21 static facade dependencies; removing either entry independently reproduces the error. The unchanged strict emitted check now passes.

Final combined checks:69 integration/packaging/workflow/Three/prop-pack/combat-fixture tests pass, with no failures or skips. The previously failing all-main footprint release integration passes1/1. Full actual Chromium acceptance passes751 verified responses with no errors. Actual two-client native warm-session combat passes220 rejection then36 acceptance; unchanged native damage/admission and independent cold-start issue#1767 scope remain explicit in the receipt.

A repeated build into the failed staging directory encountered a stale derived overlay file. A fresh output directory resolved that derived-file collision without changing production source or weakening overlay refusal checks.

GitHub checks, merge and publication remain separate from these local results. Physical iPad/Safari/WebKit timing, process RAM/GC and retail parity are unmeasured.
