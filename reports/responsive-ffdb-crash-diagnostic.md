# Observation only: WebKit small-phone crash

Direct parent ffdbf2016b2c8a008e43761d3874b83fad63a027, original run 39658991486/job 119426729165. Original failure ZIP 12382450638 SHA256 e548c8ce252f12c64a21718a1d461ed49482d2bdf11523545727cb5aeaf6265a was downloaded and verified against the CI upload digest.

WebKit 26.5 at 320x568 completed setup-stage:umami at 39.677s. At 57.947s page-crash and the first error occurred in settle (responsive:99), called after a stage ticket selection (core:65). Cleanup page-close began later. Node exit1, signal null, processError null, empty stderr. OS process cause and memory pressure remain unknown. The saved log is not a reproducibility result.

This branch reuses existing exact ffdb build artifact 12379998715, validates its ZIP SHA256, source marker, eleven fixture input hashes and unchanged companion runner hashes. It runs only the existing WebKit small-phone core case, with a fresh profile, unchanged reduced motion, gates and the existing 20-minute SIGTERM request. This is not a guaranteed hard deadline: a child that ignores termination can run until the 35-minute job limit, potentially preventing final receipt persistence. No rebuild, retry, model edit or gameplay change.

Optional probing adds stage-start and bounded finite-animation metadata before the unchanged animation wait. An outer runner retains browser DEBUG stderr tail (at most 65,536 JavaScript characters, not a byte bound) and samples descendant process RSS plus cgroup memory events. Sampling cannot prove absence of brief memory spikes, and observation can affect timing. The browser child is not a physical iPhone. A passing diagnostic never replaces the failed mandatory matrix; no cause or fix is established until results are reviewed.
