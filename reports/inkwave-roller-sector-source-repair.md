# Roller sector and current fixture connections

Refs #734. Existing source reader and near-glob writer were retained, but configureFidelityFlick did not write sector yaw for the main units. Record the same accepted actor yaw for horizontal globs; vertical retains a null sector. Preserve all bands, distance, fan RNG, group and pool retirement. Claim: https://github.com/rhgrive3/actions/issues/734#issuecomment-6026513039

Actual sector suite7/7 passes. Removing only the new writer reproduces the old installed-emission failure. This is not a damage-table change.

Two test-only connections are separate: the real recorder uses its existing35-field envelope and explicit unit index32 (four replay cases pass); the moving Character fixture measures sustained contact at the final held interval1.2–1.25s after current vertical31F release plus22F roll admission. The unchanged floor clearance, grip, axis, blend and0.055 floor-contact bounds pass all30/60/120Hz/landing/restart combinations. The earlier full transition still checks every actual vertex for floor penetration. No runtime presentation change or tolerance widening.

Patch is based on the fixed Kit/527 candidate following6cb6d075. Full build/browser acceptance remains pending.
