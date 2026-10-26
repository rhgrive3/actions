# BC base dimensions: direct GL verification

Read review thread `PRRT_kwDOUbp58s6wKqTw`, comment4374774346 on PR1885 through the GitHub review-thread tool. No source change was made for this probe.

One Chromium/SwiftShader WebGL2 context tested supported BC7,BC6H,DXT1,DXT5,RGTC1 andRGTC2 formats. `result.json` records the harness hash, renderer, full argument matrix, operation-specific errors and console warnings. The browser closed cleanly. No performance claim.

For every supported format:

| Base dimensions | texStorage2D (one level / full chain) | compressedTexImage2D level0 |
|---|---|---|
|1×1,2×2,8×1,8×2,400×2,2×512|INVALID_OPERATION1282|INVALID_OPERATION1282|
|4×4,8×8,4×1024|0|0|

Control: after legal immutable4×4 storage with3levels, uploading base4×4,level1=2×2 andlevel2=1×1 using `compressedTexSubImage2D` succeeded for every format. The terminal mip dimensions are valid below a legal base; they are not valid after being promoted to a new base. The existing `blockDimension` exception incorrectly conflates those cases.

Root authorized the minimal correction after this proof: base validity is now divisible-by-four only; the existing same-source/same-mip RGBA32 retry is retained. The added4×1024→2×512 capped-thin regression checks exact dimensions, all ten retained mip sizes, allRGBAbytes, identical universal source bytes, noPNG path and once-only disposal. Another test distinguishes a legal4×4 base's terminal levels from those levels being promoted. Existing fixture defaults and every existing assertion remain unchanged.

Focused and neighboring tests:64passed,0failed,0skipped. A diagnostic-only old-predicate control fails both new tests. `finding.json` contains compact numeric results, source/test/probe hashes and log hashes. No GPU run occurred after applying the source correction; root owns the subsequent commit, build and integration validation.
