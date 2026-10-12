# Fixed algorithm-cost model fixture

This archive contains existing repository source, not user-provided images or other user files. It is an immutable dependency closure of main `80555b8cf12e3a9529c0f461bd2acc3ee17f1764`: 27 source modules, plus 3 existing vendor modules reused only after exact Git SHA verification. Native public sources carry the same main805 production source adapters. No model is simplified for this fixture.

Compressed: 269,527 bytes. Expanded JSON: 881,427 bytes. SHA-256: `11362bbf7af3ea1a7105b0e4df63bc71e69a0e9ee18c8ac7d57f405a1349d0f7`.

The normal test suite instantiates this fixed model set for the original <20% algorithm-allocation guard. Separately, the current catalog still runs the full 65-model corner/material/position/normal/source/cache checks and its browser eight-player budgets. This fixture cannot turn new model complexity into an algorithm-regression denominator change.

Local Node 24.19.0 isolated setup: decode 7.38 ms, VM ready 313.61 ms, all65 body/ink definitions ready 7.62 s. Inside the combined correctness suite it took 10.39 s; total four-test suite 25.41 s. These are test initialization costs, not production startup costs. `build-inkwave.mjs` skips `patches/splatoon3/tests/` in both copy and build-source traversal, so this archive/loader is not deployed.

Reproduction: run `node --experimental-vm-modules scripts/freeze-inkwave-lod-model-fixture.mjs /path/to/clean-main805` with Node 24.19.0. The script refuses a different commit or dirty tracked source. The committed artifact was created from a local canonical-blob mirror; every source/vendor original Git SHA below was verified against main805 through GitHub before acceptance.

| Original source (virtual built-root path) | Main805 original Git blob |
|---|---|
| `src/game/character-weapons.js` | `3ac287943669ba320abbf040a2dcbefc521025b3` |
| `patches/splatoon3/runtime/weapon-models/registry.mjs` | `a6ec5af43dafd5587726387370403a00b1bbe254` |
| `patches/splatoon3/runtime/weapon-reference-models.mjs` | `f8bbdde9ec5b1f1c91b69b27ce709d22d29c1d9d` |
| `patches/splatoon3/runtime/roller-model.mjs` | `2c47a32eda3de67c5054319d04b46cf6ef6b3466` |
| `patches/splatoon3/runtime/roller-fold.mjs` | `ee78ac6dc6dda7909e8687ee4e7988f76f02f874` |
| `patches/splatoon3/runtime/blaster-mechanism-model.mjs` | `e65d3683bf64e000f95ac5f2a5a06f39abc4eb99` |
| `src/game/character-geo.js` | `bcc01ce107d566bedc998307496cf29beb99d099` |
| `src/game/character-mats.js` | `cb2d7ba4b8867936a48cf4a0e141969a10e22a50` |
| `patches/splatoon3/runtime/main-weapon-catalog-data.mjs` | `951f351e83d33c866905f06deedd650eac149b30` |
| `patches/splatoon3/runtime/weapon-models/shooters.mjs` | `da74818e92a2708d467c0199a0cea720d9935095` |
| `patches/splatoon3/runtime/weapon-models/shooters-b.mjs` | `fe1224a20c70fa0fae461e8347b15b8d8bfdd77b` |
| `patches/splatoon3/runtime/weapon-models/blasters.mjs` | `fc80ded3e03291627a1305a2af6b5c771c463ca4` |
| `patches/splatoon3/runtime/weapon-models/dualies.mjs` | `5b9ea457da3a0112cacf2080634111ec8c3891e0` |
| `patches/splatoon3/runtime/weapon-models/rollers.mjs` | `2c61d48d480db625d45b421b727007be0620d38f` |
| `patches/splatoon3/runtime/weapon-models/brushes.mjs` | `34850c06aae8e05ccd3b05bce05dadec533ff35c` |
| `patches/splatoon3/runtime/weapon-models/chargers.mjs` | `a06b17b6adfe853ad28abe591ae0fada81ecbfe0` |
| `patches/splatoon3/runtime/weapon-models/stringers.mjs` | `c4bbcd5e8bd97c7cabbf312ac363f549c103816e` |
| `patches/splatoon3/runtime/weapon-models/sloshers.mjs` | `ea6b60a47b3fb0aec4b1dce22e6e81f82dc6ce94` |
| `patches/splatoon3/runtime/weapon-models/splatlings.mjs` | `ca5fb3c7fc879c332d101a29256873879cb9bbdd` |
| `patches/splatoon3/runtime/weapon-models/brellas.mjs` | `5a4d43899b6204b274a6b970811e9323a6f73ebe` |
| `patches/splatoon3/runtime/weapon-models/splatanas.mjs` | `7c1d20fb00d63ebafa7454de4491a5bdd9564ed4` |
| `src/game/character-outfit.js` | `495c26a37a15d03b3092a7daceb57c38f6eef94a` |
| `src/game/character-face.js` | `a6e30e289ddbdb7a073d61196620d81946ec53be` |
| `src/game/character-hair.js` | `55ede4cb7a4db8459687ee284679a18e1195474c` |
| `patches/splatoon3/runtime/weapon-models/kit.mjs` | `4f0f71a8afae9a574f3ba9501490dc692fb8119b` |
| `patches/splatoon3/runtime/blaster-mechanism.mjs` | `04b858f07490fd4f5bd4e30703b0f08689739d80` |
| `src/core/ctx.js` | `637789587ff84ddeea2aeb01b6e7e4ad83343c76` |
| `vendor/three/build/three.module.js` | `c52087acfabae80efabb8cc05e3a1d96e35a1426` |
| `vendor/three/jsm/utils/BufferGeometryUtils.js` | `a167e11b0558954a00960dc3cad00ead6476fbe7` |
| `vendor/three/build/three.core.js` | `0a1d6cb9ef3cabc97a50bd02394c85e8d1c513c2` |
