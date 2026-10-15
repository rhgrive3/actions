# Audio v11 asynchronous loader ownership

Parent: audio Draft #1322 at `5530272be4d39ce0b56c67fbf21fd5b4c1c241e2`. This is a dependent correction for that branch, not an adoption of its audio assets or a replacement for its broader acceptance. Current main18ce does not contain the new loader module family.

## Reproduction and cause

The actual new engine/bank/loader modules were exercised with synthetic manifest bytes and an AudioContext/mixer fixture. When the manifest completes after `disposeWeaponAudio()` or native `weaponBank()` context replacement, the original loader still starts one asset fetch/decode and repopulates the disposed old bank with one256-byte decoded fixture. The existing engine bank/context identity checks correctly prevent late voice playback in those two scenarios. Bank resurrection and audible playback are separate findings.

`WeaponSoundBank.dispose()` clears its AuthorizedSamplePack and advances that pack's generation. However, queued RealS3SampleLoader work can begin a new pack load after this clear; and an already-started pack load originally checks generation only at final commit, allowing stale follow-on fetch/decode/hash stages.

## Narrow correction

- RealS3SampleLoader checks current bank/context ownership before queued work and after manifest fetch, manifest JSON and pack-load awaits. Disposed banks and closed contexts cannot acquire new samples or publish stale status/error/retry state.
- AuthorizedSamplePack reuses its existing generation contract at asset fetch, byte read, decode and digest boundaries, and before new per-clip work. Superseded or closed-context work does not continue to subsequent stages or commit.
- Healthy shared resident buffers, a new replacement owner, failed-load retries and existing cache semantics are preserved. The old bank is disposed by the native weaponBank replacement path.
- No engine/stopAll/voice policy, asset, synthesis setting or global cancellation policy is changed. The existing audio workflow gains only the new test filename in its current test command.

## Verification

- Focused final source-module suite32/32, independently rerun.
- Identical tests against exact parent modules:14 pass and18 substantive stale-continuation failures.
- Four existing adjacent audio test files:28/28.
- Independent extra controls: manifest/fetch/decode failures remain throttled at3999ms and retry at4000ms; late rejections after disposal do not add error/retry state or resurrect the cache.
- Coverage includes disposal, native context replacement and context close at manifest fetch/JSON, asset fetch/bytes, decode and digest; repeated disposal; queued work; current-owner completion; shared-cache replacement; successful new-owner load; retry; late worker callbacks; real-only worker suppression.

Actual engine/bank/loader and native stopAll implementations are used. AudioContext, mixer voice creation, network responses, sample bytes and digest output are synthetic fixtures. Text modules and one manifest were read from the exact Git parent; no MP3 was downloaded. No full build, emitted/runtime browser execution, audio-output/listening comparison or end-to-end latency measurement was performed.

Cancellation here prevents downstream work after the awaited operation settles. It does not abort a fetch/decode/hash already running, and does not bound the lifetime of a forever-pending Promise or all retained audio memory. Normal match-state/actor-removal paths already stop their owned loop handles; this correction does not claim a normal-rematch delayed-voice defect or change those semantics.

Runtime SHA256s: authorized-samples `5241daa2c530822f5fb76f924d17fe0b79970afa9746ed6844b93bf7f08515a8`; real-s3-loader `12f8acad64e58aeeb6b23e0360415e5e47a304def3183768dd2c81b2b15d193f`. Test `a1b4010e093251421e5973bd0307a3767eeb2dc15b8cc568d8a36d04a21db9f9`. Independent review found no high/medium issue within this bounded scope. Exact-head CI and broader audio acceptance remain centrally coordinated.
