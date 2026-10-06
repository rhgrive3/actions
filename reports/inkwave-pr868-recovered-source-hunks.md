# Recovered source hunks in PR868

This table tracks selected source fixes by behavior, not by counting ancestor commits as proof of complete retention. Main merging remains paused. Each subsequent port must preserve concurrent remote changes.

| Source PR and exact head | Issue / scope | Current port | Complete or partial |
| --- | --- | --- | --- |
| PR751, e5640caa09d84560d1fdf792a74511b806384081 | #117: low-ink feedback follows failed local use, rather than a fixed remaining-tank percentage | Current persistent HUD helper and touch consumer share the existing lowink-event flash. Gear sub-cost/readiness, pool reuse and unrelated presentation remain owned by the current integration. | #117 implementation port complete; 7 focused + 8 existing composition cases pass, independent read-only review passed. Aggregate CI remains required. PR751 as a whole is still under review and is not declared fully included. |
| PR787, d0e7854f00803219b8940d190d45893a7d3094a5 | Refs #738/#741: jump gate and roll-resource recovery | Both narrow runtime hunks and regressions were retained through PR818. | Partial Issue scope: no assertion that full #477 48F startup/recovery acceptance is complete. |

## #117 evidence and source correspondence

Adopts only PR751 Issue117 failed-use shortage semantics onto PR868 HUD snapshots. Desktop and touch consume the same existing local lowink-event flash; remaining tank fraction alone no longer activates shortage feedback. The actor-specific sub cost/readiness and persistent frame/mobile objects are unchanged. Seven new source cases and eight existing gear/snapshot cases passed; native Main, HUD, Mobile and admission methods use bounded DOM/projectile sinks. This is not a full S3 timing, browser, emitted-build or device acceptance result. Source PR751: e5640caa09d84560d1fdf792a74511b806384081. Target files read at 2e81e219 and verified unchanged at cc0a12890260c92c83e3f97f1aece82e2436b67b. No other PR751 roots are included.

The prior producer used a.ink < 18 || game._lowInkFlash > 0; native Mobile had an independent 20% threshold. Negative controls reproduce both. The port retains the existing local lowink listener and confirms normal affordable fire, other Actor isolation, flash expiry at identical ink amount, gear-cost boundaries and persistent object reuse. No new gear curve, numerical gameplay value, browser result or physical-device match is claimed.

The source PR's former whole-Main adapter was not copied over the current integration. The behavior is attached to the current producer/consumer instead. Other source PR751/785/790/786/765/782/761 omissions remain separately tracked and are not silently included in this commit.

## PR761 fixed set: collision scratch, Charger launch speed and release gap

Source PR761 afdba0d7fdce4a1a142e19d30b057e78eb220992; target aa094850fdd60b3b70adfdaad54b3e3837cb1402. Issues #606, #617 and #680 are ported as a fixed three-root set. Existing progressive ink payment, startup admission, feet paint, finite-flight ownership and 16F post-shot writer are preserved. The 1F release gap is reflected in adjacent source and semantic-gate fixtures. Fifteen focused source cases and one semantic gate passed; all touched JavaScript parsed after the patch applied cleanly to the latest target. Full aggregate CI is not claimed. Other PR761 roots remain separate and the entire source PR is not marked adopted by ancestry.

## PR751 fixed PropKit set

Source e5640caa09d84560d1fdf792a74511b806384081; Issues #516 and #526. The two original leaf adapters and dedicated fixtures/tests are connected through narrow quality registration hunks. Seven focused actual PropKit/Three cases passed: LOW/touch atlas 1024, Halyard retained parts 12793 to 0, geometry/UV/collider/animation equivalence and rebuild/add/clear/dispose. Fixture realpath normalization ensures transformed native imports also work through symlinks. This is a complete implementation port for these two root scopes, with full aggregate CI pending; other PR751 roots remain unported.
