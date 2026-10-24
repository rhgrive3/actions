# Continuous guide-frame inspection and Screen candidate

This follow-on supersedes the earlier report's missing-retail-footage condition. Matching current INKWAVE rendered frames are STILL unavailable. Findings compare inspected decoded guide pixels with actual/composed source, not two rendered builds.

## Provenance and method
Source page for all clips: https://gamewith.jp/splatoon3/362075 . These are published gameplay demonstrations, not Nintendo-authored technical timing specifications. Game version, capture date, weapon/gear parameters, native simulation rate, and any prior transcoding/interpolation are unverified. Encoded FPS does NOT establish native simulation FPS.

The central manifest records verified exposed MP4 URLs, byte hashes and ffprobe results. Lane-reviewed copy with exact inspected intervals and reverified SHA256: /workspace/shared/special-reference-media-20261023/area-review/inspected-frame-provenance.json . All four hashes match. Files were reused, not redownloaded. No reference video or image is included in repository patches.

Zero-based decoded frame indices; PTS = n /30 for Wail/Storm/Tenta and n*1001/30000 for Screen. Full decoded framemd5 found0 adjacent bit-identical full frames in all four clips. This does not exclude repeated underlying game states, near-duplicates, optical interpolation or reencoding artifacts.

Overview pixels at every15th frame establish sequence/context. Additional consecutive windows below establish actual adjacent-frame observations. ffmpeg scene>0.35 detects Wail frames57 and76 only; inspecting55–60 and74–79 confirms large firing flashes rather than scene cuts. No obvious cuts in reviewed windows; lower-contrast or uninspected edits cannot be excluded. Camera is broadly stationary behind the player in the training room; player/target motion and projection still prevent direct world-size inference.

## Killer Wail5.1
MP4: https://img.gamewith.jp/common_movies/8094f9deb26666b57cb1d1ea2a083d01.mp4
30/1fps,223frames,7.433333s,1280x720. Inspected154–207 consecutively, plus55–60 and74–79.

-57(1.900s) and76(2.533s): pair firing has bright circular mouth rings and broad light flash; scene remains continuous.
-157→158(5.233→5.267s): upper speaker pair becomes a bright cyan luminous burst.
-175→176(5.833→5.867s): middle pair does likewise.
-193→194(6.433→6.467s): final low pair begins the same burst.
-Bursts resolve into numerous small round light flecks. The preceding beam disappearance and subsequent speaker burst are distinct landmarks, not one instant.

Source: special-presentation.mjs hides/disposes speakers via pair.until/mark freshness and syncTailSpeakers; special-vfx.mjs updateWailLasers kills beam pool records on timeout, DIRECTORS.killerWail.end only kills mouth discs. No corresponding speaker-retirement burst found. This is a clear follow-on presentation gap, but no new implementation here: using beam timeout as the trigger would conflate the visibly distinct landmarks, and network-gap/replay retirement needs a verified lifecycle contract. Cadence candidate remains separate and unchanged.

## Tenta Missiles
MP4: https://img.gamewith.jp/common_movies/26971024eb5110ab90bbac55795dd2f3.mp4
30/1fps,306frames,10.2s,1280x720. Inspected105–140 consecutively.

-Lock circle remains at108(3.600s), is absent at109(3.633s).
-Launcher preparation occupies following frames; first obvious large firing flash at119(3.967s), then alternating sustained launch bursts/exhaust through140(4.667s).
-Overview shows ascent, subsequent descent/ground impacts, and launcher retirement.

Source has local-only lock HUD hidden when launching, launcher tipping/per-missile kick in animateDevice, event launch smoke, projectile flash/glow/smoke/exhaust and impact bursts. These families exist; without candidate pixels no missing-family or amplitude mismatch is asserted. Existing refresh-independent exhaust candidate is not relabeled retail-calibrated.

## Ink Storm
MP4: https://img.gamewith.jp/common_movies/451e2c527edcc6149c03413dbdb70fb4.mp4
30/1fps,351frames,11.7s,1280x720. Inspected140–205 consecutively.

-Vertical trail/formation visible140–152; broad luminous cloud formation enters the top of the picture153(5.100s), much of the cloud is above frame.
-Persistent thin cyan area-boundary outline becomes visible on wall/floor173–183(5.767–6.100s), then travels with the raining area. Cannot infer cloud silhouette from off-screen pixels.

Composed src/game/weapons.js was inspected, plus createStormCloud replacement, KIT_FX.cloud, FX.rain/rainSheet/stormStart and fxHooks._updateClouds. They supply cloud puffs, rain, puddle ripples and a short camera-facing start ring, not the persistent terrain-following boundary seen here. Proposed later improvement: a presentation-only boundary tied to authoritative cloud footprint, with terrain projection/occlusion checked. Not implemented as a flat disc would not reproduce the observed wall/floor outline and could misstate gameplay coverage.

## Splattercolor Screen: bounded new candidate
MP4: https://img.gamewith.jp/common_movies/aa4671453cb19dc0c4382e0abdce3b80.mp4
30000/1001fps,382frames,12.746067s,1024x576. Inspected15–50 and330–365 consecutively.

-20(0.667s): landing splash;26–29(0.868–0.968s): sheet grows upward rapidly and unfurls across its width. These are clip landmarks, not replacement gameplay/startup constants.
-330–365(11.011–12.179s): remaining upright sheet gets increasingly transparent and disappears without collapsing to a thin strip at the floor. Perspective size changes earlier in the clip reflect forward travel and are not treated as shrink animation.

Current poseObject(screen) explicitly shrinks sheet height/width via(1-fold²) during close and maintains near-constant opacity. Candidate instead holds the unfurled silhouette and applies that same existing close factor to body/white-rim opacity. It preserves existing close/start intervals, gameplay lifecycle, position and collision. It does not reproduce per-pixel dissolution or claim exact alpha-curve matching.

IMPORTANT: material.opacity already forwards to shader uOpacity via an existing setter. There is no setter bug. Screen body and white-edge materials are freshly created per buildScreenSheet; no shared material primitive or factory is changed. Opacity restoration is tested after reuse. Hidden state at terminal is tested; resource disposal code is unchanged and not browser-validated.

Patch: ../screen-close-presentation.patch (SHA256 a39eafc467e3662093d71175ea69b5407485dc316604f6c897a14f7293db5800). Only poseObject screen branch in special-presentation.mjs changes. Test file patches/splatoon3/tests/screen-close-presentation.test.mjs:7/7 passes, source and esbuild-minified extracted actual poseObject branch, flight/startup/active/close/terminal-hidden/reuse, plus frozen-source negative control. Does not test renderer or full built site. adaptBuildSource returns candidate runtime byte-identical. Existing cadence patch kept separately.

Independent reviewer receives the exact frozen patch and hashes. Parent owns integration/publication/final rendered acceptance.
