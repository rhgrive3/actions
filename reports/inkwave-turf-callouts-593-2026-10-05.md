# Turf personal streak ribbons — Issue 593

On the S3 integration candidate, native HUD shows FIRST, DOUBLE/TRIPLE/QUAD, REVENGE, SHUTDOWN and personal-streak ribbons after a direct local splat. The requested S3 Turf presentation uses ordinary splat confirmation and independently generated team WIPEOUT feedback.

The quality adapter returns from the local-kill HUD branch after its ordinary kill card when the current Match mode is Turf. Existing streak/stat bookkeeping and all event consumers remain; team:wipeout has its own producer/subscriber. Assist attribution, death cleanup, ordinary cards and non-Turf original presentation remain untouched. This introduces no weapon, scoring, Flow or network change. S3 behavior reference and limits are recorded in https://github.com/rhgrive3/actions/issues/593 ; no Nintendo numeric/physical parity is claimed.

Native full Match/event-bus/HUD tests: 10/10. Actual emitted tests: 10/10. The eight banner triggers each retain a direct kill card with zero extra ribbon/audio. Existing own/enemy/repeated WIPEOUT, assist and pending-event lifecycle tests remain included. The old emitted source fails the new Turf suppression test with one unwanted ribbon. Combined #560/#564/#593 build is e1ce78c53a14. Browser visual acceptance remains pending the next composed CI; no per-Issue push or main merge was performed.
