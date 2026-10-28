# Emitted eight-kit held compatibility fixture, 2026-10-27 UTC

This is a **separate verification-only candidate**, based on fixed integration/runtime `65ad3508a30b26d9264acafc76f6ab9f77a48c1b`. Code commit `e6fb91faf9c3e491c6589943d8d98c8b1311afa1` changes only `patches/splatoon3/tests/roller-brush-held-motion.test.mjs`:25 insertions/1deletion. It does not change the production builder, runtime, weapon data, character/rig/bone values, integration head or PR metadata.

The original fixture directly imported `weapon-models/rollers.mjs`. The standard production build intentionally bundles family modules into `registry.mjs` and omits their standalone files. The existing read-only inspection helper, `catalogRollerSwing`, survives in the bundle's Roller namespace but is not exported by the registry entry.

The emitted fixture now parses that actual bundled namespace, requires exactly one existing inspection binding and its function declaration, and appends one export alias **only to the in-memory VM module**. All original emitted statements remain byte intact; the site files are never modified. It imports the registry containing the live gameplay family's private state, not a separately evaluated copy of source Rollers, a reconstructed state getter, copied implementation or replacement module. The source-mode fixture keeps its original direct source import. Missing inspection bindings fail closed with no source fallback. Parser/fixture code is verification machinery; gameplay dependencies are loaded from the supplied emitted site.

All **four original test bodies are byte identical**, including their assertions. Source4/4 and emitted4/4 passed, with0fail/skip. The first test exercises Carbon, Splat, Dynamo, Flingza and Big Swig Rollers plus Inkbrush, Octobrush and Painbrush at30/60/120Hz. Remaining cases retain cold-start/contact-gap/release/reset, delayed vertical swing mode/interval/clock, and real network snapshot/remote airborne audio-gating assertions. The old failed emitted invocation is preserved in the earlier integration receipt; it is superseded only as a harness acceptance gap, not relabelled as a historical pass.

The already built site's content hash is `596e029ef336213de97d337c5f12752bfb4f3887de28907dde1a6ef5e36fdafd`. Audit against the exact65ad git tree verified1,491 inputs including the builder and2,196 artifacts, mismatch0. The original registry SHA256 is `f0af78bbefee2201c90bc4d66dd09ffd4b721d39bcd7dfb3241e3314817423bf`. The fixture-added alias is resolved from the artifact's AST, not a hard-coded minifier name. No rebuild or broad suite was needed.

See [precise receipt](validation.json), [source](source.log.gz), [emitted](emitted.log.gz), and the reproducible [harness contract check](check-harness-contract.mjs). This remains CPU/emitted verification with simulated fixture conditions, not ordinary-input browser, actual audio output, original-game pixel or hardware parity. Brush entry/exit geometric limitations, Hissen and other unfinished behavior remain open. No CI was manually launched; the integration branch stays fixed pending independent review.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/roller-brush-held-motion.test.mjs
INKWAVE_BUILT_SITE=/absolute/site node --experimental-vm-modules --test patches/splatoon3/tests/roller-brush-held-motion.test.mjs
node reports/emitted-held-compat-20261027/check-harness-contract.mjs /absolute/site
```
