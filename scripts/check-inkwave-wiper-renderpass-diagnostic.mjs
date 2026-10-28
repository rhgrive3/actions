#!/usr/bin/env node
// Opt-in diagnostic only: never an acceptance receipt. The sandbox is enabled
// and no backend/unsafe flags are added; a blocked launch is not retried.
import assert from 'node:assert/strict';
import {runWiperCapture} from './check-inkwave-wiper-renderpass-diagnostic-capture.mjs';
const [site,out,sourceFlag,sha,rootFlag,sourceRoot,harnessFlag,harnessSha]=process.argv.slice(2);
assert.equal(sourceFlag,'--source-sha');assert.equal(rootFlag,'--source-root');assert.equal(harnessFlag,'--harness-sha');assert.equal(process.argv.slice(2).length,8);
await runWiperCapture(site,out,sha,{root:sourceRoot,diagnosticBackend:true,expectedDiagnosticSha:harnessSha});
