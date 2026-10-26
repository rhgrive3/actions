# Production native retirement positive control

The unchanged diagnostic runner (`f82adcf80f05b560a16458845ec21a5b549745066f12de705c3184b0046e9385`) passed against production source `65fa7f183d2d163af798972c2ff0ced46a92868f`, content hash `3eb1f3dc5eade6c994053877fbb38bd054a33ce0e7714d2159a1106591ea605b`.

Both controls run actual native RAF, low quality, mobile 480×300/DPR 1, Scorch → Tidewater, two cycles with five seconds sampled combat. They save only WeakRefs, with no inventory listener or per-frame weak polling. They make no performance claim.

| Target from retired first Scorch world | e4, all three final later-task GCs | 65fa7f, all three final later-task GCs |
| --- | --- | --- |
| NativeLevel |Retained|Collected|
| data |Retained|Collected|
| physics |Retained|Collected|
| nativeWorld |Collected|Collected|
| triangles, nodes, mask, face array |Retained|Collected|

The first GC immediately after Tidewater publication in 65fa7f still saw transient level/data/physics references. The successful collection claim applies to the three final independent GC captures after Tidewater completed/quit and final idle, with 250/250/1000ms later-task waits. No heap snapshot was needed in the positive run because all eight targets had been collected. The browser closed successfully with no page errors.

See `native-retirement-positive-proof.json` for exact numeric receipts, conditions and artifact hashes. The e4 heap evidence remains a separate local diagnostic artifact. Do not reinterpret this control as a timing benchmark, an immediate-publication collection guarantee, or proof that arbitrary native-stage payloads have a fixed process-memory bound.

Intermediate source `544bb901bc7b14a8fc3eedb2e2c18adfe2b62345` also passed this control. Its raw result remains `native-weak-retirement-fixed/result.json`; its prior compact proof is preserved as `native-retirement-positive-proof-544.md/json`. The current proof refers to exact latest source `65fa7f183d2d163af798972c2ff0ced46a92868f` and raw result `native-weak-retirement-65final/result.json`.
