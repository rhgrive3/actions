# #79 live wall and far-floor turf verification

Source baseline: `2b01cd7efbca260a611165b1e3887ff48062ccd5`. This test-only follow-up exercises production-composed Splattershot `fireShooter` → InkFlight → real Physics OBB → CPU PaintSystem. It does not change projectile, paint, source parameters, collision, or the CI registry.

The existing low wall shot overlaps the floor: the test now checks that credited turf equals actual newly owned floor-cell area and the sum of returned paint area. The added elevated wall shot paints wall ownership cells while leaving floor cells, scored counts and shooter turf unchanged; its source wall radius is 1.56. An additional horizontal shot from height 10 follows the native trajectory to an actual floor impact at distance 20.29, beyond the 20-unit far anchor, and verifies source far width 1.71 and actual floor credit including independent drops. It does not claim that the far anchor is reached by an ordinary ground-level shot or establish Nintendo pixel identity.

The five live tests passed 5/5 in source and 5/5 against the immutable emitted site. Before execution `verifyRuntimeBuild` checked all 1,530 inputs and 2,241 artifacts of that site against `2b01cd7e`; input hash `d9778b1754ebdade71298935f2707e3ad8b8d47c0c3d9336e9ef275d6901036e`, content hash `381c3c5777dbe72752b778aa2df9a211f59b22021e81d4f0e5910ed16185314f`. Logs and hashes are retained alongside this report. A deliberately modified test copy that added one unit to the returned paint area was rejected at the elevated wall's zero-turf assertion (`negative-control.tap.gz`); the mutation was never committed.

The first expanded run failed because the test incorrectly assumed a wall hit calls the floor `inkFlight.impact` observer; the actual wall path uses a different callback. The corrected test proves a real wall impact using observed wall splat and changed wall cells instead. Earlier exploratory attempts, including the incorrect assumption, are not counted as passes. Hosted CI for the eventual published head remains separate.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs
INKWAVE_BUILT_SITE=/path/to/verified/site node --experimental-vm-modules --test patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs
```
