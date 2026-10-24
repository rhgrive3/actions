#!/usr/bin/env node
import {parseSourceAdmissionArgs} from './lib/inkwave-source-admission-cli.mjs';
import {respawnPRContext, runRespawnProductionAdmission} from './lib/inkwave-respawn1862-production-pair.mjs';

const flags = ['--baseline', '--candidate', '--base-sha', '--candidate-sha', '--expected-mode', '--expected-source-base', '--expected-source-head', '--role', '--receipt'];
const values = parseSourceAdmissionArgs(process.argv.slice(2), flags, flags);
const options = {baseline: values.get('--baseline'), candidate: values.get('--candidate'),
  baseSha: values.get('--base-sha'), candidateSha: values.get('--candidate-sha'), mode: values.get('--expected-mode'),
  sourceBase: values.get('--expected-source-base'), sourceHead: values.get('--expected-source-head')};
const evidence = runRespawnProductionAdmission(options, respawnPRContext(), values.get('--role'), values.get('--receipt'));
console.log(JSON.stringify(evidence));
