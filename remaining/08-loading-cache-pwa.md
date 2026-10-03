# Remaining: Loading / Cache / PWA Startup

Status: not included in this PR.

Problem:
- startup feels heavy every time and warm starts are not sufficiently faster.

Separate:
- cold first load
- warm HTTP-cache reload
- installed/SW-warm start
- first start after a new deployment

Measure critical path:
HTML -> modules -> Three.js -> assets -> initialization -> menu interactive -> first battle ready.

Investigate:
- over-eager modulepreload
- parse/compile cost
- stage/weapon assets loaded too early
- Service Worker/cache/revision interactions
- texture/audio/shader initialization

Acceptance:
- cold/warm request/byte/timing benchmarks
- coherent version updates
- offline/PWA regression
- no battle-start stutter simply moved later
