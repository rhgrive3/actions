# Production native retirement positive control

The unchanged diagnostic runner (`f82adcf80f05b560a16458845ec21a5b549745066f12de705c3184b0046e9385`) passed against production source `544bb901bc7b14a8fc3eedb2e2c18adfe2b62345`, content hash `decbb66c315a1e0397e55618cab6b3870082fe26954737f922775d8471bff6ca`.

Both controls run actual native RAF, low quality, mobile 480×300/DPR 1, Scorch → Tidewater, two cycles with five seconds sampled combat. They save only WeakRefs, with no inventory listener or per-frame weak polling. They make no performance claim.

| Target from retired first Scorch world | e4, all three final later-task GCs | 544, all three final later-task GCs |
| --- | --- | --- |
| NativeLevel |Retained|Collected|
| data |Retained|Collected|
| physics |Retained|Collected|
| nativeWorld |Collected|Collected|
| triangles, nodes, mask, face array |Retained|Collected|

The first GC immediately after Tidewater publication in 544 still saw transient level/data/physics references. The successful collection claim applies to the three final independent GC captures after Tidewater completed/quit and final idle, with 250/250/1000ms later-task waits. No heap snapshot was needed in the positive run because all eight targets had been collected. The browser closed successfully with no page errors.

See `native-retirement-positive-proof.json` for exact numeric receipts, conditions and artifact hashes. The e4 heap evidence remains a separate local diagnostic artifact. Do not reinterpret this control as a timing benchmark, an immediate-publication collection guarantee, or proof that arbitrary native-stage payloads have a fixed process-memory bound.
