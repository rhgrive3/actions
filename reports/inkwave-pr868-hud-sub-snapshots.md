# PR868 Main sub-cost and persistent HUD connection

Source: bf3072757db879e50b24f88ea2f3aaf3899d5fd9. These three original modules were byte-identical to f97cebd47eaca39bc57da44bb110d3e1569aa3c6.

The Gear/Sub adapter changes native Main cost/readiness fields before HUD snapshots consume an old whole-frame anchor. This bridge recognizes the existing gear and ShotGuide fields and passes each current value once into the persistent frame. Reverse ordering refines only the snapshot cost argument. The helper updates desktop and mobile from the same raw cost; it keeps frame/crosshair/mobile reuse and one authoritative teamSummary(viewerTeam) call. No gear curve or gameplay number changes.

Eight limited regressions passed: each adapter alone, both pair orderings, the current ShotGuide expression, old-order conflicts, the old runtime fixed70 loss, pool/value reuse and fail-closed unknown/repeated input. They execute the transformed native Main._updateHud and actual adapter/helper code; Actor/team/DOM consumers are bounded stand-ins. The portable test embeds only the original published Main branches/helper for its negative controls.

This is not full PR868 build, browser/physical UI or complete #349/#432 acceptance. Match/TurfLead and other known integration failures remain separate. Source owner branch and main were not changed by preparing this bridge.
