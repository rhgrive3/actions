# Recover PR790 assist presentation (#561)

Original: PR790 a71da170ca4dc5a0c55e5633907c9ed9edced300.
Base: PR868327651d26bfbd63d2f867e1205b14aa88e339948 plus the separately delivered790 UI3-root patch1765203a7b74b9220ab618e92d0eac31f092958fcc1fc672583c51b0b6bc5677.

The original assist-presentation leaf is retained byte-for-byte. Its registration and CSS turn accepted assists into a distinct world-position splat marker, remove the assist card and extra sound, and preserve direct-splat cards and ally-down markers. Current score-hud's victim-authoritative assists array remains the admission owner. No raw damage-window admission is restored and no Flow/stat transport changes are made. The existing world-marker pool owns timing and cleanup; records retain scalar positions only.

The original test's method boundary and event inputs are adapted to current authoritative helper metadata. An additional actual Actor.damage/splat → current Flow helper list → HUD case verifies the accepted event path while preserving assist stats/progress. Eight source tests pass, including raw negative, current admission exclusion, direct kill, ally-down and fail-closed anchors. The original optional emitted-site test is skipped because no new build was requested; no browser/image acceptance is claimed here.
