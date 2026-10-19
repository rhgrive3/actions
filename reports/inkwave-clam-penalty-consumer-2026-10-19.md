# Clam Blitz: floor the new penalty when a scoring window closes

## Baseline and source basis

Baseline: main `3e8812d996eea01ad4cab84eb8fbaa3545cb5d5f`. The Clam rule, shared engine, installed Match consumer, UI and network modules were retrieved at that exact ref through GitHub and matched against the local Git blob hashes. Rule blob: `d6c4cb38058c4f7bd11024740b3063b18a461850`.

- [Inkipedia: Clam Blitz, Gameplay → Scoring](https://splatoonwiki.org/wiki/Clam_Blitz#Scoring), retrieved 2026-10-19. The page introduction explicitly covers Splatoon 2 and Splatoon 3. Scoring is a common section, outside the later title-specific gallery headings. It specifies closure-time assessment: “a penalty of half the points scored, rounded down, is imposed on the team”. The basis includes points spent repaying a prior penalty and does not subtract a tied-score correction. The current page reports revision `730528`. The fixed-revision URL was inaccessible, so this is a saved current-page retrieval with its reported revision, not a separately retrieved historical revision.
- [Splatoon 3 攻略＆検証 Wiki: ガチアサリ](https://wikiwiki.jp/splatoon3mix/ガチアサリ#d919fc8f), retrieved 2026-10-19, last-modified 2026-10-08 00:14:26. Its S3-specific table assigns 3/20 points and 1.5/10 penalty contributions, and its prose describes adding half the whole window to the remaining penalty. It does not explicitly settle rounding order. The aggregate is rounded only after summing all small clams, rather than rounding each 1.5 contribution.
- [Nintendo's S3 beginner guide](https://www.nintendo.com/jp/ichikara/av5ja/03.html) supports the broad objective but does not document penalty rounding. No new Switch hardware measurement or exact retail-version verification was performed. This is a Wiki-conformance correction.

A third-party article caption describing 71 points and +35 was found, but its image could not be retrieved (web cache miss; direct GET 403). It is not used as visually verified evidence. No access-denial bypass was attempted.

## Reproduction and effect

The real composed Actor throw input reaches installed `Match.advanceRanked` / `buildFrame` and the authoritative Clam rule. Only actor movement integration, display/audio effects and floor collision are fixture inputs. With no pre-existing penalty, a Power Clam and one small clam score 23 points. Before this change the basket closes with raw penalty 11.5 and the production HUD formatter shows +12. The next Power Clam pays the fractional balance, moving the main count from 77 to 68.5 (HUD 69), rather than the documented +11 then count 68. The fractional balance therefore affects later scoring; changing the HUD alone would hide the rule defect.

Two successive 23-point windows followed by another Power Clam leave count 57 before correction and 56 afterward. A separate 71-point window followed by partial repayments verifies that unpaid old penalty is retained: corrected balances are 35 → 15 → 25 → 2 → 13 → 0, with final count 22. The original path produces 35.5 → 15.5 → 25.5 → 2.5 → 14 → 0, with count 23.

## Minimal change

`ClamsRule._closeBasket` computes `Math.floor(chancePoints / 2)` once and uses that value for the existing addPenalty/fallback paths and barrier-close event. Scoring, the shared engine, HUD, timers, throw physics, network schema and presentation are untouched. Existing fractional snapshots remain accepted; this change does not retrospectively rewrite already stored counters. New windows assessed from a normal integer starting state no longer create a half point.

PR1627's separate `kind` → `clamKind` event repair is retained in a zero-fuzz integration check; it is not included in this independent patch. The frozen visual v5 source is unchanged.

## Validation

- New regression: odd/even totals 20/23/26/71; both teams; dt 1/60, 0.05 and 0.2 seconds; penalty close-event payload; repeated close; snapshot restoration; subsequent score consumption; multiple partial-payment windows; tie/overtime closure; legacy fractional-state compatibility.
- Actual installed consumer: Actor intent, Match scorer, production HUD formatter on inert DOM, authenticated host snapshot delivery, rejection of a non-host sender, and follower non-authority. This is CPU coverage, not browser rendering.
- Final counts and negative-control results are recorded with the associated PR validation. Exact-head CI and existing production ranked browser checks remain separate acceptance gates.

```sh
node --experimental-vm-modules --test \
  patches/splatoon3/tests/ranked-clam-penalty-consumer.test.mjs \
  patches/splatoon3/tests/ranked-clams.test.mjs \
  patches/splatoon3/tests/ranked-wiki-rules.test.mjs \
  patches/splatoon3/tests/ranked-engine.test.mjs \
  patches/splatoon3/tests/ranked-network.test.mjs \
  patches/splatoon3/tests/ranked-integration.test.mjs
```

The ranked workflow already enumerates `ranked-*.test.mjs`, so the new file is covered without workflow edits.
