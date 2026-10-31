# Conservative shader reflection warmup for the cooler and swim film

## Finding and change

The bundled Three.js `compileAsync()` waits for the material's current linked program but does not populate its uniform/attribute reflection; `WebGLProgram.getUniforms()` performs that work on the first render. Transparent double-sided glass can have separate back- and front-face programs. Earlier native Turf profiling observed `cooler-glass` and `InkSwimFilm` programs linked at startup but reflected during the match, with long `getProgramParameter` waits on Chromium/SwiftShader.

During the existing loading warmups, this candidate requests reflection for **only** the long-lived cooler glass and retained swim-film materials after their `compileAsync` resolves. It reads their existing compiled-program maps and invokes `getUniforms()` only where `KHR_parallel_shader_compile` exists and the specific program reports ready. The bundled Three.js then caches both uniform and attribute locations on that shared WebGLProgram. The change adds no draw, scene object, shader modification, uniform value change or gameplay change. Prewarming only transfers if the program variant matches the actual scene's lights/environment and composer target; later variants keep their normal first-use behavior.

The capability guard is essential: without KHR, Three.js `program.isReady()` returns true without checking whether the driver has finished, and reflection could block the JavaScript event loop through the loader's eight-second timeout. On that path this candidate **does nothing**. A missing internal API, absent/retired program, context loss, not-ready variant, or reflection exception also falls back to ordinary rendering. On KHR-supported devices the completion test avoids knowingly unfinished programs, but `getUniforms()` itself is still a synchronous GL call; driver/GPU waits cannot be given a strict real-time bound. Supported real-device performance and time-to-load need measurement.

## Evidence and limits

A focused unit test models KHR support and a program map containing duplicate, completed and incomplete entries: only the completed program is touched, once; the unready variant is skipped. The no-KHR, lost-context, absent API and exception cases are no-ops. These are mocked cases, **not evidence of KHR performance on real hardware**.

Three independently launched ABBA real-WebGL fixtures use the production cooler factory/keeper and pooled swim-film material, each under a target scene with lights, Chromium 154 / SwiftShader and target formats HalfFloat and RGBA8 ([run 1](shader-reflection-abba-1.json), [run 2](shader-reflection-abba-2.json), [run 3](shader-reflection-abba-3.json)). The compiled programs matched those subsequently reused for rendering (glass: 2; film: 1). This SwiftShader reports **no KHR extension**. As required, both baseline and candidate performed 0 reflection queries in warmup and then 2 / 1 `ACTIVE_UNIFORMS` queries at first draw. All RGBA8 pixel hashes matched, non-empty images were produced, and GL errors were zero. HDR program identity was checked, but HDR pixels were not read back. Consequently, **there is no measured shader-wait improvement in this SwiftShader environment**.

Warmup and first-render wall times in the same instrumentation varied considerably. For HDR glass, the three ABBA pair-mean baseline→candidate warmup times were 150→148, 147→176 and 193→153 ms; first-render times were 99→264, 170→235 and 120→84 ms. For the HDR film, warmup was 26→21, 22→19 and 20→21 ms; first render was 14→6, 16→11 and 15→5 ms. These timings are brief isolated fixtures with shader/driver cache and host noise and cannot establish a real startup or first-draw speed change. Full native matches, final-screen pixels across game states, real KHR-supported GPUs, and Splatoon 3 hardware behavior remain unverified.

Candidate runtime modules were produced using the same source composition, minification and string compaction as production; before modification, both corresponding modules matched the integration build byte-for-byte ([probe-build.json](probe-build.json)). For reproduction:

```sh
node scripts/build-inkwave-shader-probe.mjs <baseline-site> .ci-scratch/shader-probe
INKWAVE_SHADER_PROBE_DIR="$PWD/.ci-scratch/shader-probe" node scripts/check-inkwave-shader-reflection-browser.mjs <baseline-site> /tmp/reflection.json --abba
node --experimental-vm-modules --test --test-concurrency=2 patches/local-quality/tests/shader-program-reflection.test.mjs patches/splatoon3/tests/special-program-keepers.test.mjs patches/splatoon3/tests/remaining-combat-prewarm.test.mjs
```

The `special-program-keepers` VM fixture logs `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from the Character's caught optional source-motion import. The unmodified integration PR base `2f3acacdb` was run separately with the same command and produced the same warning while passing; it is not introduced by this change. The fixture warning does not constitute a real-browser shader failure.
