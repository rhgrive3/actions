#!/usr/bin/env node
// Full Wiper acceptance assertions, with a separately pinned secure launcher.
// This is not byte-identical to the production launcher and backend may differ.
import assert from 'node:assert/strict';import {runWiperCapture} from './check-inkwave-wiper-secure-acceptance.mjs';
const [site,out,sourceFlag,sha,rootFlag,sourceRoot]=process.argv.slice(2);
assert.equal(sourceFlag,'--source-sha');assert.equal(rootFlag,'--source-root');assert.equal(process.argv.slice(2).length,6);
await runWiperCapture(site,out,sha,{root:sourceRoot});
