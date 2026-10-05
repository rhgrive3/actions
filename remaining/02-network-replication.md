# Remaining: Network / Replication

Status: not included in this PR.

Priority issue:
- Roller vertical flick looks normal locally but remote players can see ink travelling far beyond the local visual/gameplay envelope.

Trace:
local projectile -> serialization -> transport -> remote reconstruction -> interpolation -> remote FX.

Compare:
- vertical/horizontal mode
- spawn origin
- direction/velocity/gravity/lifetime
- paint projectile vs damage projectile vs visual-only FX
- stale attack state leaking into the next attack

Do not solve this by shortening authoritative weapon range or applying a cosmetic distance clamp.

Acceptance:
- same attack produces equivalent local/remote projectile envelope
- repeated horizontal/vertical attacks do not leak state
- 2-player regression coverage
- packet/performance impact measured
