# #1178: reject malformed event containers before snapshot mutation

## Reproduction

Base: aggregate `acd6a4b4`, after the timestamp and signed-HP corrections. Latest #1178 comments and open PR #1181/#1183 file diffs were checked on 2026-10-09 UTC. Existing actor-array/row guards are not replaced or duplicated.

The actual composed `NetMatch._tick` updates peer timing and actor buffers before the terminal-credit filter reads `d.e`. An object supplied as `d.e` throws at `d.e.filter`; a null member of a real event array throws at `e[1]` before the later event-row validator. The complete-bootstrap negative control sends a valid snapshot at timestamp 1000, then an invalid event container at 2000. The invalid packet throws after setting the peer watermark and actor position. A following normal timestamp 1000.1 is consequently rejected.

## Correction

Immediately after the existing timestamp check, reject a non-null/non-missing event container that is not an array, before creating a peer or changing clock/window/actor state. The terminal-credit filter now checks each member is an array before reading its fields. Its authenticated victim-owner requirement is unchanged.

Missing, null and empty event lists retain their existing meaning. Malformed individual rows are skipped so normal actor snapshots and valid event rows in an otherwise valid container still work. No timeout, array-size limit, new protocol version, gameplay value or Nintendo network parameter is introduced.

## Validation

Four new tests use real runtime install plus every additional production bootstrap wrapper in source-verified order. Build transforms apply to both upstream and runtime modules. Native `_sendTick` produces actor rows and the installed `onMessage`/`_tick` receives them.

- Removing only the new container guard reproduces the exception, clock poisoning and rejection of a subsequent normal snapshot.
- Object/string/number/Boolean containers are rejected without altering the prior clock/buffer; the next valid owner packet is accepted.
- Removing only the early row check reproduces the null-member failure despite the later row validator.
- Missing/null/empty event lists and malformed individual rows retain normal actor admission. A valid event remains queued; forged terminal credit stays rejected and legitimate victim-owned terminal credit stays accepted.

New tests plus adjacent combat-credit/life tests pass **25/25**. The new four cases apply complete bootstrap; some pre-existing adjacent cases intentionally cover native adoption compatibility and are not evidence of production human adoption. Separate snapshot/timestamp regressions pass **10/10**. Syntax, whitespace and quick upstream/numeric checks pass.

Splatoon 3 baseline remains 11.3.0. This is an INKWAVE wire-shape safety correction, not a new retail timing or behavior claim. VM/native checks with fixture world/presentation objects do not establish browser, live relay or Switch parity.
