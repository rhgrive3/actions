# Invisible weapon channel draw suppression

Baseline: ac1159b76b42a10ff02fe58add74a8285cc08d32. Pure optimized build contentHash: 43ddefa5e29081aba0eed716ac9e8240e9f5fee46178ea6685dba6faf265fdcd.

Only `hiddenPart` placeholders receive an explicit `hidden` flag; their child Mesh is invisible. Their animation Group, material, callbacks, part channel, pivot, muzzle, shared geometry, disposal and cache lifetime remain unchanged. These are authored coincident-position triangles, not transparent surfaces. The real geometry buffers, topology, normals, colors, UVs, material parameters, far merge and decimation are unchanged. This is not PR1298 geometry compaction. No held model proposal is adopted.

Current-main audit identifies 159 zero-area native placeholder channels across 59 of 65 weapons. Existing all-65 geometry, grip and real Actor/Runner attack tests pass 3/3. A separate paired source regression checks every buffer and all placeholder groups at 30/60/120 Hz, near/far switching, both hands, recoloring, warm visibility restoration and disposal. Node cannot load optional dynamic source-motion banks; the browser must verify the real loaded source motion separately.

The dedicated exact-head Actions job builds pure main and candidate, runs an eight-Actor A/B/B/A comparison of full native postprocessing and held-weapons-only views at game/far LOD. It records raw, nonzero and zero-count GL calls; triangles; visible buffer counts/bytes; retained geometry byte hashes; normal/depth overrides and restored beauty; and completed-default-framebuffer readback wall time. Native shadows are enabled with a receiving ground plane. Both A/A and B/B images must be exactly repeatable, as must cross-version images. Full Character tank drift is a known possible failure; no tolerance is allowed and a failed candidate remains unaccepted. Timing is controlled SwiftShader workload, not populated live-match or iPad FPS.

Browser evidence is pending. Do not merge or adopt based on source counts alone. Reference behavior is the existing procedural INKWAVE model/animation at the pinned main; Nintendo Splatoon 3 Ver.11.3.0 retail silhouette/animation/device parity is not newly asserted.
