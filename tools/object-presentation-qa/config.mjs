export const BASE = '3839b61a6c6c4d5ac998b82168f37b802bc55099';
export const SUITES = {
  spawner: {
    before: ['patches/splatoon3/runtime/squid-spawn-presentation.mjs'],
    added: [],
  },
  rainmaker: {
    before: ['patches/splatoon3/runtime/weapon-handoff-motion.mjs', 'patches/splatoon3/runtime/ranked/rainmaker-model.mjs'],
    added: ['patches/splatoon3/runtime/ranked/rainmaker-motion.mjs'],
  },
  'rainmaker-air': {
    beforeBase: '381319e16361497c6bb5f4649ce119acd7883f7f',
    before: ['patches/splatoon3/runtime/weapon-handoff-motion.mjs'],
    added: [],
  },
  clam: {
    before: ['patches/splatoon3/runtime/ranked/world.mjs', 'patches/splatoon3/runtime/ranked/clams.mjs', 'patches/splatoon3/runtime/ranked/install.mjs', 'patches/splatoon3/runtime/bomb-motion.mjs', 'patches/splatoon3/runtime/weapon-handoff-motion.mjs'],
    added: ['patches/splatoon3/runtime/ranked/clam-presentation.mjs'],
  },
};
export const sourceKey = file => file.replace(/^patches\/splatoon3\//, 'patch/');

export const suiteBase = suite => SUITES[suite].beforeBase || BASE;
