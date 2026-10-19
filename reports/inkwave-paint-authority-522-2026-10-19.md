# #522: authoritative paint sender and owner admission

Every online gameplay stamp now carries explicit authority. A relay member's colour, host status, or resemblance to a death burst no longer grants ordinary paint authority.

## Contract

The paint-order sidecar carries a mandatory tagged authority record. The authenticated relay sender, match ID, simulation tick and monotonic event sequence identify the sender's action; the authority record identifies its roster actor and current ownership generation. The actor must belong to that sender and its team must match. Generations survive same-session, same-match NetMatch recreation; departure/adoption increments them before ownership changes.

Unscoped local online paint returns zero before CPU ownership, delayed growth, turf credit or special gain. Explicit cosmetic paint remains rendering-only. Remote rows without authority, including legacy representations, reject before replay/HLC watermarks. All participants need the updated client; mixed old/new clients are not a supported match protocol.

Admission and application both check authority, including recovered capabilities, FIFO overflow and host deadline commits. Queued former-owner paint becomes invalid on transfer. Rejected rows leave the same sequence available for correction.

Special producers have separate authority:

- Death blasts come from the victim owner, independently of attacker credit. The proof binds victim, ownership generation, life, attacker, death origin, seed and deterministic plan index. Geometry/radius/seed/team/kind/stretch/face must match the existing eleven-entry plan. The origin retains the existing six-unit interpolation envelope. Each entry is consumable once per life, even under a new wire sequence. Consumption follows paint and causal-clock observation.
- Boss hazards and crablets explicitly identify host-owned Boss paint. An actual Boss match and the current relay host are required. Host status alone cannot authorize ordinary foreign-team paint.
- Zone capture identifies the host-owned zone and CPU cell; the receiver checks the exact existing centre, radius, seed and face. Flow paint now names its actor.

Lossless dictionary version 3 preserves the added sidecar. Peers without codec support retain raw transport; raw paint still needs identical authority. Both new admission modules are included in build identity hashing.

## Trust boundary

This completes sender/roster-owner admission within the existing owner-authoritative simulation. It does not move simulation to the relay or prove that a malicious actor owner simulated its own movement, ammunition or attacks honestly. The host remains result authority. Comprehensive anti-cheat and cryptographic proof of gameplay are not claimed.

## Verification

The dedicated regression uses production composition, actual CPU PaintSystem, actual Boss/zone producers and Match judge. It covers mismatched/malformed actors, generations and matches, legacy rejection, cosmetic isolation, exactly-once application, sequence recovery, full queues, deadlines, queued handoff, adoption/recreation and the final winner. Actual Actor.splat tests check forged death plans and repeated droplets. Existing canonical paint, numeric/capability admission, wall drips, 30/60/120 Hz ordering, projectile/bomb/storm, hit handoff, dodge and dictionary regressions are retained. Artificial test producers explicitly name their owner; no production acceptance switch or fixture bypass was added.

CPU tests use a renderer stub and are distinguished from production build and real-browser relay evidence.

## Splatoon 3 comparison

Reference remains the existing Ver. 11.3.0 profile. Paint geometry, weapon/radius tuning, death-blast parameters, seeds and simulation steps are unchanged. This is an INKWAVE authority contract, not a claim about Nintendo's private networking. No new Switch measurement is claimed.
