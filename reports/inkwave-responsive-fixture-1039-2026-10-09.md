# #1039 responsive audit: explicit mock-host team confirmation

## Failure evidence and scope

- INKWAVE PR #1182, responsive job [113810814039](https://github.com/rhgrive3/actions/actions/runs/37927678465/job/113810814039), source `b901914dbc6171d22c0d4ba7cb7c4ec975709ffd`.
- The saved Chromium 151.0.7922.34 / 390×844 result reports `coreMenus: passed`, `resultContinuation.status: passed`, no page errors, then a 30-second Ready wait timeout. Its pointer log contains down, up and click on `.iw-btn--ready`. The failure screenshot still shows the guest's unready lobby.
- The production menu correctly refuses Turf Ready until `lob.teamsConfirmed`. Its offline `MockNet` fixture does not simulate that newer host confirmation field. The runner previously tapped Ready and waited forever without supplying a host confirmation update.
- This is a stale responsive fixture precondition, not evidence of a broken pointer target or layout. Real `NetSession.confirmTeams()` already broadcasts the field; the existing two-client production-composition tests exercise that path.

## Change

For a built source whose identity contains the host-team adapter, the runner now taps Ready once and checks rejection before confirmation. A named, strictly MockNet-only helper supplies the simulated host confirmation and emits the native cloned `lobby` update. The runner then taps the same production Ready button and retains its existing successful-ready assertion. No production admission guard is weakened. The helper cannot operate on real sessions, host views, Boss lobbies, missing lobbies, or unassigned teams.

The helper is included in runner hashes. Failure evidence now records lobby state, mock/host flags, mode, confirmation and local readiness so a future missing precondition is visible without inferring it from a screenshot.

## Verification and limits

`node --experimental-vm-modules --test --test-concurrency=1 --test-timeout=5000 scripts/tests/inkwave-responsive-fixture.test.mjs patches/splatoon3/tests/issue-1039-host-ready.test.mjs patches/splatoon3/tests/issue-1039-private-host-teams.test.mjs`

**13/13 passed, no skips.** The new VM case uses the actual six-adapter-composed MockNet and menu Ready action: eight-player guest lobby, pre-confirm rejection, native cloned confirmation event, normal `setMe` acknowledgement after Ready. Existing real two-client host/guest confirmation, reassignment, join/leave, mode switch, navigation and roster retirement tests remain included.

This is a focused fixture/runtime-contract check. No new browser pass is claimed: this executor's previously checked Chromium socket restriction remains unresolved; the Actions artifact supplies the observed failing browser evidence. The subsequent full Chromium/WebKit responsive matrix remains to be established by CI. This changes no gameplay or Nintendo values. Splatoon 3 reference remains the #1039 Private Battle team-confirmation flow; no Switch/device comparison or complete #1039 closure is asserted.
