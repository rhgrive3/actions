# Bot paint observations at perception cadence

Refs #861. Start: https://github.com/rhgrive3/actions/issues/861#issuecomment-6024759458

The two unconditional tactical paint-density scans in native BotBrain now reuse per-brain scalar observations until the existing Turf/Boss perception epoch changes. This consumes no extra random numbers and does not change the existing decision timer. A first observation, team/mode/paint-system change or movement of the query center by half its radius refreshes immediately. Death, Super Jump, inactive matches and reset retire the observation. Other navigation/special region scans remain unchanged.

The native update and Boss update paths were exercised with real Actor/Three objects, fixed perception/navigation fixture inputs and the real aim/movement tail. For seven brains over 60 fixed ticks, the old two hot paths each issue 420 scans; the corrected fixture is bounded by 49. These are actual regionStats call counts on controlled scenes, not measured physical-device CPU milliseconds. Changing paint becomes visible by the next perception; current ground ink, refill and aim/movement continue per tick. Shared scratch results are copied into per-brain scalar fields. Cache invalidation and unknown/repeated adapter application are covered.

Eight focused cases pass, including 30/60/120 Hz render grouping over the same fixed ticks and the old-runtime scan-count control. Full browser/mobile CPU acceptance remains pending. Source transformations across the current build chain pass; native paint ownership, scoring and projectile paint are not modified.

Additional actual-perception boundary: initial positive think still observes once; the next native perception selects a newly visible enemy and enters combat without another paint scan. Boss beam threat changes are consumed immediately while paint is cached.
