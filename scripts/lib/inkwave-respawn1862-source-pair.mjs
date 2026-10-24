// Exact reviewed PR1862 source pair. Historical pose epochs stay immutable.
// These sixteen leaves differ only in Roller admission and the display handoff.
// This is source identity, not native/visual equivalence or permission to replay.
export const RESPAWN_1862_POSE_PAIR = Object.freeze({
  sourceBase: '7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51',
  sourceHead: '6755954a13c8135bfac4102580f81f1cb553c640',
  paths: Object.freeze(Object.fromEntries(Object.entries({
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
    "baseline": "f18ba0af47efddf0be713dac17fe1d909fe27edf",
    "candidate": "df2851585c5281efafb135f21e8dafa1621eb206"
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
    "candidate": "267763bb5ad147ea56f8cd326672492fb8c19ba8"
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
}).map(([path, row]) => [path, Object.freeze(row)]))),
});
