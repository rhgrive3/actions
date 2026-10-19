# Tower Control: preserve the later-arriving team's tie adjustment

## Scope and baseline

Reviewed against main `1cbe15538e6fb98a7ab18a58473caf75006bf6ad` (reconfirmed 2026-10-19 05:52 UTC). The existing Tower runtime blob is `b31f4f519e4e7a5ebb4c90fcce039a5fcb73e6b9`. This change contains one runtime condition, one regression file, and this report. It does not change the shared tie rule, rail movement, checkpoint timing, snapshots, or another mode.

## Source basis and confidence

- [S3mix: Rainmaker, count progression](https://wikiwiki.jp/splatoon3mix/ガチホコバトル#hcdd4134), accessed 2026-10-19, page reports last modification 2026-08-21 09:14:10. Its explanation says a later team tied at the existing best score receives one extra remaining count after losing the objective, and explicitly identifies this as common to other ranked modes. This is community documentation for Splatoon 3, not a Nintendo parameter table.
- [Inkipedia: Tower Control, Notes 1](https://splatoonwiki.org/wiki/Tower_Control#Notes), accessed 2026-10-19, corroborates the ownership-loss trigger for the later-arriving team. The returned current page identifies revision `730137` in its footer. Its short relevant excerpt is: “causes 1 point decrease to the losing team's travel distance when losing control of the Tower”. A direct request to the [fixed-revision URL](https://splatoonwiki.org/w/index.php?title=Tower_Control&oldid=730137) was inaccessible through the research tool; this is a current-page retrieval with a reported revision, not an independently retrieved historical revision. The article covers multiple Splatoon titles.
- [Nintendo's beginner guide](https://www.nintendo.com/en-gb/News/2024/December/Beginner-basics-for-Splatoon-3-the-ins-and-outs-of-playing-online-2645154.html) describes the broad Tower objective. It does not establish the detailed tie rule.

The implementation already encodes this tie adjustment in `RankedEngine.resolveTie`. The confirmed defect is the Tower consumer immediately undoing its own existing rule. No claim is made about retail frame-perfect or rail-distance fidelity, and no retail hardware measurement was performed.

## Reproduction and minimal correction

Use a straight path from -10 through center 0 to +10, speed 1, without checkpoints. The first team rides for 5.05 seconds and earns count 50. The later team returns through center and reaches the same count. After the tower is empty long enough to lose ownership, `resolveTie` emits exactly one adjustment to 51 for the later team. The following `_updateCounts` call previously scored both teams from the current position, still inside count bin 50, restoring the incorrect 50/50 result in the same update.

Only the controlling team may now call `engine.setCount` from `_updateCounts`. A contested tower retains its previous owner and its existing scoring behavior. Empty-but-still-owned behavior remains unchanged. Once neutral or retaken, the former owner cannot immediately re-earn a count without regaining possession. Reacquisition can earn the tied count again; a later ownership loss restores one extra count without accumulating an additional penalty.

## Validation

- Exact final new regression against clean main: **19 failed, 0 passed**, demonstrating the negative control.
- Candidate plus Tower, Wiki rules, engine, network and integration suites: **136 passed, 0 failed, 0 skipped** (23.13 seconds).
- Independent review: **31 passed**, plus six checkpoint/contest/ownership-transfer/opponent-knockout probes across both teams and dt = 1/60, 0.05, 0.2 seconds.
- Independent same-input negative control: baseline result 50/50; candidate 50/51. Both emitted one tie-adjust event with count 51 at the same simulation time.

The new 19 cases cover first/later team symmetry, three dt divisions, contested ownership, empty possession grace, neutralization, opponent takeover, repeated reacquisition, snapshot restoration, overtime winners, and the production-composed `Match.advanceRanked` / `buildFrame` consumer. The latter also delivers the host snapshot through `NetMatch`, rejects a non-host sender and checks that a follower cannot rescore it. Display/effects are inert and platform contact is a fixture input in this CPU test; it is not a browser or physical deck-contact test.

Run the targeted suite with:

```sh
node --experimental-vm-modules --test \
  patches/splatoon3/tests/ranked-tower-tie-consumer.test.mjs \
  patches/splatoon3/tests/ranked-tower.test.mjs \
  patches/splatoon3/tests/ranked-wiki-rules.test.mjs \
  patches/splatoon3/tests/ranked-engine.test.mjs \
  patches/splatoon3/tests/ranked-network.test.mjs \
  patches/splatoon3/tests/ranked-integration.test.mjs
```

The existing ranked workflow automatically includes the new `ranked-*.test.mjs` file. Exact-head CI and the existing production four-mode / two-browser room check remain publication acceptance gates; their results belong to the associated PR run, not the local results above.
