# Squid-to-human visual return

## Evidence and scope

User requested a smoother curved return, without simply slowing controls. Actual ad809 source composition used the minimum of a 3-frame Sqd_ToHuman and 30-frame ToHuman clip: a 50 ms full silhouette exchange. At 60 Hz the human scale was 0, .259, .741, 1. It already used cubic smoothstep. In addition, the squid's first authored return frame collapsed its surface, and the presentation pivot immediately left the previous swim orientation.

Nintendo's public https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/ikahito_pc.mp4 around 4.63–4.83 s shows a compact rise through ink into the human silhouette. The visually readable phase is approximately 130–200 ms; spray and camera movement prevent extracting exact input-aligned timings. The 150 ms value is an INKWAVE visual calibration, not claimed Nintendo frame data.

## Bounded correction

The return envelope is 150 ms with quintic smoothstep (zero velocity and acceleration at its endpoints). Source clips retain authored playback rates. The three squid frames play normally, then hold frame 2 while its outgoing rendered pose blends from the previously displayed squid pose. The previous presentation pivot is blended over the same envelope; this removes the initial upright snap. The human's existing 30-frame clip and grounded/stationary admission, including the corrected airborne anti-bowing rule, are unchanged. Ordinary diving remains unchanged; interrupted return reversals start at the displayed pose and pivot.

Native fallback uses the same scalar envelope while retaining its existing squash/lift and reversal owner. Actor form, input/control, firing admission, aim, movement, collision and jump clocks are not edited. Two pivot scratch objects are allocated once per source controller; the existing reusable squid pose buffer handles the short transition. No new geometry, materials or textures.

## Validation

- Actual source-loaded Actor and fallback, 30/60/120 Hz: matching quintic scalar, complementary silhouettes, authored squid frames then terminal hold, zero-time reverse/double-reverse continuity.
- Actual world-space squid vertices remain continuous on the first return frame and rapid reversals.
- Maximum sampled human scale increments: .3934/.2066/.1033 at 30/60/120 Hz (old source at 30 Hz: .7407).
- Existing source ToHuman/airborne posture and admission tests pass; existing emergence jump/collision tests pass.
- Source and emitted execution are both supported by the new fixture; final native before/after sampled video is required for visual acceptance.

Changes are confined to the new build-only presentation adapter, its existing binding-adapter registration, the build-only registry entry, and the focused regression. Prior binding and short-support code is unchanged.
