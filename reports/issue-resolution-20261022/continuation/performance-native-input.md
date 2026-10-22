# #1434 exact upload-source and GPU target diagnosis

The unchanged RNG/native-build control completed two contexts. Final RGBA matched exactly in this run (`9fa1b417…`), the same first-image hash observed in two earlier independent browser launches. This remains a two-context observation and does not replace the four-trial calibration.

The new collector recorded 3,031 exact buffer receipts, 48 textures, 488 mesh states, 175 material states, 172 shader-source SHA-256 receipts and 15 GPU color targets per context. Geometry/index/instance/bone source bytes, decoded texture bytes, sampler settings, all material states, light/shadow-camera inputs and camera state matched. Current draw-list mesh states matched. Only cached modelView/normal matrices of eight unrendered InkVolume meshes differed. No rounding or signed-zero/nonfinite loss is introduced by this collector.

Both HDR composer color-target hashes differed despite equal final 8-bit pixels. All 13 other sampled targets, including PMREM, cloud and Bloom, matched exactly. Depth/shadow contents remain unobserved. GTAO is absent from this MEDIUM composer, so GTAO procedural noise is rejected as a cause in this condition.

The actual GL preflight passed BYTE/HALF/FLOAT/R11G11B10 targets plus six cube faces (five targets, ten faces), including read binding/pack-alignment restoration. Five source regression tests passed. Initial preflight attempts used unavailable/wrong test constants; the corrected probe and full game produced no read errors.

A four-trial native self-control that launches and fully closes a browser process for each trial is prepared as the next resource-isolation experiment. It preserves production modules, enabled PWA/audio, camera/input, warmup, workload and the exact pixel gate. It can establish fixture repeatability, not a performance improvement.

See [performance-native-input.json](performance-native-input.json) for input/target comparisons and SHA-256 evidence receipts. Splatoon 3 reference remains 11.3.0; no retail/hardware timing value is inferred.
