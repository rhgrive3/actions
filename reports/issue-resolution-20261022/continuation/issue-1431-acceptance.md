# #1431: implemented fixes and remaining calibration

This is a **partial implementation; keep #1431 open**. Explosher's authored muzzle is corrected and Quad's actual native-volume connection is implemented. Native first-phase prediction and the authentic Quad aperture are separately retained, rather than calling every birth gap resolved.

The application is fixed at local source `931e4c4af71ecc48f6648828aee2dff16a30f5f3` (public source tree equivalent `8783eb8`), with immutable build content `d3d77b98076f1f1ca251c9c6968e1339bc648de1239720883e71204ec39bd718`. Harness-only QA revisions do not occur in the application input manifest. All1362 source inputs and2016 emitted artifacts match their manifest hashes.

| Requested comparison | Evidence and conclusion |
| --- | --- |
| Actual first/steady,30/60/120Hz, upward/downward aim and OBB | Actual source-loaded Actor/Runner/Projectiles/FX/WebGL covers Quad18 and Explosher18 conditions. First and fully aim-ready steady are separate; first-right prediction images are also retained. Simulation executes every fixed tick; actual draws are sparse initial/first/steady/final diagnostics. |
| Native aimReady/full-aim/LOS fallback | Upstream `src/game/weapons.js:720` predicts while `aimReady<0.98`; `catalog-pose-birth.mjs` explicitly excludes predicted and obstructed origins. The diagnostic steady threshold uses this existing branch, without changing gameplay or forcing a connection on fallback. |
| Physical birth/velocity/contact/paint/network | Quad rendering changes no physical or wire state in the actual shipped-pack test. Explosher's corrected authored muzzle intentionally changes physical birth/contact/paint coordinates; its A/B retains camera velocity, damage, ink, metadata and shot ticks, and its actual emission world checks LOS before cleanup. Each candidate's entire trace matches across cadence. |
| Main and completed #1277 geometry | The merged PR1277 lineage has identical measured geometry/grips/channels. Only Explosher's former native muzzle tag is intentionally replaced by its existing lip centre. The separate Quad two-ring authentic aperture remains undecided. |

The representative Quad60Hz/0°/open measurement makes the remaining first phase concrete:

| Emission | Pre-aimReady | Physical birth → post-pose raw socket | Presentation |
| --- | ---: | ---: | --- |
| First left, tick30 | 0 | 0.133089WU | Raw socket birth; actual native back/rod connects to the post-pose point. The physical birth remains its emission-time point. |
| First right, tick36 | 0.889197 | 0.029155WU | Native full-aim prediction; offset remains absent. This residual is preserved and is **not** claimed fixed. Its original image is not replaced by a later steady image. |
| Fully ready left, tick42 | 0.987723 | 0.017209WU | Raw socket birth; actual native back/rod connects to post-pose point. |
| Fully ready right, tick48 | 0.998640 | 0.022432WU | Raw socket birth; actual native back/rod connects to post-pose point. |

The native prediction branch and its lack of a raw-socket connection are established source behavior. This proves preservation of that behavior, not that its remaining display position is fully calibrated against Nintendo. Quad's two authored ring centres also do not select a verified authentic firing aperture. Those limits prevent a full closure claim.

The final narrow-camera Quad matrix measures150 actual back/rod connections: maximum back error5.49e-8WU and rod-end error1.90e-7WU. Its head is outside the view frustum in those samples, so that part remains `visible=false`/matrix null. A separate camera-only control pulls back to `[-5.2,2.3,-3]`, looking at `[0,1,1.3]`. Both first tick31 and fully-ready steady tick43 have all three native parts visible in the **same draw**: head physical-centre, back post-pose point, rod midpoint/direction/length errors are all below1.56e-7WU. Both images were visually inspected. This camera control does not overwrite the main matrix's visibility or the earlier prediction image.

Explosher's actual source-pose socket and FX now agree with its authored burner lip. Its positive-age native sphere instance follows physical position; it owns no projectile history. Immediate terrain retirement submits no sphere instance and has checked0/error null. No absent history is called a zero-error measurement.

Machine receipts: [weapon-only-final-acceptance.json](weapon-only-final-acceptance.json), [quad-all-parts-camera.json](quad-all-parts-camera.json), [explosher-authored-muzzle.json](explosher-authored-muzzle.json), [quad-native-volume-pose.json](quad-native-volume-pose.json). The raw archive retains the original second-shot prediction images, the observer correction, and the separate fully-ready image. No Nintendo hardware, authentic socket scale or material/performance equivalence is asserted.

Original result JSON, final logs and camera controls (text only) are in [weapon-only-raw-evidence.tar.gz](weapon-only-raw-evidence.tar.gz), SHA256 `f6cc29002cc4a7041eb4409405c077e8c1054e5414661bd8bbd7aa1c02624cee`. [weapon-only-raw-hashes.json](weapon-only-raw-hashes.json) records the text archive, local screenshot paths and all244 retained original file hashes. Original PNGs remain local. Software WebGL diagnostic draws, CPU fixtures and Nintendo retail measurements remain distinct; no Nintendo hardware capture was obtained.
