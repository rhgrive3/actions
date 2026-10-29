Eight historical underlying causes remain unproven after a fresh read-only investigation. The preserved evidence establishes three WebKit page crashes, four runner shutdowns and one native-menu timeout. Current gate passes do not establish their old causes.

These are eight events within the original85-log cohort, separate from the15 post-atomic logs/14 gate families/6 diagnosed causes. No logs, failures or holds have been removed. No rerun, dispatch, cancellation, production edit or push was performed for this investigation. No full76–130MB artifact archive is duplicated here; selected members were read with HTTP byte ranges and verified with ZIP CRCs. `receipt.json` records SHA256 values of every retained uncompressed/gzip payload, all source identities and exact status/timing data.

| PR | Run | Job | Job duration | Run / job result |
| --- | --- | --- | ---: | --- |
| #1897 | 40688736829 | 122833440425 | 1279s | failure / failure |
| #1905 | 40688636634 | 122829175776 | 66s | failure / failure |
| #1902 | 40604364455 | 122540051814 | 56s | failure / failure |
| #1901 | 40601426038 | 122530225554 | 237s | failure / failure |
| #1882 | 40529036880 | 122299997364 | 1609s | failure / failure |
| #1882 | 40529035746 | 122279728189 | 101s | failure / failure |
| #1900 | 40510247760 | 122291734506 | 1322s | failure / failure |
| #1899 | 40507015575 | 122232103890 | 1568s | failure / failure |

The four CPU jobs all emit only the TAP header, then a runner-shutdown message and exit143. They end56–237seconds after job start, below their exact60-minute timeout, with matrix fail-fast disabled. There is no later same-branch workflow run after any target run; sibling CPU jobs continue after shard2 ends. Two PRs merged before these jobs even started, while the other merges occurred17minutes and104minutes after shutdown. Those observations provide no common superseding-run, merge-time, timeout or fail-fast explanation. Public run/job/check annotations identify no shutdown initiator, kernel/OOM cause or host service event. Four distinct runner names are retained. This is not the later deterministic maxUses reference assertion failure.

The three responsive artifacts record `page-crash` at63969/38872/44510ms before first error (+1ms) and context-close-start (+2ms). Last completed stages were robo/airport/tidewater respectively, pending setup-stage-settle. WebKit26.5 had already rendered and navigated; the remaining13 of14 independent cases passed. All failed child stderr files and page-error arrays are empty. Browser disconnection occurs during cleanup after the crash. This distinguishes an actual page crash from deliberate cleanup or a parent child-process timeout, while the engine/OS trigger remains unknown. The distro-cache ICU loader repair cannot explain these already-running browser crashes. The public GitHub Status50-incident history covers these dates and contains no overlapping Actions incident; that absence does not rule out an isolated host failure.

The #1882 candidate captured52screenshots and one desktop performance row before mobile setup admission failed at its original180000ms shared deadline. Its last diagnostic is visible, unpaused MATCH/PLAYING on map `range`,12actors, boot32996ms, no boot/page errors. Expected setup admission was not recorded. The archived browser-stderr file expressly says no stderr block was reported. No complete native focus/menu event provenance was retained, so the exact input/navigation mechanism is unproven.

A bounded source comparison finds a concrete existing guard against that route class. Old cb41 used locator-targeted Enter without verifying native `Menus._focus`; native Enter dispatch activates `_focus`'s binding independently of DOM focus. Current helper (identical at published bb/2b and reviewed b67) observes the real native focus graph and permits touch Enter only after the exact ready Turf owner is selected; desktop uses a native hit-tested click. Current code retains one180000ms budget, exact setup verification and one real START, and fails closed on blocked/stale/hung navigation. Existing source controls pass20/20,0skip under Node22.23.4, including actual composed graph and blocked/stale/hung-input negative controls. This is source/control evidence for the existing repair, not a retrospective reproduction or a new hosted/browser acceptance claim.

The three archived crashes, four shutdowns and original menu timeout remain failed historical runs. MOV08b and isolated Character QA remain held; #401 is excluded; main was not changed.
