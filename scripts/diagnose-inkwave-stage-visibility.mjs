#!/usr/bin/env node
// Existing diagnostic-only workflow entrypoint; bounded paired bullet study.
import path from 'node:path';
import {runPair} from './diagnose-projectile-pair.mjs';
const report=await runPair(path.resolve(process.argv[2]),path.resolve(process.argv[3]));
if(report.status!=='collected')process.exitCode=1;
