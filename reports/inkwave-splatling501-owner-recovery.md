# Refs 501: natural-stream recovery owner

Base0ee730b6. Original #536@9239be95 adapter connects native0.22s to the existing postStreamDelay profile. The later dedicated paid-stream owner had restored hard-coded0.22s. Connect its natural end to the same existing profile, preserving the original cooldown maximum policy and fallback.

The current startup bridge also forgot physically held fire during streaming, so it added a fresh1F startup after the existing4F natural recovery. Record held input on that branch; released or cancelled input still clears it. No clocks, damage values or charge/debit/refund rules were replaced.

Tests measure charge frames after existing startup, require an actual emitted stream, and use canonical radius null rather than retired undefined. Fourteen existing cases pass, plus a new fresh-edge after released recovery case. Existing startup phase regressions also pass. Old0.22 and missing held state failures were reproduced separately. Current48/72 charge,80/160 burst,4F cadence,40F ink refill and fresh1F admission remain explicit.

Claim: https://github.com/rhgrive3/actions/issues/501#issuecomment-6026642461 . Full browser/device acceptance remains pending; no new source calibration is claimed.
