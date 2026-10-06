# Initial page-focus gamepad authority (#843)

Base platform modules: PR868 bf3072757db879e50b24f88ea2f3aaf3899d5fd9. Main f31f5da439134fe49bb89018dad5557671a49c67 also initializes focused=true; its existing Map/analog differences are not replaced by this delta. Fresh Issue843 had no comments and no linked PR match when work started.

The lifecycle now samples document.hasFocus with its document receiver. A missing method retains the explicit legacy-host true fallback; a throwing query gives false. Visibility continues to own ACTIVE/SUSPENDED separately, and no fake blur or listener/subscriber is introduced.

The input wrapper remembers installation-time unfocus and establishes its existing held-button/stick rebase once per input on first poll, including when focus arrived before any poll. The input epoch advances once to retire pre-existing buffered pad authority. Without this second connection, changing only lifecycle initialization still admits a previously held button on that first focused poll. Existing neutral thresholds and owner changes are unchanged.

Local evidence: ten targeted source tests passed using real composed Input/Player from accepted PR818 with these PR868 platform modules. They cover both old negatives, no-blur startup, 30/60/120Hz, polling/no polling before first focus, held axes/analog trigger and buttons, neutral then fresh input, focused startup, hidden state, explicit missing/throw fallback, and twenty focus cycles without listener growth. Existing #780 seven tests passed once using the same repaired platform modules. This is bounded source-VM coverage, not a full PR868 build/browser/device result. The portable test uses the repository pause-fixture when integrated.

Only platform-lifecycle.mjs, platform-input.mjs, one regression test and this report change. Current S3, quality, HUD snapshot and network owners are not edited. No numeric game tuning, remote branch, Issue closure, PR or CI is included.

API basis: https://developer.mozilla.org/en-US/docs/Web/API/Document/hasFocus and https://www.w3.org/TR/gamepad/#dom-navigator-getgamepads . Initial focus is independent of document visibility and exposed gamepad availability.
