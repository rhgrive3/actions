import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from './pure.mjs';
import { runContracts } from './contracts.mjs';
test('experimental socket, bridge and range contracts',()=>assert.equal(runContracts(api),20));
