import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

export function interleavedWarmupOrder(runs) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 16) throw Error('Invalid warmup run count');
  const order = runs % 2 ? ['a', 'b'] : [];
  for (let pair = 0; pair < Math.floor(runs / 2); pair++) order.push('a', 'b', 'b', 'a');
  return order;
}

export function expandCpuList(value) {
  if (typeof value !== 'string' || !/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(value)) throw Error('Invalid CPU list: ' + value);
  const cpus = new Set();
  for (const part of value.split(',')) {
    const [lo, hi = lo] = part.split('-').map(Number);
    if (lo > hi || hi > 65535) throw Error('Invalid CPU range: ' + part);
    for (let cpu = lo; cpu <= hi; cpu++) cpus.add(cpu);
  }
  return [...cpus].sort((a, b) => a - b);
}

export function affinityPlan(gpuList, workers, allowed) {
  const allowedCpus = expandCpuList(allowed), gpuCpus = expandCpuList(gpuList), workerCpus = expandCpuList(workers);
  if (gpuCpus.some(cpu => !allowedCpus.includes(cpu))) throw Error('GPU CPUs must be inside the original allowed CPU set');
  if (workerCpus.some(cpu => gpuCpus.includes(cpu))) throw Error('GPU and worker CPUs must be disjoint');
  if (workerCpus.some(cpu => !allowedCpus.includes(cpu))) throw Error('Worker CPUs must be inside the original allowed CPU set');
  return {gpuCpus, workerCpus, originalAllowedCpus: allowedCpus};
}

export function affinityCapacity(plan, cpuMax) {
  const [quota, period] = String(cpuMax).trim().split(/\s+/);
  const assignedCpus = plan.gpuCpus.length + plan.workerCpus.length;
  if (quota === 'max') return {assignedCpus, quotaCores: null, withinQuota: true};
  const quotaCores = Number(quota) / Number(period);
  if (!(Number.isFinite(quotaCores) && quotaCores > 0)) throw Error('Readable cgroup v2 CPU quota required');
  if (assignedCpus > quotaCores) throw Error('Assigned GPU and worker CPUs exceed CPU quota capacity');
  return {assignedCpus, quotaCores, withinQuota: true};
}

const field = (status, key) => status.split('\n').find(line => line.startsWith(key + ':'))?.split(':').slice(1).join(':').trim();

export function readProcessThreads(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid process PID');
  const threads = [];
  for (const entry of fs.readdirSync('/proc/' + pid + '/task')) {
    try {
      const status = fs.readFileSync('/proc/' + pid + '/task/' + entry + '/status', 'utf8');
      threads.push({tid: Number(entry), name: field(status, 'Name'), allowedCpus: expandCpuList(field(status, 'Cpus_allowed_list'))});
    } catch (error) {
      // A dead thread no longer owns CPU resources. Other failures are errors.
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  if (!threads.some(thread => thread.tid === pid)) throw Error('Process main thread disappeared: ' + pid);
  return threads.sort((a, b) => a.tid - b.tid);
}

function assignProcess(pid, cpus) {
  const command = ['--all-tasks', '--pid', '--cpu-list', cpus.join(','), String(pid)];
  return {pid, cpus, command: ['taskset', ...command], output: execFileSync('taskset', command, {encoding: 'utf8', maxBuffer: 1024 * 1024}).trim()};
}

export function configureHarnessAffinity(gpuCpus, workers) {
  const before = readProcessThreads(process.pid), main = before.find(thread => thread.tid === process.pid);
  const plan = affinityPlan(gpuCpus, workers, main.allowedCpus.join(','));
  const capacity = affinityCapacity(plan, fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8'));
  const assignment = assignProcess(process.pid, plan.workerCpus), after = readProcessThreads(process.pid);
  if (after.some(thread => thread.allowedCpus.some(cpu => !plan.workerCpus.includes(cpu)))) throw Error('Harness affinity did not apply to every thread');
  return {plan, capacity, harness: {pid: process.pid, before, assignment, after}};
}

async function browserProcesses(cdp) {
  const {processInfo} = await cdp.send('SystemInfo.getProcessInfo');
  return processInfo.map(process => ({pid: process.id, type: process.type, cpuTimeSeconds: process.cpuTime}));
}
const isGpu = process => /^gpu(?:-process)?$/i.test(process.type);

export function affinityViolations(snapshot, plan, expectedGpuPid) {
  const issues = [], gpu = snapshot.processes.filter(isGpu);
  if (gpu.length !== 1) issues.push('Expected exactly one GPU process');
  if (gpu[0]?.pid !== expectedGpuPid) issues.push('GPU process owner changed');
  for (const process of snapshot.processes) for (const thread of process.threads) {
    const allowed = isGpu(process) ? plan.gpuCpus : plan.workerCpus;
    if (!thread.allowedCpus.length || thread.allowedCpus.some(cpu => !allowed.includes(cpu)))
      issues.push(process.type + ' PID ' + process.pid + ' TID ' + thread.tid + ' has unexpected CPUs ' + thread.allowedCpus.join(','));
  }
  return issues;
}

export async function inspectBrowserAffinity(controller) {
  try {
    const processes = await browserProcesses(controller.cdp);
    const snapshot = {observedAt: new Date().toISOString(), processes: processes.map(process => ({...process, threads: readProcessThreads(process.pid)}))};
    const violations = affinityViolations(snapshot, controller.plan, controller.gpuPid);
    return {status: violations.length ? 'failed' : 'verified', snapshot, violations};
  } catch (error) {return {status: 'failed', observedAt: new Date().toISOString(), error: String(error), violations: ['Could not verify every browser thread']};}
}

export async function configureBrowserAffinity(browser, setup) {
  const cdp = await browser.newBrowserCDPSession(), assignments = [];
  let processes = [];
  // GPU initialization is outside game loading and all timing windows.
  for (let attempt = 0; attempt < 50; attempt++) {
    processes = await browserProcesses(cdp);
    if (processes.some(isGpu)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const gpu = processes.filter(isGpu);
  if (gpu.length !== 1) throw Error('A single GPU process must exist before game page creation');
  const controller = {cdp, plan: setup.plan, gpuPid: gpu[0].pid};
  // Two predetermined startup passes cover threads born during GPU startup.
  // No affinity assignment is made after game page creation.
  for (let pass = 0; pass < 2; pass++) {
    const current = await browserProcesses(cdp);
    if (current.filter(isGpu).length !== 1 || current.find(isGpu).pid !== controller.gpuPid) throw Error('GPU owner changed during initial affinity setup');
    for (const process of current) assignments.push({pass, type: process.type, ...assignProcess(process.pid, isGpu(process) ? setup.plan.gpuCpus : setup.plan.workerCpus)});
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const verification = await inspectBrowserAffinity(controller);
  if (verification.status !== 'verified') throw Error('Initial browser affinity failed: ' + JSON.stringify(verification));
  return {controller, evidence: {...setup, gpuPid: controller.gpuPid, assignments, verification}};
}
