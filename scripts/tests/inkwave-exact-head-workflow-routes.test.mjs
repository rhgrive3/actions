import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const relay = expandTestSuiteSteps(fs.readFileSync(new URL('.github/workflows/inkwave-relay-security.yml', root), 'utf8'));
test('relay dispatch retains checkout and both regression suites',()=>{
 assert.match(relay,/on:\n  workflow_dispatch:\n/);
 assert.match(relay,/test "\$actual_source_sha" = "\$EXPECTED_SOURCE_SHA"/);
 assert.match(relay,/node --experimental-vm-modules --test server\/tests\/\*\.test\.mjs/);
 assert.match(relay,/node --experimental-vm-modules --test patches\/reliability\/tests\/relay-compatibility.test.mjs/);
});
