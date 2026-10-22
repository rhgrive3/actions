// Exact reviewed main/integration source leaves. Admission preserves both sides;
// native physical, paint and image comparison remains mandatory. No replay.
export const ALL_PRS_SOURCE_PAIR = Object.freeze({
  "baseCommit": "26a4db4123d23162a3dbf8a12150b1b5bc6ccf64",
  "candidateCommit": "992b670084d11560a5621041a5e456bd10a7b75c",
  "blobs": {
    "patches/network-replication/adapter.mjs": {
      "base": "09bee320e01f20291c6261add1560ed3dc5eb22c",
      "candidate": "e34197805005b6a3f1fab8c2f2e549d3c113ee93"
    },
    "patches/network-replication/slosher-paint-admission.mjs": {
      "base": "835ec49ce61f4d623a97f0cdb38fdcb8c592b916",
      "candidate": "835ec49ce61f4d623a97f0cdb38fdcb8c592b916"
    },
    "patches/splatoon3/main-ink-footprint-adapter.mjs": {
      "base": "cdcc9e94cfe5b754a0b1f99fbd204b28ff24d91c",
      "candidate": "cdcc9e94cfe5b754a0b1f99fbd204b28ff24d91c"
    },
    "patches/splatoon3/runtime/blaster-flight-paint.mjs": {
      "base": "629e9a0eb0f7ea67bf27d756bf3f46273396791c",
      "candidate": "fddebc93b43788828bfa4110709be9c3c3ca3c34"
    },
    "patches/splatoon3/runtime/main-ink-footprints.mjs": {
      "base": "546c48ae0c1b30d669de3756350f20c7e82dfe4e",
      "candidate": "7911a9b791cea92d3a418d273e632417bd041a3d"
    },
    "patches/splatoon3/runtime/main-weapon-catalog.mjs": {
      "base": "a2d630d535f01f00bffb88b3e95bec09d47e2aeb",
      "candidate": "857dfa9babe3fddd9089627ffe9d4f67dec8da77"
    },
    "patches/splatoon3/runtime/paint-packet-codec.mjs": {
      "base": "c5e6f71cddc6d9caba22f687a77869604fced80e",
      "candidate": "b008a9671e89908fdcc3056515a533811316572a"
    },
    "patches/splatoon3/runtime/slosher-intermediate-paint.mjs": {
      "base": "9914ddcef5472e6314dd9a02ba6f0996ccfd3f05",
      "candidate": "9914ddcef5472e6314dd9a02ba6f0996ccfd3f05"
    },
    "patches/splatoon3/runtime/slosher-nearest-paint.mjs": {
      "base": "6b19ec7a8f7f0f55cf5e10a42ad78d786da6dd0b",
      "candidate": "70a82255bcc65c955bcb9bdad4ec3fcf531f74fe"
    },
    "patches/splatoon3/runtime/weapon-edgecases.mjs": {
      "base": "ebb85e51fab03258a35b84cb0f2aa9ec8bdd5110",
      "candidate": "ebb85e51fab03258a35b84cb0f2aa9ec8bdd5110"
    },
    "patches/splatoon3/runtime/weapons-fidelity.mjs": {
      "base": "a37fa779835a2a17e24c5bed3c601a56269bfec3",
      "candidate": "7b90706ec5cc5bb05d9f150344495753a7f1acad"
    },
    "scripts/inkwave-source-composition.mjs": {
      "base": "33a535481402bae5e846870bed2ee7e76ef9b298",
      "candidate": "a61100acdd90db510fafb99d6636c8fffff1295c"
    },
    "scripts/lib/inkwave-build-only-modules.mjs": {
      "base": "89f3b41a400307f8c6f7156bb4850d6c67e67c85",
      "candidate": "5408d3598bd60d661f003f5ea0e7c02ef55e4d62"
    }
  }
});
export const ALL_PRS_FIXTURE_SHA256="4d4d2c7be476b11219dc05f02ea53101df2f4a415cde34c433de1fd5dafe82ab";

// Preserve the reviewed Roller pose scratch change; do not copy candidate
// pose code into the baseline or assert native pose equivalence here.
export const ALL_PRS_POSE_PAIR=Object.freeze({
  "sourceBase": "26a4db4123d23162a3dbf8a12150b1b5bc6ccf64",
  "sourceHead": "992b670084d11560a5621041a5e456bd10a7b75c",
  "paths": {
    "patches/splatoon3/adapter.mjs": {
      "baseline": "d0fa9907e1f3b343f21ca560fdeeddd29795b988",
      "candidate": "d0fa9907e1f3b343f21ca560fdeeddd29795b988"
    },
    "patches/splatoon3/body-proportion-adapter.mjs": {
      "baseline": "fb7fd54c6b6c1f9ae8b4013b03e152e30a5194cf",
      "candidate": "fb7fd54c6b6c1f9ae8b4013b03e152e30a5194cf"
    },
    "patches/splatoon3/runtime/body-proportion.mjs": {
      "baseline": "5d7dfb8103b4375379ccb9c8fda53e615d00adff",
      "candidate": "5d7dfb8103b4375379ccb9c8fda53e615d00adff"
    },
    "patches/splatoon3/runtime/idle-motion.mjs": {
      "baseline": "06d276d899aa764df7e75d41612f7ca1ec22953b",
      "candidate": "06d276d899aa764df7e75d41612f7ca1ec22953b"
    },
    "patches/splatoon3/runtime/install.mjs": {
      "baseline": "56b9b99fbb79d8650e7e132fd187f1514f27c62d",
      "candidate": "56b9b99fbb79d8650e7e132fd187f1514f27c62d"
    },
    "patches/splatoon3/runtime/roller.mjs": {
      "baseline": "d8bec5a2220ebf970c489969fa41d9e6f74affed",
      "candidate": "f18ba0af47efddf0be713dac17fe1d909fe27edf"
    },
    "patches/splatoon3/runtime/source-posture.mjs": {
      "baseline": "a31d8224d129665917632ee7083c4081de5803a4",
      "candidate": "a31d8224d129665917632ee7083c4081de5803a4"
    },
    "patches/splatoon3/upstream-lock.json": {
      "baseline": "03e146de050c40a3d10807f424b2513006972cd0",
      "candidate": "03e146de050c40a3d10807f424b2513006972cd0"
    },
    "patches/splatoon3/runtime/weapon-handoff-motion.mjs": {
      "baseline": "32e456e3a80302621b6d7ca73f3ce8c5bf1f6e7f",
      "candidate": "32e456e3a80302621b6d7ca73f3ce8c5bf1f6e7f"
    },
    "patches/splatoon3/runtime/weapon-models/brushes.mjs": {
      "baseline": "b2caf7fc704bc177a6c73f0e1c8baca163a052a2",
      "candidate": "b2caf7fc704bc177a6c73f0e1c8baca163a052a2"
    },
    "patches/splatoon3/runtime/weapon-models/family-holds.mjs": {
      "baseline": "91a672123486114f9849de61509c6ee6ec96363f",
      "candidate": "91a672123486114f9849de61509c6ee6ec96363f"
    },
    "patches/splatoon3/runtime/weapon-models/kit.mjs": {
      "baseline": "3ab94f55c299b56485880ede17b92d5150101f7d",
      "candidate": "3ab94f55c299b56485880ede17b92d5150101f7d"
    },
    "patches/splatoon3/runtime/weapon-models/registry.mjs": {
      "baseline": "7f651d20395cb8b2622ca0dcd9180019b7533ce1",
      "candidate": "7f651d20395cb8b2622ca0dcd9180019b7533ce1"
    },
    "patches/splatoon3/runtime/weapon-models/stringers.mjs": {
      "baseline": "ba2e3856064aed3a3bcb0d74c97bad0921d5c94e",
      "candidate": "ba2e3856064aed3a3bcb0d74c97bad0921d5c94e"
    },
    "patches/splatoon3/runtime/weapon-models/variants-milk-followup.mjs": {
      "baseline": "9f68724343748037145c552937025d74ac5df8b9",
      "candidate": "9f68724343748037145c552937025d74ac5df8b9"
    },
    "patches/splatoon3/weapon-catalog-adapter.mjs": {
      "baseline": "55582fd6109ff814ed107577db74b990d755a926",
      "candidate": "55582fd6109ff814ed107577db74b990d755a926"
    }
  }
});
