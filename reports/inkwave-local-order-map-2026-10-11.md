# Local paint order map redundancy

Independent candidate based on adopted main675731132cc419bd2026db0692f918828d60393f. No rectangle-coalescing, wall-drop or codec candidate included.

`paintOrderId` always allocates a fresh local record; its lookup map is consulted only for valid network orders. Local `local:seq` strings and entries were therefore retained until clear without ever being read. The candidate keeps the record array, ID sequence, ownership grid, comparison rules and network deduplication unchanged, while omitting only the unused local map key allocation/insertion.

## Evidence
- Three focused tests:10,000 local IDs interleaved with duplicate network orders preserve all records and sampled pairwise precedence; malformed network metadata remains fresh local, large clocks and clear work; actual composed PaintSystem retains network identity around500 local stamps.
- Existing hidden/temporal suite8/8 passes. Production build plus all11 tests passes, but two direct-import oracle tests remain source tests; the installed fixture honors the built path.
- Six independent Node processes, alternating old/new/new/old/old/new, each allocate50,000 local orders and measure after explicitGC. Old map50,000, candidate0, both records50,001. Retained JS heap old6,296,528–6,296,776bytes; candidate2,850,856–2,866,840bytes. Allocation loop16.24–23.84ms versus4.65–6.58ms. This is a synthetic component measurement, not gameplay/browser/FPS evidence.
- An earlier same-process heap-delta experiment was discarded because prior iteration objects survived into the next pre-measurement baseline. Only separate-process results above are used.

Network map and order-record memory remain proportional to accepted stamps until clear. This change does not claim bounded whole-match memory or solve arbitrary network lifetime growth. Actual browser and exact-head CI have not yet run for this candidate.

## Latest-main integration and required gates
Aligned to adopted062c4a81 weapon-model main;267report images are omitted only from the local validation checkout and will remain unchanged through the official remote base tree. Full source on the earlier675731base completed3,904pass/10skip/0fail. On062c, the selected production suite11/11 passed; only the installed-fixture tests are actual-built, the two direct-import oracle tests are source. Production hash9453855fe9bd6c601fc752fa231d558cb65db01b62926520178a728a006d27f0.

Required WebGL browser probe now exercises10,000local IDs interleaved with a network order, verifies deduplication and chronology, clears both stores, and starts a new match. Existing actual GPU mask/hidden tests remain unchanged. This probe and exact-head CI are pending. No change to1254's current validation head.

## Independent dual-browser checkpoint after combined WebKit failure

The rectangle-coalescing candidate in #1254 failed its strict WebKit pixel gate. This branch therefore resumes independent Map-only verification on adopted main aca88a4899e1f497f9aa3d6514ae3934979eed75. No rectangle-coalescing runtime or oracle is included. Chromium and WebKit both run the exact source/built paint fixture, including network deduplication, 10,000 local IDs, clear and new-match behavior. Production contentHash: 023db270c59d12d3adcd1980b36fbb63ed774e0a9391d1ab6c5772c7ba833e1a. Local order and temporal actual-built tests: 10/10. Final exact-head browser/CI evidence remains pending; the earlier c2ec92c9 results are retained as historical evidence only.
