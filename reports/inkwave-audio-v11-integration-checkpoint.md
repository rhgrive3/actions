# INKWAVE v11 audio integration checkpoint

Branch: `integrate/inkwave-audio-v11-real-assets-20261012`

- Local v11 source ZIP and code-only deliverables are available in the user's Drive folder.
- GitHub Actions run 38255815994 failed with HTTP 403 while downloading an expiring transfer URL.
- Do not claim this branch or main has the new audio engine until the source migration and regression checks pass.
- Importer should use a durable authenticated artifact, not short-lived URLs.
- Preserve newer main changes and the game's previous audio path until the new path can actually load its assets.
- Verify music/weapon events, bundle integrity, service-worker budgets and production build before merging.
- Source ZIP currently labels the included 2022 audio as extracted game material. Redistributable rights need confirmation.
