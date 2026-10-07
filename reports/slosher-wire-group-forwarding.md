# Slosher volley identity forwarding in the composed graph

Refs #627. The C-lane admission and recipient-owner implementation remains the owner of this issue. This is a final integration connection repair, recorded in issue comment 6023342366 after checking the latest issue comments, matching PRs and PR868 head 7f34ca234ae2440afbf0a136cc21423bcd4b8620.

The existing receiver and NetMatch.sendHit already support the volley identity. Two intermediate calls lost it: the final-damage wrapper called its delegate with four arguments, and the native Projectiles.applyHit method likewise called sendHit with four arguments. The repair forwards the existing fifth argument through both locations. It does not introduce a wire field, change damage limits, route authority, life/session identity, or admission decisions.

The actual composed Actor/Projectiles/NetMatch regression now passes the existing three #627 cases: local invulnerability rejection followed by a valid contact, victim-owner rejected/accepted/duplicate contacts, and host adoption of a reused volley ID. The separate three Roller group-owner tests also pass. The old four-argument forwarding negative still loses packet.g and creates no recipient volley budget, demonstrating the original failure independently of the fix. These seven cases are source-level, not a new whole-CI or browser acceptance claim.

This closes the packet.g limitation recorded in weapon-sampling-owner-acceptance.md for the same fixed repair set. Existing original failed logs remain evidence of the pre-fix behavior. Source PRs and main were not modified by this worker.
