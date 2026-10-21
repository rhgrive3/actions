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
    beforeBase: '8a9036623038f051fbdeef1f5057a5b3950ccee6',
    // The exact pre-landing-fix stage has no deferred Clam arm dependency.
    before: ['patches/splatoon3/runtime/weapon-handoff-motion.mjs'],
    added: [],
  },
  'rainmaker-form': {
    beforeBase: '00968835349cb8afac3803c412a48475e40bcae8',
    // Same build-only source adapter is inert with the historical handoff.
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
