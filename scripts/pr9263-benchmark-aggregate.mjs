import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.EVIDENCE_ROOT || 'downloaded');
const outputFile = path.resolve(process.env.OUTPUT_FILE || 'final/result.json');
const targetSha = String(process.env.TARGET_SHA || '');
const expectedShards = Number(process.env.EXPECTED_SHARDS || '16');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function pctl(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1))];
}

const files = walk(root).filter(file => /shard-\d+\.json$/.test(file));
const shards = [];
for (const file of files) {
  try {
    const row = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (row?.schema === 'hex-pr9263-fresh-benchmark-shard/v1') shards.push(row);
  } catch {}
}
shards.sort((a,b)=>a.shardIndex-b.shardIndex);

const byShard = new Map();
for (const shard of shards) if (!byShard.has(shard.shardIndex)) byShard.set(shard.shardIndex, shard);
const uniqueShards = [...byShard.values()].sort((a,b)=>a.shardIndex-b.shardIndex);
const results = uniqueShards.flatMap(s => s.results || []);
const states = {};
const functionStates = {};
for (const row of results) {
  states[row.state] = (states[row.state] || 0) + 1;
  for (const [key,value] of Object.entries(row.functionStates || {})) functionStates[key] = (functionStates[key] || 0) + Number(value || 0);
}
const caseTimes = results.filter(r=>Number(r.elapsedMs)>0).map(r=>Number(r.elapsedMs));
const functionCount = results.reduce((n,r)=>n+Number(r.functionCount || 0),0);
const earliest = uniqueShards.length ? Math.min(...uniqueShards.map(s=>Date.parse(s.startedAt))) : null;
const latest = uniqueShards.length ? Math.max(...uniqueShards.map(s=>Date.parse(s.finishedAt))) : null;
const clusterWallMs = earliest != null && latest != null ? latest - earliest : null;
const duplicateCaseIds = results.length - new Set(results.map(r=>r.id)).size;
const wrongHead = uniqueShards.filter(s=>s.targetSha !== targetSha || s.actualSha !== targetSha).map(s=>s.shardIndex);
const manifestShas = [...new Set(uniqueShards.map(s=>s.manifestSha256))];
const missingShards = Array.from({length:expectedShards},(_,i)=>i).filter(i=>!byShard.has(i));
const notRun = Number(states.NOT_RUN || 0);
const completedCases = results.length - notRun;

const summary = {
  schema:'hex-pr9263-fresh-benchmark-final/v1',
  targetSha,
  expectedShards,
  observedShards:uniqueShards.length,
  missingShards,
  wrongHead,
  manifestSha256:manifestShas.length === 1 ? manifestShas[0] : null,
  manifestShaVariants:manifestShas,
  totalCaseRows:results.length,
  uniqueCaseRows:new Set(results.map(r=>r.id)).size,
  duplicateCaseIds,
  completedCases,
  notRun,
  states,
  functionStates,
  functionCount,
  distributedPerformance:{
    clusterWallMs,
    caseP50Ms:pctl(caseTimes,50),
    caseP90Ms:pctl(caseTimes,90),
    caseMaxMs:caseTimes.length ? Math.max(...caseTimes) : null,
    sumCaseMs:caseTimes.reduce((a,b)=>a+b,0),
    functionsPerSecond:clusterWallMs > 0 ? functionCount / (clusterWallMs / 1000) : null,
    casesPerSecond:clusterWallMs > 0 ? completedCases / (clusterWallMs / 1000) : null,
  },
  shardPerformance:uniqueShards.map(s=>({
    shardIndex:s.shardIndex,
    wallMs:s.wallMs,
    selected:s.selected,
    launched:s.launched,
    states:s.states,
    functionCount:s.functionCount,
    caseTiming:s.caseTiming,
  })),
  results:results.sort((a,b)=>String(a.id).localeCompare(String(b.id))),
};
summary.complete = uniqueShards.length === expectedShards
  && missingShards.length === 0
  && wrongHead.length === 0
  && duplicateCaseIds === 0
  && results.length === 160
  && notRun === 0
  && manifestShas.length === 1;

fs.mkdirSync(path.dirname(outputFile), { recursive:true });
fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({
  complete:summary.complete,
  shards:`${summary.observedShards}/${expectedShards}`,
  cases:`${completedCases}/160`,
  states,
  functionStates,
  functionCount,
  clusterWallMs,
  functionsPerSecond:summary.distributedPerformance.functionsPerSecond,
}, null, 2));
process.exitCode = summary.complete ? 0 : 2;
