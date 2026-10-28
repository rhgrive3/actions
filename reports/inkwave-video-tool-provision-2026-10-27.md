# Bounded capability-first video-tool provisioning

Baseline: `da8ad7a9f3052102a7dc8300f0c4b17a2e7a32dd`. This candidate changes only the two observed provisioning paths and their helper/contracts. It is not a rendering, gameplay, model, or native-acceptance change.

## Actual failure and confidence

- Ink-micro [run 40517375758 / job 122234444535](https://github.com/rhgrive3/actions/actions/runs/40517375758/job/122234444535) began at 14:32:15 UTC. Native capture passed at 14:44:26; `--frames-only` then passed all eight 24-frame, 960×360, 30 fps sequences. Unconditional APT requested 87 new packages / 62.8 MB, repeatedly using `http://azure.archive.ubuntu.com/ubuntu`, and was still fetching at 15:02:17. Cancellation was logged at 15:02:31; encode/full-clip steps did not run.
- This timing is consistent with the existing 30-minute job limit, which [GitHub documents as an automatic cancellation limit](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes). The log does not identify a cancellation actor, so no superseder, manual actor, or definitive timeout annotation is invented. The PR-specific concurrency group is unchanged.
- Raw-log SHA-256: `54c1760e777f70ff289a94476ba2ea1cff09f00be38d99332322fbf0d55392d9`. Partial artifact `12744452556`, ZIP SHA-256 `509661cca7d67d0e983710cfceb0600f91271fd6ef89b1b4510217e33f53e5f5`, contains 214 files and no completed video verdict.
- The same unconditional FFmpeg install is also present before native-pair capture in Explosher run `40517375707` / job `122234444153`. At investigation time it was still provisioning, not a demonstrated rendering/capture failure. The existing 45-minute limit is retained.

## Runner provenance, not an assumption about installed binaries

The log identifies **Ubuntu 24.04.5, image `20261025.353.1`**. `20261021.618` is the Hosted Compute Agent version, not the image version. The exact [included-software manifest](https://github.com/actions/runner-images/blob/ubuntu24/20261025.353/images/ubuntu/Ubuntu2404-Readme.md) and [image release](https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20261025.353) returned 404 through official GitHub reads and web inspection. Therefore no preinstalled CI FFmpeg version or capability is asserted. Each job probes its actual PATH binaries.

## Candidate behavior and security boundary

`scripts/prepare-inkwave-ci-video-tools.mjs` first checks executable version output and listed `libx264`, `yuv420p`, `drawtext`, and the existing Explosher font requirement. It then **really decodes** an authored synthetic 800×450 PNG to the exact RGBA hash and **really encodes/probes** a synthetic 24-frame 960×360, 30 fps, 0.8-second labeled H.264/yuv420p clip. Runtime behavior, not a version-only allowlist or runner-image promise, decides compatibility.

Supported existing tools are reused with no APT invocation. Otherwise, only on an Ubuntu host, the helper calls the existing `prepare-inkwave-ci-apt.py` and ordinary signed APT. Preparation/update/install are bounded to 20/120/180 seconds with a ten-second termination grace, per-request network timeouts, one retry and a bounded lock wait. `sudo -n timeout …` places the timer inside the already-required privileged operation, so it can signal the installer's process group without relying on sudo-monitor forwarding; a longer host bound is retained. APT installs only `ffmpeg` and `fonts-dejavu-core` plus their normal dependencies. The existing helper changes the stalled Azure Ubuntu URL to the official HTTPS Ubuntu archive while retaining suites, components, `Signed-By` keys and normal signature/TLS verification. No new keys/repos, insecure trust flags, third-party action/static binary, credentials or network-policy change is introduced. A second complete capability probe is mandatory after installation; failure remains failure. `--probe-only` can never install.

The two job budgets, all native captures, original frame and full-clip verifiers, ink-micro's exact eight encode commands, strict historical common-build/resource assertions, existing intentionally disabled long Explosher stages, and always-retained artifacts are unchanged. Provision receipts explicitly do not constitute native acceptance.

## Verification and remaining proof

- Mocked provisioning tests cover absent/broken binaries, missing encoder/filter/pixel format/font, corrupt PNG decoding, runtime encode/timeout/metadata failures, each bounded-fallback failure and a failed post-install probe. Source negative controls reject removed frame/full-clip checks, altered encoding, skipped required provisioning/capture checks, changed source pins or larger job budgets.
- Existing local `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` **7.1.5-0+deb13u1** passed the real capability probe, reusing existing tools; no local dependency install occurred.
- The SHA-verified partial CI artifact was copied locally. With those existing tools, the **unchanged original eight encode commands** and **unchanged full-clip verifier** passed all eight clips, 24 frames each at 30 fps, 0.8 seconds, 960×360, bound to original source `da8ad7a9`. This is offline recovery evidence, not a new CI pass.
- Signed-APT behavior is covered with a temporary sources fixture retaining the original keys/suites; no real local APT update/install was performed. Actual fallback networking and final automatic hosted-CI completion remain unverified. No manual dispatch, remote publication, merge, security change or artifact/media upload was performed.

Local evidence: `/workspace/shared/inkwave-native/ci-diagnosis-40517375758/` (original log/ZIP, capability receipt, offline encode logs/manifests and focused test receipts).
