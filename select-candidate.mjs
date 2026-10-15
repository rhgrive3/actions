import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateVariantPlan} from './variant-plan.mjs';
const [planPath,envPath]=process.argv.slice(2);
assert.ok(planPath&&envPath,'Plan and environment output paths are required');
const plan=validateVariantPlan(JSON.parse(fs.readFileSync(planPath,'utf8')));
assert.match(plan.candidateHead,/^[a-f0-9]{40}$/,'Explicit immutable checkout head is required');
fs.appendFileSync(envPath,'CANDIDATE='+plan.candidateHead+'\n');
