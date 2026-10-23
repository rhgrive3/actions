export function adaptCharacterShadowBatch(rel, code, once) {
  if (rel === 'src/game/character.js') {
    code = "import { registerCharacterWarmBatch } from '../../patches/local-quality/character-shadow-batch.mjs';\n" + code;
    return once(code, 'sm.render(lights, this.root, camera);', 'sm.render(lights, this.root, camera, grp, this.kid);', 'explicit temporary warm group ownership') + '\nregisterCharacterWarmBatch(Character);\n';
  }
  if (rel !== 'src/main.js') return code;
  code = "import { createCharacterShadowBatch } from '../patches/local-quality/character-shadow-batch.mjs';\n" + code;
  code = once(code, '  async _warmCharacters(m, flow = null) {', '  async _warmCharacters(m, flow = null) {\n    const shadowBatch = createCharacterShadowBatch(G.renderer, () => new THREE.Group(), () => this.match === m && (!flow || flow.current()));', 'match-owned shadow warm coordinator');
  code = once(code, 'Promise.resolve(a.character.warmAll())', 'Promise.resolve(shadowBatch.warm(a.character, G.camera, G.scene))', 'retain per-character compile with shared shadow warm');
  code = once(code, "    if (jobs.length) await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 8000))]);   // never hang a load", "    try {\n      if (jobs.length) await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 8000))]);\n    } finally { shadowBatch.flush(); }   // never hang a load", 'flush completed shadow variants and close late batches');
  return code;
}
