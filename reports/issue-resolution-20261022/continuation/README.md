# 2026-10-22 continuation evidence

- **#1165: accepted closure candidate.** Real Actor refill/enemy ink, BotBrain painting, growing Roller ownership at 30/60/120/144Hz and exact 513:511 GPU/CPU/Judd result passed; independent parent rerun and two failing historical counterfactuals are preserved. [Report](motion-paint-audio.md) · [summary/hashes](roller-band-summary.json).
- **#1432: accepted closure candidate.** The same immutable build completed three match lifecycle rounds plus the 95s range case in both Chromium and WebKit. [Results](rematch-final.json) · [browser report](browser-startup.md).
- **#642: browser acceptance complete; physical GPU acceptance pending.** Both engines passed pixel/depth/context-loss checks. Physical iPad/Android memory, compatibility and owner tolerance remain unverified; no GPU memory/FPS improvement is claimed. [Report](composer-context.md) · [results](composer-context.json).
**Clock / authority work is still under independent review in the workspace and is excluded from this acceptance-only publication.**

[Raw receipt archive](completed-browser-raw.tar.gz) contains exactly 12 JSON/log files at their original repository-relative paths: both rematch engines' three raw files, #1165 final normal/independent normal/two declared counterfactual failures, and both composer/context JSON receipts. [Hash map and attempt distinctions](completed-browser-raw-hashes.json) lists every member's SHA256, archive hash and superseded attempts. Extract from a clean directory or repository root with `tar -xzf <archive-path>` to restore `.browser-evidence/…` paths.

The archive excludes images, private audio, credentials and the ongoing public-boot suite. All accepted browser receipts describe build content hash `46e01879c9e4facd3ef99bdeb095b5962098036021ff6dd1a4685f44b8a0a3c4`; they do not attest the concurrently edited whole working tree, CI, deployment, Nintendo parity or physical hardware.
