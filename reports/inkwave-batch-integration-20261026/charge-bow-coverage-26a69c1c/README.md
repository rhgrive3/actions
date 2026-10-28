# Charger / Stringer coverage read on fixed 26a69c1c

Target: `26a69c1c8795e5177808028fd818c7f0a5036de8`. This is a bounded
read-only source/test/receipt inventory, not another gameplay session, test
matrix run or original-game comparison. It found a concrete catalogue Charger
keep-audio restoration defect. The separate branch
`fix/catalog-charger-kept-audio-20261026` contains the narrow fix and regression
evidence; the fixed26a target remains preserved.

## Charger routes and distinctions

There are **8 catalogue base identities + 10 alternate kits = 18 registered
Charger kits**, plus the separate `charger_scope` compatibility ID. Source
registration retains base gameplay fields/record identity for alternate kits;
their sub/special and registered IDs remain distinct. Audio normalizes only
main-sound identity. All 18 and the compatibility scope resolve to the shared
recorded rising phrase. `inventory.json` preserves every exact ID and mapping.

| Base ID | Full charge, frames | Alternate IDs | Important distinction retained |
| --- | --- | --- | --- |
| `charger` | 60 | `charger-01`, `charger-02` | Native Splat finite-flight/paint owner |
| `s3-charger-quick` | 45 | `s3-charger-quick-01` | Squiffer charge/air-rate/keep parameters |
| `s3-charger-normalscope` | 60 | `-01`, `-02` | Catalogue scope; no charge keep |
| `s3-charger-long` | 92 | `-01` | E-liter range/time/ink and keep |
| `s3-charger-longscope` | 92 | `-01` | E-liter scope; no charge keep |
| `s3-charger-light` | 20 | `-01` | Bamboo min/full/ink/range and no keep |
| `s3-charger-keeper` | 71 | `-01` | Goo Tuber partial keep and its longer keep lifetime |
| `s3-charger-pencil` | 72 | `-01` | Five-round full-charge reservoir; no keep |

Suffix-only alternate cells use the full base ID plus that suffix. The optional
legacy `charger_scope` stays on the native Charger path with its original kit,
28° optics and paint owner; its audio aliases `s3-charger-normalscope`.
`legacy-scoped-charger-admission.test.mjs` defines finite partial/full release
and keep/optics checks, but that file is not counted as executed evidence in
this batch's listed receipts.

Native Splat/legacy scope/native kit copies use `fireCharger` in
`weapons-charger-flight.mjs`. The seven added bases and their catalogue kit
copies use `main-weapon-catalog.mjs` charge → emit → flight → `chargerLinePaint`.
Both routes call `queueChargerPaintDrop`. High stripe samples hold a visible
native falling lease and claim turf on landing. The native low-height ≤3.5
policy and direct contact painting remain. The shared 20-unit gravity and
preselected target are INKWAVE's retained model, not Nintendo timing proof.

## Existing direct evidence versus shared-path inference

| Area | Direct recorded evidence | Remaining limits |
| --- | --- | --- |
| Charge routing / remote edges | `catalog-charger-remote-audio` iterates all18 IDs at30/60/120Hz through decoded network state, checking one onset, release/cancel/inaudibility cleanup and retained kit IDs; source and emitted receipt includes it | Audio engine handles are observed/mocked in these tests; not18 physical playback or real multiplayer browser captures |
| Real charge playback/readiness | Actual AudioContext/MP3/Worker PCM for all8 bases, one source at1×, five derived clocks, plus missing-shared-asset START rejection | No per-alternate PCM replay; the legacy scope alias is not one of the eight playback rows. Physical speaker/iPad/Switch sound identity remains unmeasured |
| Local owner edges | `reported-audio-fidelity` exercises all8 bases; older E-liter/Goo keep-audio tests inject native `s3Stored` and do not exercise their actual catalogue keep owner | The bounded read found real `catalogState.stored` restoration repeats fresh rise/ready. New actual-Actor regressions cover the6 eligible catalogue kits and Goo partials; they observe dispatch, not playback. Not every kit was separately held/released in a native browser |
| High falling stripe lifecycle | `catalog-charge-flight-stages` directly exercises all7 added bases at30/60/120Hz, visible draw-buffer positions, delayed CPU paint, final turf and retirement. Native Splat selected high/footprint source cases also passed | The elevated fixture sets the actor grounded; it proves airborne ink, not every jumping-Actor route. It covers the first Pencil shot, not a complete five-shot audiovisual cycle. The10 alternate flight cases and legacy scope use shared-path evidence, not a dedicated high-shot matrix |
| Stripe/impact/cover ownership | Added-base min/full stripe tests, cover clipping and ghost no-double-claim cases; source keep/air-rate/empty-ink tests exist | Source tests/draw buffers are not presented pixels. Ghost no-claim is authority evidence, not proof of all remote droplet visuals |
| Ordinary shipping input | Fixed90bb native touch: E-liter full charge, one real1× phrase and charge-only PCM, real head/deducted ink; initial Bamboo mouse receipt has three charge samples | E-liter short head/falling drops missed presented snapshots. No ordinary high-shot falling-drop capture. Other bases/alternates/scopes were not newly played; no forced time/state used to fill that gap |

The batch's initial132 source and20 emitted counts are historical receipts,
not newly rerun or summed into this coverage read. Source tests present elsewhere
in the repository are identified as definitions, not silently counted as executed
batch evidence. Subsequent charge/flight/stage checks on the merged upstream are
retained in the existing integration receipts at their actual heads.

## Bow two-stage coverage

| Base | First/full frames | Arrows | Alternate kits |
| --- | --- | --- | --- |
| `s3-stringer-normal` | 30/72 | 3; explosive from first stage | `-01`, `-02` |
| `s3-stringer-short` | 12/34 | 3; no explosive bolts, LACT keep | `-01`, `-02` |
| `s3-stringer-explosion` | 40/80 | 5; explosive from first stage | `-01` |

All **8 Bow kits** are directly iterated by the source/emitted charge-stage
test for boundaries, one cue per boundary, hold and release/reset. The pure HUD
test also iterates all8 and preserves native circle/track styling and geometry.
`stringer-source-1130` tests all8 Min/Mid/Full shot count, speed, damage, ink and
recovery, plus jump admission; retained bow physics was not newly introduced by
this batch. LACT keep/funding tests include the actual Deco kit. Test definitions
also cover the three base airborne charge-rate differences.

Real emitted HUD component coverage is15 inputs across the3 bases, not all
alternate DOM instances. Fixed90bb native-touch Tri directly showed runner
0→1→2, first/second/full DOM progression, both boundary cue calls and a real
three-arrow release. There was exactly one cue at each boundary and none after
release. The native render observer precedes HUD update; canvas-only mid-stage
PNGs omit the DOM HUD. These are not frame-exact pixel/layout comparisons.
The native touch run does not cover LACT/Wellstring, their alternate loadouts,
LACT stored-charge emergence feedback, jump/vertical presentation, or switching
away while charged. No speculative change is made to those semantics.

The existing annulus fills twice without extra rings or persistent first-stage
color. Original Tri review supports only that narrow structural/color limit;
exact complete-cycle phase/pixels/timing remain unmeasured. Stage dings are
explicit INKWAVE-authored feedback, not retained original Stringer recordings.

## Evidence reuse and unresolved gates

Read-only hash comparison found **433 selected emitted audio/asset, stage/HUD,
catalogue-data and alternate-registry artifacts unchanged** from both the
eight-kind PCM/component build and fixed90bb native-input build to26a69c1c.
This supports reuse of those module/asset results; other gameplay/renderer
changes are not hidden by the selection, and native input stays attributed to90bb.

The principal direct-coverage gaps are alternate/native scope playback and
ordinary input, Pencil's complete five-shot A/V cycle, rendered short/high ink
flight, LACT/Wellstring native stage/keep presentation and original/hardware
agreement. The concrete keep-audio routing defect is separate from those visual
gaps: actual held Fire → Squid → kid input consumes `catalogState.stored`, while
the old audio handler recognizes only native `s3Stored`. On26a, E-liter/Goo
replay a rise and full-ready cue at restoration. The narrow followup recognizes
the consumed catalogue store, uses the existing keep cue once and preserves a
partial Goo keep's later full-ready boundary. No new test/browser framework,
long matrix or browser session, PR retry, merge or manual CI is performed. Hissen/ground-drop visual
work remains separately owned and unfinished; accepted Hissen size changes
remain0. Remote final-head CI is not claimed green.

## Narrow keep-audio followup

Code commit: `3b7be8b8c205d34f26bb29db712f9edbf8fea879` on the separate branch
`fix/catalog-charger-kept-audio-20261026`. One production file changes; the
already emitted-registered charge/flight test receives the actual-store cases.
Both new tests fail on26a source and its existing emitted build. After the fix,
source11/11 and fresh minified emitted11/11 pass. The existing audio-handler and
native retained-redive selection passes2/2 in each mode. All6 eligible catalogue
Charger kits undergo2 actual-Actor keep/restore cycles; Goo base/Deco also cover
partial→full and expired-store→fresh-charge behavior. No direct form, charge,
time or saved-charge assignment supplies these outcomes. The fixture's normal
display/physics simplifications remain; this is controlled audio dispatch.

Fresh build contentHash:
`69291e5f1c92f807fed830b126ee0ec3b90be3539b5876537fa25db095cd3fb6`.
All1490 input hashes and2194 artifact hashes match, startup budget passes,
and390 packaged audio files are unchanged from26a. No additional browser session
or PCM matrix was run. The restore cue occurs at the actual catalogue consume
edge; exact retail emergence/keep sound timing is still unverified.
[Validation, negative controls and limits](kept-audio-followup/validation.json)
and [before-fix actual Actor trace](kept-audio-followup/before-actor-dispatch.json)
preserve the distinction. This records the separate candidate handoff. The
parent's subsequent independent event-dispatch acceptance and integration are
recorded in [the integration receipt](../kept-charge-audio-append/validation.json).

The later fixed-f8 [Pencil release-only acceptance](../pencil-release-only/README.md)
adds all5-shot event/drawn-flight, depletion, cooldown/release and payment checks
for both kits. It does not establish actual five-shot sound playback or native
pixels. The earlier mixed candidate's squid-round discard hunk is excluded and
preserved on its separate branch; post-first-shot squid/ink-settlement semantics
remain unverified. No historical native-input receipt is relabelled as this run.
