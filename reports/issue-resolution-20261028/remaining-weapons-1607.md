# #1607: a separate successful-hook minimum

Baseline: `60bbe35d4c5176fd86cb1b65f8e66336982ef6ca`. Target: production-composed public runtime. The original issue's failed-hook gate remains **45F**.

The successful path had no repeat-time floor. A valid near-wall hook could complete its local flight/pull and the existing 12F arrival wait, then accept another fresh press after only **15F** (walls 0.01/0.2 WU away), **16F** (1 WU) or **19F** (2 WU). This is reproduced through real Actor input and actual Physics, without shortening or skipping a phase in the fixture. `remaining-weapons-logs/zipcaster-success-before.json.gz` preserves all 32 original probes.

The independent public reference is [j1%'s Zipcaster research](https://note.com/j1per/n/ne7085d9350ef), whose performance table explicitly says Ver.5.0.0 and separately lists `触腕連射間隔(最短)20F(0.333秒)` and `触腕連射間隔(空振り)45F(0.75秒)`. That is an older observed minimum, not a current 11.3.0 frame capture. The fetched HTML digest and excerpt are in `remaining-weapons-reference-fetch.json`.

Pinned Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6` rows for versions 500 and 1130 both contain `ShotFailedIntervalFrm=20`, `WaitFrameShot2Attack=12`, hook speed 3.36, maximum length 35, floor minimum 3 and wall minimum 0. Their raw hook ink cost changes from Low=.06/Mid=.0375/High=.0225 to .04/.025/.015. The explicit row comparison is in `remaining-weapons-zipcaster-source-versions.json`. Parameter equality supports continuity of the exported timing inputs; it does not identify the native engine phase or prove a current hardware minimum.

On a **successful** admission only, the runtime now sets `nextHookAt = elapsed + 20/60`. Existing readiness still requires flight, pull and the full 12F arrival wait to finish. An already longer action remains longer. Failure still sets its independent 45F timer, spends no extra hook ink and never pulls into empty space or an invalid close-floor contact. No source field is renamed or interpreted as a universal failure timer, and no missing 25F phase is fabricated.

Verification uses 19/20/21F fresh inputs at wall distances 0.01/0.2/1/2 WU and fixed 60Hz simulation under 20/30/60/120Hz render schedules. 19F is denied, 20F/21F are admitted, and every matching fixed-tick trace agrees. Held denied input does not auto-fire when the gate opens; release/repress remains available. A longer hook retains its flight/pull and 12F recovery. The existing sky/close-floor 44/45/46F boundary test remains green. Separate tests preserve the 35-WU local range rule, passive versus accepted-hook ink costs, the last low-reserve hook's completion/return, event field shape and idempotent remote presentation replay. Remote replay changes neither position, HP, ink, special gauge nor authoritative hook state.

The new boundary/replay/ink/range tests plus the existing failed-hook test pass **7/7**. The complete 19-special suite and the boundary tests before the final range-only test addition pass **91/91**, with no failures or skips. These groups overlap and must not be added together. The old runtime fails the successful-boundary and held-input tests, while its long-action control passes. Logs are saved in `remaining-weapons-logs/`; the 48-condition successful boundary matrix is in `remaining-weapons-1607-minimum.json`.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/issue-1607-zipcaster-success-minimum.test.mjs patches/splatoon3/tests/issue-1607-zipcaster-retry-boundary.test.mjs patches/splatoon3/tests/all-specials.test.mjs
```

These are Node 22.23.4 production-composed Actor/Physics tests, with the documented cosmetic Character fixture. The remote check calls the actual event replayer; it is not a transport/device session. #1607 remains open for current-version controlled failed-hook travel/retreat/recovery captures and the exact meaning of `ShotFailedIntervalFrm`. This change fixes the separately reproduced successful-repeat gap using the independently published 20F minimum; it does not change 45F to 20F or certify Nintendo 11.3.0 phase equality.
