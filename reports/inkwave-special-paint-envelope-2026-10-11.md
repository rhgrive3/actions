# Continuous special paint envelope candidate

## Confirmed regression

Connecting the pinned 11.3.0 special-power radii exposed an existing rendering/ownership discontinuity. `paintDisk` changed from one stamp to a lattice of full-radius 3.74 WU stamps as soon as the requested radius exceeded 3.74. The old lattice placed centres almost at the requested outer radius, extending each tile well beyond it. With fixed fixture random seed .37, Inkjet AP0/10/57 produced 35.5/40.875/134.4375 square WU; all eight Chumps produced 206/222.125/456.8125. Wire replay was consistent but reproduced this excessive area.

The source curves are retained unchanged: Inkjet 3.2/3.6/4, Chump 3.5/3.8/4.1, and the separately staged Tenta 3.15/3.465/3.78. These are derived from the pinned Leanny 11.3.0 tables and spec-up rows, not from the old raster's footprint.

## Candidate changes

- Keep stamp centres within requested radius minus 3.74, add an inscribed outer ring to avoid lattice holes, and retain the contacted-plane placement introduced in PR1229.
- Use one mask seed across the disk and collapse centres that quantize to the same wire position. This avoids combining unrelated masks at the size threshold.
- Catalogue-special launch and disk use the same seed-mixing salt. Native burst paint uses that projectile seed, the same as immediate and delayed supplemental disks. The random argument is still evaluated exactly once, preserving ordinary main selection and the caller's random-draw count. Pooled special metadata is still reset by the earlier safety fix.
- Keep ordinary radius/seed wire fields and the 3.74 per-stamp admission cap. No permission widening is introduced.

The requested radius is a nominal envelope, not an exact Nintendo stencil. Existing procedural wobble and ancillary satellites remain, and may extend beyond it.

## Measurements

Actual Actor, Projectiles, PaintSystem and fixed seeds .13/.37/.79 exercise legitimate loadouts. Inkjet AP25→26 is the first reachable threshold, Chump AP13→15 (AP14 cannot be built from ordinary 10/3-point slots), and Tenta AP44→45.

Inkjet boundary areas were 47.875→48.0625, 48.375→49 and 48.4375→48.75. All three specials were monotone across base, both boundary loadouts and maximum AP. Each boundary increase was under 5%; max/base area ratio was within 10% of the nominal squared-radius ratio, allowing for the inherited procedural mask. For seed .37, corrected Inkjet maximum is 57.375, compared with the old 134.4375.

Booyah nominal radius 13.5 on flat/15°/30° surfaces produced 591.5625/592.625/593.5625 square WU and zero missing central cells. Exterior area was 25.3125/26.125/26.5625, under 6% of total, compared with 278.9375 on the old flat disk. The upper-storey counterfactual now paints 9406 cells rather than the former >10000 because the excessive envelope was reduced; the acceptance case still requires zero upper-storey cells.

The final nested ring retains prior angles when its count doubles from 6 to 12 to 24. The earlier uniform-count candidate lost up to 2.375 square WU (38 cells) at the 11-to-12 transition. Actual ownership regressions at ring and hex-grid insertion boundaries now retain every previously painted cell for all three seeds. At the true 6-to-12 and 12-to-24 transitions, added centres add positive area; this is not a proof of a continuous exact stencil at every radius.

Ordinary stamp counts (old main / intermediate uniform ring / final nested ring) are 85/59/61 at radius13.5, 19/16/19 at radius7.51, and 37/25/25 at radius9.012. The largest currently used disk radius is13.5; larger hypothetical radii are not a universal performance guarantee. At radius3.740384 the seven nearly coincident tiles collapse to one. These are CPU/wire work counts, not a measured browser FPS or GPU-speedup claim.

An additional scan of all 40 ordinarily reachable AP values × 3 seeds × 3 specials (360 cases) found one one-cell decrease: Chump seed .37 AP54→57, 60.3125→60.25 square WU. This bounded quantization/contour residual is explicitly tested and remains unresolved; strict monotonicity for all AP/seeds is not claimed. Increasing the minimum ring to 12 eliminated this sample residual but nearly doubled small-disk packets, so it was not adopted.

## Validation and limits

Source focused tests: 61/61. Actual composed-build tests: 61/61, including special mechanics, gear curves, six real JSON ownership/duplicate tests, projectile reuse and no self-gauge refill, wall versus floor credit, multilayer terrain, and final-grid parity at30/60/120Hz. Content hash: `6730b952954bb7927a0f909b432b6ae4e7dff11f3770200107cf7681d22c23fe`.

Additional source/built terrain assertions bind the exterior-area and packet-count bounds. Live browser/GPU checks and independent parent review remain required before acceptance. Full retail stencil, cross-paint projection and visual footage matching remain unverified. This candidate does not include the unpublished authoritative-queue overflow change.
