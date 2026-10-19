# Native camera envelope

The first native turn sequence cropped the submerged body; a fixed-distance follow-up correctly failed the newly added visible-vertex coverage assertion. CPU posed-vertex sweeps were then used to derive the frame rather than enlarging the camera blindly.

Source baseline: da97926a21e0e7c6170d76864f896123d979f915. Runtime candidate: 8d597503e95ef086ca9d6f0b92a41f84092b2773 (later camera-only commits preserve runtime). Actual composed Actor/source bank, local player, source and fallback, 564 driven frames per version including human settling, dry, swim, stop, turns and emergence. Every visible mesh vertex is transformed through actual skinning and world matrices. Shader-only fallback wiggle is not present in CPU positions; a 0.1 m reserve covers it and the native frame assertion remains required.

Baseline axis-aligned root-relative bounds: x[-0.438931,0.432403], y[-0.418018,1.444847], z[-0.556119,0.648149] m. Candidate bounds: x[-0.444205,0.432403], y[-0.403822,1.444847], z[-0.556119,0.648149] m. Maximum distance from root+[0,0.5,0]: baseline0.991294 m, candidate0.945036 m.

Both versions use the same center y0.5, conservative radius1.1 m and distance `1.1/sin(25deg/2)*1.1` at a 25-degree perspective FOV. The final factor adds10% framing reserve. Camera vectors are normalized before applying this shared distance. No animation, geometry, lighting or tone mapping changes accompany this adjustment. Native receipts record each visible vertex count and maximum absolute projected x/y, failing at0.98.

CPU full-state projection baseline worst max|NDC|0.804726, 19.53% margin; candidate worst max|NDC|0.773358, 22.66% margin. CPU coverage validates framing only, not lighting or smooth-motion appearance.
