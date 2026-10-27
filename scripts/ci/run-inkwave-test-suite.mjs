#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const TEST_SUITES = JSON.parse(fs.readFileSync(new URL('./inkwave-test-suites.json', import.meta.url), 'utf8'));

// Workflow contracts inspect the effective commands so extraction into a named
// suite does not require weakening existing selection, flag or job-digest guards.
// Only an exact runner invocation is expanded; altered commands stay visible.
export function expandTestSuiteSteps(workflow, suites = TEST_SUITES) {
  return workflow.replace(/^        run: node scripts\/ci\/run-inkwave-test-suite\.mjs ([a-z-]+)$/gm, (_, name) => {
    if (!Object.hasOwn(suites, name)) throw Error(`Unknown workflow test suite: ${name}`);
    const commands = suites[name].steps.map(step => `${step.program} ${step.args.join(' ')}`);
    if (commands.length === 1) return `        run: ${commands[0]}`;
    return '        run: |\n' + commands.map(command => `          ${command}`).join('\n');
  });
}

function expandFile(argument, root) {
  if (!argument.includes('*') || !argument.endsWith('.test.mjs')) return [argument];
  if (!/^[\w/-]+\/\*\.test\.mjs$/.test(argument)) throw Error(`Unsupported test glob: ${argument}`);
  const directory = argument.slice(0, argument.lastIndexOf('/'));
  const files = fs.readdirSync(path.join(root, directory), {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map(entry => `${directory}/${entry.name}`).sort();
  if (!files.length) throw Error(`Empty test glob: ${argument}`);
  return files;
}

// Preflight the whole suite before starting a child. Missing inputs and empty
// discovery must fail rather than silently report a smaller suite as passing.
export function planTestSuite(name, {root = ROOT, suites = TEST_SUITES} = {}) {
  if (!Object.hasOwn(suites, name)) throw Error(`Unknown test suite: ${name}`);
  const suite = suites[name];
  if (!Array.isArray(suite.steps) || !suite.steps.length) throw Error(`Empty test suite: ${name}`);
  const seen = new Set();
  return suite.steps.map(step => {
    if (!['node', 'python3'].includes(step.program) || !Array.isArray(step.args) || !step.args.length
      || step.args.some(arg => typeof arg !== 'string' || !arg || /[\r\n\0]/.test(arg)))
      throw Error(`Invalid test command: ${name}`);
    const args = step.args.flatMap(arg => expandFile(arg, root));
    const entries = args.filter(arg => !arg.startsWith('-') && /\.(?:mjs|js)$/.test(arg));
    if (step.program === 'node' && !entries.length)
      throw Error(`Node suite requires explicit test files or a script: ${name}`);
    for (const arg of entries) {
      if (path.isAbsolute(arg) || arg.split('/').includes('..') || !fs.statSync(path.join(root, arg)).isFile())
        throw Error(`Missing or invalid test file: ${arg}`);
      if (seen.has(arg)) throw Error(`Duplicate test file in ${name}: ${arg}`);
      seen.add(arg);
    }
    if (step.program === 'python3' && args.includes('discover')) {
      const directory = args[args.indexOf('-s') + 1];
      const pattern = args[args.indexOf('-p') + 1];
      if (!args.includes('-s') || !args.includes('-p') || !directory || !pattern
          || path.isAbsolute(directory) || directory.split('/').includes('..'))
        throw Error(`Python discovery requires an explicit directory and pattern: ${name}`);
      const matcher = new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      if (!fs.readdirSync(path.join(root, directory), {withFileTypes: true}).some(entry => entry.isFile() && matcher.test(entry.name)))
        throw Error(`Empty Python test discovery: ${name}`);
    }
    return {program: step.program, args};
  });
}

export function runTestSuite(name, {root = ROOT, suites = TEST_SUITES, spawn = spawnSync, log = console.log} = {}) {
  const commands = planTestSuite(name, {root, suites});
  for (const command of commands) {
    const files = command.args.filter(arg => arg.endsWith('.test.mjs'));
    const summary = files.length > 10
      ? command.args.filter(arg => !files.includes(arg)).join(' ') + ` (${files.length} test files; --dry-run ${name} lists inputs)`
      : command.args.join(' ');
    log(`[${name}] ${command.program} ${summary}`);
    const result = spawn(command.program === 'node' ? process.execPath : command.program, command.args,
      {cwd: root, env: process.env, stdio: 'inherit'});
    if (result.error || result.signal || result.status !== 0) {
      if (result.error) log(result.error.message);
      if (result.signal) log(`Test process terminated by ${result.signal}`);
      return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  return 0;
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--list') {
    for (const name of Object.keys(TEST_SUITES)) {
      const commands = planTestSuite(name);
      console.log(`${name}: ${commands.length} command(s), ${commands.flatMap(x => x.args).filter(x => x.endsWith('.test.mjs')).length} Node test file(s)`);
    }
    return 0;
  }
  if (args.length === 2 && args[0] === '--dry-run') {
    console.log(JSON.stringify(planTestSuite(args[1]), null, 2));
    return 0;
  }
  if (args.length !== 1 || args[0].startsWith('-')) throw Error('Usage: run-inkwave-test-suite.mjs <suite> | --list | --dry-run <suite>');
  return runTestSuite(args[0]);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
