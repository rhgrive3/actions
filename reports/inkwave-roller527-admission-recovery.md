# Refs 527: retained-profile admission recovery

Original source: PR #536, commit 9239be957ce1594ce4c562de5cfb7043aa07d9fc. Current base: 6cb6d075d86b5e91d675c8cc6f75561f7a027a64. Claim: https://github.com/rhgrive3/actions/issues/527#issuecomment-6026380294

The existing squidFlickDelay=13/60 profile had lost its Actor admission and buffered-press connections. Actual source vertical squid-start emitted at36F while horizontal retained34F through its separate compensation. Restore the original two helper functions and two native call connections, preserving current roller/freefall/post-release owners. No profile or numeric values changed.

Validation: original startup six tests now pass; old runtime failed two. A new actual accepted-jump versus natural-fall composition with #479 passes, retaining vertical44F and horizontal34F and admission-time mode ownership. Related flick fixture now measures the already-published31F vertical windup; Tenacity uses existing firing-speed gear and real accepted jump rather than manually treating every airborne state as vertical. Related five flick cases and one Tenacity case pass. Existing ink, passive special, repeat, release, cancellation and render cadence assertions remain.

Original source community timing/calibration and physical-device limitations remain; this is connection recovery, not new Switch measurement. Main merge and complete browser acceptance remain pending.

Full transform composition exposed #435 expecting the old native emerge line. Its leaf now accepts exactly one of the raw or recovered Roller variants, retaining the chosen fallback owner. Existing actual Slosher seven cases pass, including Shooter isolation and swim/landing/reset. All294 transforms pass.
