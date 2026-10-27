# Ranked browser CI charge proof repair

Failure: workflow 40362215329/job121710371513 on optimization SHA70cc3b1, checker468, charge0.733333333333334 expected1. This is the first shot from an expired remote held-input lease, rather than proof that the host's later full-charge state belonged to that shot.

Authority: ranked/install.mjs advanceRanked advances the Rainmaker rule only when !follower. The host is the charge and shot owner; guest rule charge is only restored from host snapshots. buildFrame uses rankedInputFor-branded accepted inputs and treats received commands as absent at host G.time−received.at>=.75. Unchanged RainmakerRule releases a partial shot on the resulting false input, then may charge a later hold after recovery. The old checker waited for host charge1 without asserting no earlier shot, then accepted length1 and read that earlier partial event.

Exact unchanged-rule stalled-clock negative control produces charge0.733333333333334, partial damage39.000000000000014, blast0. All ranked product runtime and checker files were unchanged by optimization d88aa68→70cc3b1 (`git diff --name-only d88aa68 70cc3b1 -- patches/splatoon3/runtime/ranked scripts/check-inkwave-ranked-browser.mjs` is empty). No input lease, rule, networking, damage or gameplay source is changed by this repair.

Checker-only fix:
- scripts/lib/ranked-rainmaker-charge.mjs exports releaseFullRankedRainmaker(host, guest, actorId, saveReceipt).
- Capture original game/match/session/actor/owner/life/matchId, frozen state, skipRender and mouse object/value. Freeze both simulations before any hold; network callbacks remain active.
- Guest mouse input goes through native Player→Actor sampling, then a later ordinary20Hz NetMatch tick. Each bounded batch has at most5 fixed1/60 frames.
- Before each host batch, wait for actual rankedInputFor-branded accepted host command with new monotonic sequence, exact fire state, same actor/match/session/owner/life, and0<=host input age<.75; revalidate that receipt immediately before advancing host. Clock ownership must still be frozen.
- Host charge remains authoritative. Any earlier shot fails; no events are cleared/filtered and no charge/packets/lease are forged or reset. Explicit guest release follows the same native input/tick/host admission path.
- Existing checker exact single-shot charge1, direct60/blast180, authoritative-versus-visual replication, two native wall hits/damages, and terminal assertions are retained verbatim.
- Both realms restore owned original mouse and game state in finally, including partial-install failure. Installation waits allSettled to avoid late probe leaks; cleanup failure cannot replace the primary failure. Current failure snapshots are saved before cleanup.
- Optional RANKED_MODE supports a single explicit validation mode; absent it, existing all-four-mode default remains. Unknown mode fails.
- Ranked workflow explicitly tracks helper path in push/PR filters; new ranked-charge-browser-clock.test.mjs is included by existing ranked-*.test.mjs suite glob.

Focused verification: `node --experimental-vm-modules --test patches/splatoon3/tests/ranked-charge-browser-clock.test.mjs` final7/7 pass, log /workspace/scratch/ranked-charge-clock-final.log. The positive uses two real source-loaded Character realms with production-composed Input, Player, Actor, fixed clock,20Hz NetMatch, Transport JSON, native admission, rule and event replication; controlled socket delivery provides delayed receipt turns without advancing the frozen host clock. No browser/GPU claim for the CPU fixture. Additional cases cover missing new seq, wrong fire, stale age, unbranded command, changed owner/life/match/session, unfreeze, replaced mouse owner, preserved earlier partial event, partial installation and secondary cleanup failure. Full1/60/180 and replicated shot remain exact. Syntax and scoped whitespace checks pass.

Only four owned source/config/test paths changed: scripts/check-inkwave-ranked-browser.mjs; scripts/lib/ranked-rainmaker-charge.mjs(new); patches/splatoon3/tests/ranked-charge-browser-clock.test.mjs(new); .github/workflows/validate-inkwave-ranked.yml(two explicit helper path filters). Root owns the one real online Rainmaker subset against existing unchanged _site, final review/integration/CI/commit. No build, full suite, browser run, staging or remote mutation performed by services agent.

Frozen after final7/7 verification; no remaining services edit planned absent concrete review/browser finding.
