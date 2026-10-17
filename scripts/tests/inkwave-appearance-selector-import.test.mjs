import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptWeaponCatalog } from '../../patches/splatoon3/weapon-catalog-adapter.mjs';

test('native menu selector imports its appearance-aware owner key in the emitted module scope', () => {
  const source = fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
  const output = adaptWeaponCatalog('src/ui/menus.js', source);
  assert.match(output, /c\.weaponModel === weaponModelKey\(shown\)/);
  const binding = output.match(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*weapon-models\/registry\.mjs['"]/);
  assert.ok(binding, 'actual generated registry import exists');
  const names = binding[1].split(',').map(name => name.trim());
  assert.ok(names.includes('weaponModelKey'), 'selector owner lookup must be bound in the generated Menus module, not injected by an extracted callback test');
});
