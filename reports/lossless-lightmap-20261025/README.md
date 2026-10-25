# Lossless lightmap filtering work reduction

Baseline: `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`. Node v24.19.0.

The PNG build helper now swaps two reusable row buffers instead of allocating
five candidates per row. Candidate scores are sums of nonnegative integers;
once a partial score reaches the best complete score, that candidate cannot
win. Ties still select the earliest PNG filter. A rejected partial candidate
never replaces the complete best buffer. PNG parsing, checksums, predictors,
compression settings, metadata, round-trip verification and the smaller-output
rule remain unchanged.

The five shipped input lightmaps (including Range) and 120 synthetic images
produce byte-identical PNGs against the fixed baseline. Synthetic cases include
widths 1/2/3/7/31/32/127/320, heights 1/2/9, zero/255/127/128 values, ramps and
seeded noise. The existing pixel-oracle tests retain their expected hashes.
The mixed-filter fixture now also checks the complete filtered stream against
an exhaustive PNG-spec scorer, including ties and changing winners.

For the five shipped images, candidate scratch allocations fall from 40,960
buffers to 10. A nine-round measurement rotates the order of baseline,
buffer-reuse-only control and the final implementation. Median time for the
five complete encodes was 1551.45 / 1522.83 / 1393.34 ms respectively: about
10.2% less elapsed CPU workload time for the final candidate in this local run.
Raw samples are in `isolated-variants.json`. An earlier run concurrent with
other builds measured 1578.63 → 1586.96 ms and is retained separately in
`parallel-comparison.json`; timing under shared load is noisy.

This is build-time work only. It does not change downloaded bytes, pixels,
gameplay, rendering cadence or device FPS. A production build before/after
comparison has identical complete artifact inventories and contentHash
`31b7fe4600b57c9a1596afb57a9b5d29fb1ff7eb1cff27c467f701de58bcfb22`.
The sole changed canonical build input is this helper's source identity.
The startup budget passes.

Reproduce byte comparisons and nine alternating timing samples:

```sh
node reports/lossless-lightmap-20261025/compare.mjs
node --test scripts/tests/inkwave-lossless-lightmap.test.mjs
```

The comparison script reads the fixed Git baseline and prints results without
writing unless `--write-result` is explicitly supplied. The isolated
three-variant timing experiment additionally omitted only the early-break
line from the candidate for its buffer-reuse control. Measurements do not
represent an end-to-end CI speedup.
