# TIME UP cancels pending offensive input (#935)

Base: PR #868 `c633befcf9c6c17d667f6d050a97f90ad5b13332`; main remains `f31f5da439134fe49bb89018dad5557671a49c67`.
Claim: https://github.com/rhgrive3/actions/issues/935#issuecomment-6027725770

The current installed Match/Player/Actor path produces one Charger shot or starts a Splatling stream when held FIRE is neutralized at TIME UP. Ordinary held SUB already remains unthrown through #410's paired current/previous input cleanup; that case is a retained control, not a newly fixed root.

The existing `captureTurfFinish` transition calls the established `cancelPendingInput` owner before clearing levels. Each weapon retains its own pending-state cancellation and unspent reservation refund. This does not call full runner reset, change configured values, or clear accepted projectile/bomb/cloud lists. Existing finish coverage capture and follower result authority remain unchanged.

Validation: old runtime reproduces two failing held-charge cases and the passing held-SUB control. New eight cases cover 30/60/120 Hz fixed-step partitions for offline/host, ordinary intentional release, once-only transition, existing cooldown/roll/recovery fields and accepted object identity. Existing #838/#410 tests pass 19/19. These are composed source/VM tests with real Match/Player/Actor/Runner and bounded render/network stubs; no new build, CI, hardware or browser acceptance is claimed. The host case uses the real NetMatch object; it is not a two-owner network migration test.
