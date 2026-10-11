# Big Bubbler ignition paint authority

The actual Actor activation, complete NetMatch.bind, deployment/use events and paint replay produced 977 local occupied cells but zero remote cells. The ignition's 4.5 world-unit stamp exceeded the ordinary radius allowance of a small-radius main. This is distinct from the catalogue-sub grant in PR #1225.

The correction records a single paint grant against the real deployment event. It requires the sender's remote actor and owner, team, equipped Bubbler, match epoch, source life, activation serial/id, validated deployment state, exact source paint radius and seed. The center must equal deployment position plus the existing height offset within wire-position rounding tolerance (0.011 world units). Generic paint limits are unchanged. Deployment and paint share the existing payload validator, sequenced pending-birth ledger and per-birth consumption.

The local paint shape stays unchanged. A per-activation uint32 seed is chosen before deployment, included in the birth and used by ignition paint, so the receiver can validate the exact selected footprint. Ignition continues to award turf without refilling the special gauge.

## Verification

- Actual activation/full event replay: 977 / 977 cells, duplicate replay inert, special gauge zero after activation and ignition.
- Rejected altered radius, center, seed, team/life, missing receipt, invalid HP, impossible deployment position, owner and deployment age.
- Already accepted birth remains usable after owner death. Missing birth stays unpainted until its causal event arrives.
- Actual tick receive handles reverse event order and an older deployment envelope.
- Source run: 67/67 across the initial three new cases, existing Bubbler suite and kit admission regression.
- Production build contentHash `56c8616b6a40cfe04b22866678ee328af49b35e4cce91f9e4510213452a694c0`: full built-module execution passed new Bubbler 4 plus catalogue-sub 13 cases (17 total). The concurrently run 47 legacy Bubbler cases also passed; those directly import the source Bubbler module and are therefore mixed source/built tests, not 47 additional fully built-module proofs.

Real-browser/GPU CI remains required. No retail stencil or full server-side movement/launch validation is claimed. The protocol validates a bounded action-specific paint capability within the existing client-authoritative game.
