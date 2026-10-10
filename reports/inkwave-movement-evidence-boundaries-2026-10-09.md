# Movement evidence and two admission/transition repairs

Date: 2026-10-09 UTC. Integration base: local `c275cd75f6e5fa643f30450e4019164bea5dc2d0`, matching the parent-provided tree for PR1182 remote `12be2542f4e858221267c6c4afe894da15f4db58`. Target: published `inkwave-public/` plus S3 build patches; S3 11.3.0. No upstream bytes or gameplay coefficients change.

## Implemented boundaries

### #890: B released before buffered landing admission

The full production adapter/runtime, native Actor, actual Physics and a flat Level reproduce a missing short-hop response. Start 0.04 WU above the floor at -2 WU/s, with no coyote time, and press B for one fixed tick. Native landing retains the existing 0.13 s jump buffer, and the next tick admits the ordinary humanoid jump while B is already released. The old wrapper creates `{released:true, applied:false}` and consequently never applies the existing short-hop response. Its apex is the held-jump value, 1.3491667 WU.

Newly admitted jumps now begin with an unconsumed release check. On the next ascent tick the already-released input receives the same existing response as a direct 1F tap. Buffered and direct taps have identical post-admission traces (apex 0.7203333 WU); sustained hold is unchanged. These are engine fixture measurements, not Nintendo measurements. Existing provisional `holdFrames=5` and `releaseRate=0.7` are unchanged. A source-mutated negative control restores the bug. Full fixed-step traces agree at 30/60/120 Hz.

### #846: crest lost after automatic tall-wall traversal

The existing partial repair keeps automatic climbing after its timed boost ends. But `_ledgePop` emits `squidsurge_top` only during `burst`, so reaching the ledge after 40F in `auto-climb` loses the crest event even though native launch and its armor still occur. The same actual native ledge path produces a crest at 2F.

The crest event now belongs to a real climbing-to-air ledge transition in either phase. Only an unexpired burst may retain its boost velocity. The existing native post-boost ledge velocity remains intact, and later `_ledgePop` calls without a new wall exit cannot replay the event. Charge, boost, armor, duration and geometry values are unchanged. This repairs a state/visual transition; it does not establish the unmeasured high-speed wall-traversal curve required for full #846 closure.

## Source material actually opened

- [Nintendo current S3 update history](https://support.nintendo.com/jp/switch/software_support/av5ja/index.html): confirms 11.3.0; its wall-Surge note concerns post-wall horizontal travel, not an in-wall velocity curve.
- [Nintendo research report](https://www.nintendo.com/jp/switch/av5ja/report/index.html): Flow grants the four named gear effects; no jump-hold cutoff, footwear offset or Splatling deceleration equation is specified.
- [Noramani's own wall demonstration article](https://note.com/noramani_game/n/n53e47637bff5): distinguishes neutral wall descent and explicit downward-stick Surge cancellation. It supplies no calibrated velocity curve.
- [Current Charger-class wiki source](https://wikiwiki.jp/splatoon3mix/ブキ/チャージャー属): the alleged footwear-height passage in #956 could not be located in the opened content. The original shoe comparison post [ymmr_c0c0, 2022-09-14](https://twitter.com/ymmr_c0c0/status/1569929509859905536) was identified, but its direct fetch returned HTTP403. Therefore its video, exact shoes and shot-height displacement were not measured.
- [S2 parameter table](https://mirayxs.github.io/SplatHeX/param/parameter_splatling_jp_140.html) and current S3 parameter pages were opened. Labels/values alone do not establish a per-frame equation.

The three S3 JSON files below were independently fetched directly from public GitHub through the connector, at pinned [Leanny/splat3 7280ff9c](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6). The reported findings can be reproduced from these public URLs without access to private files.

| Public file directly read | Public Git blob SHA-1 | Result |
| --- | --- | --- |
| [WeaponSpinnerStandard 1130](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json) | `76e62caaa2c3bee8f502b1794c8cf91cf5cbc972` | `MoveSpeed_Charge=.062`, `VelGnd_Bias_Charge=.9`, `VelGnd_DownRt_Charge=.05`; no consuming equation |
| [SplPlayer 1130](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json) | `83fdedf7bccc19c65609c3b1fd2a94cf7c9c59d0` | Surge charge gear frames and Stealth Jump bounds; no normal jump hold/release or wall-boost velocity curve |
| [GearInfoShoes 1130](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/GearInfoShoes.json) | `1fe4ebffa776762807851a5a2c9bf58b81d6a4f2` | 256 shoe records, 28 distinct keys; no sole height or shot-origin displacement field |

No fabricated equation or unused calibration-input feature was added for #952/#956. #890's Nintendo cutoff/curve and #846's extended fast-climb curve remain open. #253 and #387 had fresh external owners/PR1190 and PR1189, so no duplicate implementation was started. #272/#292 also had active owners. #417's +30AP/cap57 implementation already exists in this integration base; its source and focused tests were checked without claiming a new fix.

## Verification

- Initial regression run reproduced the buffered-tap and missing tall-wall crest failures before runtime edits.
- Seven focused source suites: 54 passed, zero failed, zero skipped, including actual Physics buffered jump, normal tap/held emergence, existing Roll/Surge charge/cancel, ledge armor and fixed-step cadence.
- Source test measurements are not browser or Switch hardware parity. Additional build/emitted checks are recorded below after execution.
- Adjacent Flow/owner, Surge detach and native wall-motion suites: 25 passed, zero failures/skips. Existing #417 temporary AP/cap/expiry behavior passes; no new #417 runtime change is needed.
- Production build `b7fd15c852c3` succeeds, with all source numeric/upstream quick checks passing. Ten selected actual minified/emitted buffered-jump and Surge cases pass, zero failures/skips. The old-source mutation negative control is deliberately source-only, not included in the emitted selection.
- After extending the crest test to repeated helper calls, the eight-case final source crest suite passes. `git diff --check` passes and `inkwave-public/` has no diff. Full repository CI and browser render acceptance were not run in this worker.
