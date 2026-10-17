import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
for(const rel of ['src/game/character.js','src/game/character-weapons.js']) {
  test('opponent palette import stays inside the emitted site: '+rel,()=>{
    const source=fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8');
    const code=adaptBuildSource(rel,source);
    const imports=[...code.matchAll(/from\s*['"]([^'"]*weapon-opponent-palette\.mjs)['"]/g)].map(m=>m[1]);
    assert.equal(imports.length,1,'one explicit palette module import');
    const expected='patches/splatoon3/runtime/weapon-opponent-palette.mjs';
    assert.equal(path.posix.normalize(path.posix.join(path.posix.dirname(rel),imports[0])),expected);
    // Vary deployment depth: neither a parent checkout nor sibling files may
    // accidentally satisfy an import which escapes the production site.
    for(const prefix of ['https://test.invalid/','https://test.invalid/nested/site/']) {
      assert.equal(new URL(imports[0],new URL(rel,prefix)).href,new URL(expected,prefix).href);
    }
    assert.ok(fs.existsSync(path.join(root,expected)));
  });
}
