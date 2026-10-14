# Remaining input-lifetime regressions after 18ce7b6c

## Baseline and scope

Baseline is direct main commit `18ce7b6c8b4c612f289787332b6be65862f34bea`. Its implementation already addresses cancelled Pointer Lock completion and already-open touch-layout modal input. This follow-up preserves those implementations, including one pending lock request at a time, the native editor-open flag and the requirement that all held buttons/sticks return to neutral after editing. All unrelated changes and the previous reports remain intact.

Two remaining failures were reproduced on that exact adapter composition:

1. Native menu A/accept opens the layout editor, then B/Start or shoulder/stick input from the same poll operates the underlying menu. A+B+Start resumes the paused match with the editor still open. The entry-only guard has already run before the callback.
2. A pending Pointer Lock completes after `Input.enabled=false` and is accepted. The completion admission omits the enabled-state condition, even though the rejection fallback already checks it.

## Bounded correction

- Recheck editor ownership before each menu dispatch and before stick/Start processing. Latch ownership for the rest of the poll, including an editor opened and immediately closed in a native callback. Consume modal button edges through the existing Input owner API.
- Add the missing enabled check to the existing late-lock completion guard. Do not replace its ticket identity, cancellation, error retirement or single-pending-request semantics.
- Extend the current main regression files and add two narrow source/emitted steps to the existing Validate workflow. Existing gates, including Flow, remain unchanged.

## Verification status

- Candidate source: 48/48 passed, no skips. Editor suite includes fourteen same-poll open/open-close controls, existing all-neutral recovery, disconnect and ordinary-menu controls. Pointer suite retains its existing controls and adds disabled completion followed by a fresh enabled retry.
- Candidate actual emitted suite: 48/48 passed, no skips. Existing mobile/pause: 85/85; workflow contracts: 15/15; runtime-freeze packaging: 9/9; deterministic startup budget passed.
- Exact-main source negative: all fifteen new same-poll/disabled-completion controls fail. The separate exact-main emitted negative also fails all fifteen cases, with no fixture errors/skips; baseline content `99a82bafc4b265ea325512f704794be0a347e848c5c7338fe2f4f72340f54f1a`.
- Candidate content hash `64d98cc619687854f67361a04607fee663ebab09c1024e4a869c25b9071dfdde`, input hash `ab26f19e4efe8d5fff29924702e797461393c75fedbb54eb8885b85c627833c5`.
- Independent review of runtime/test commit `3cef4275687450f733b88d6acb519f3ef43df32d` (tree `8da261cdbff0dcdc8e3fb765aa1a7ddcb1319d97`) passed with no high/medium finding. The reviewer reran source 48/48 and emitted 48/48, zero skips, and separately passed five source plus five emitted native editor lifecycle cases (open, Cancel, Save, failed Save, and Cancel→reopen). Those use genuine emitted Input/MobileInput/PlayerController, with source fixture Menus/clock/Actor/config/Three and mocked DOM/layout. All-neutral and single-pending-request contracts remained intact.
- The earlier reviewed Pointer Lock suite on the external implementation passed 29/31. One failure was the disabled-completion defect above; the other expected superseding a still-pending request and therefore differed from the external intentional serialization contract. It is not counted as another defect and that contract is preserved.

The fourteen same-poll permanent cases execute the actual composed/minified Game route with source-composed Input, Menus and pause lifecycle; their editor callback abstracts DOM creation by setting the two native ownership fields. The existing five modal cases use the controls fixture, including emitted Input in emitted mode. It does not establish hardware controller behavior or native DOM rendering. The pointer fixture controls browser event/promise timing. No full browser/CI pass or GPU performance improvement is claimed.

## Closure criteria

#1400 requires the exact final source/emitted same-poll cases, real editor open/close/save/cancel lifecycle review, neutral recovery and ordinary-menu controls to pass without resuming behind the editor. #1396 requires disabled completion to be retired, fresh eligible retry to work, and the already-established cancellation/context/startup controls to remain. Final hosted CI and central adoption are separate gates; filing or this local report does not close either issue.
