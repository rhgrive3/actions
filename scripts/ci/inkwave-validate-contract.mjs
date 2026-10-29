// Validate the workflow graph as YAML, independently of formatting and needs order.
// Ruby/Psych is already required by the admission preflight YAML integrity gate.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const VALIDATE_REQUIRED_JOBS = Object.freeze([
  'admission_preflight', 'build_site', 'validate_core', 'patch_tests',
  'circleci_offload_gate', 'browser', 'seven_claims', 'resource_paint_continuation',
]);
export const VALIDATE_RESULT_ENV = Object.freeze({
  admission_preflight:'PREFLIGHT_RESULT', build_site:'BUILD_RESULT',
  validate_core:'CORE_RESULT', patch_tests:'PATCH_RESULT',
  circleci_offload_gate:'CIRCLECI_RESULT', browser:'BROWSER_RESULT',
  seven_claims:'SEVEN_RESULT', resource_paint_continuation:'RESOURCE_RESULT',
});

const checker = fileURLToPath(new URL('./check-workflow-yaml.rb', import.meta.url));
const parser = `
require 'json'
require ARGV.fetch(0)
source = STDIN.read
stream = Psych.parse_stream(source)
abort 'expected exactly one YAML mapping document' unless stream.children.length == 1 && stream.children.first.root.is_a?(Psych::Nodes::Mapping)
errors = []
INKWAVEWorkflowYAML.visit(stream, '<Validate workflow>', errors)
abort errors.join("\\n") unless errors.empty?
puts JSON.generate(Psych.safe_load(source, permitted_classes: [], permitted_symbols: [], aliases: false))
`;
export function parseValidateWorkflow(source) {
  const result = spawnSync('ruby', ['-e', parser, checker], {
    input:source, encoding:'utf8', maxBuffer:8 * 1024 * 1024, timeout:10000,
  });
  if (result.error || result.status !== 0)
    throw Error('Validate workflow YAML: ' + (result.error?.message || result.stderr.trim()));
  const parsed = JSON.parse(result.stdout);
  if (!parsed?.jobs || typeof parsed.jobs !== 'object' || Array.isArray(parsed.jobs))
    throw Error('Validate workflow has no jobs mapping');
  return parsed;
}

function requireContract(ok, message) { if (!ok) throw Error('Validate workflow contract: ' + message); }
function needs(job, name) {
  const values = job.needs === undefined ? [] : typeof job.needs === 'string' ? [job.needs] : job.needs;
  requireContract(Array.isArray(values) && values.every(v => typeof v === 'string') && new Set(values).size === values.length, 'invalid needs for ' + name);
  return values;
}

export function assertValidateWorkflowContract(source) {
  const {jobs} = parseValidateWorkflow(source);
  for (const name of [...VALIDATE_REQUIRED_JOBS, 'validate'])
    requireContract(jobs[name] && typeof jobs[name] === 'object', 'missing job ' + name);
  function ancestors(name, seen = new Set()) {
    requireContract(!seen.has(name), 'dependency cycle at ' + name);
    const branch = new Set(seen).add(name), result = new Set();
    for (const parent of needs(jobs[name], name)) {
      requireContract(!!jobs[parent], 'missing dependency ' + parent);
      result.add(parent);
      for (const ancestor of ancestors(parent, branch)) result.add(ancestor);
    }
    return result;
  }
  for (const name of VALIDATE_REQUIRED_JOBS) {
    const job = jobs[name];
    requireContract(job['continue-on-error'] === undefined || job['continue-on-error'] === false, name + ' must fail closed');
    requireContract(!/\b(?:always|failure|cancelled)\s*\(/.test(String(job.if || '')), name + ' bypasses successful dependencies');
    const parents = ancestors(name);
    if (name !== 'admission_preflight') requireContract(parents.has('admission_preflight'), name + ' must require admission_preflight success');
    if (!['admission_preflight', 'build_site'].includes(name)) requireContract(parents.has('build_site'), name + ' must require the admitted build');
  }
  const gate = jobs.validate;
  const finalNeeds = needs(gate, 'validate');
  requireContract(finalNeeds.length === VALIDATE_REQUIRED_JOBS.length && VALIDATE_REQUIRED_JOBS.every(name => finalNeeds.includes(name)), 'final gate must collect every required job');
  requireContract(/\balways\s*\(\)/.test(String(gate.if)), 'final gate must observe failed or skipped dependencies');
  requireContract(gate['continue-on-error'] === undefined || gate['continue-on-error'] === false, 'final gate must fail closed');
  const steps = (gate.steps || []).filter(step => step.name === 'Require every source and patch regression to pass');
  requireContract(steps.length === 1, 'final result checker must have exactly one owner');
  const step = steps[0];
  requireContract(step.if === undefined && (step['continue-on-error'] === undefined || step['continue-on-error'] === false), 'final result checker cannot be conditional or optional');
  requireContract(typeof step.run === 'string', 'missing final result checks');
  for (const [name, variable] of Object.entries(VALIDATE_RESULT_ENV)) {
    requireContract(step.env?.[variable]?.replace(/\s+/g, '') === '${{needs.' + name + '.result}}', 'unbound result for ' + name);
    requireContract(step.run.includes('test "$' + variable + '" = success'), 'missing success check for ' + name);
  }
  requireContract(step.env?.CONTRACTS_ONLY?.replace(/\s+/g, '') === '${{needs.build_site.outputs.contracts_only}}', 'scope result must come from the admitted build');
  return {jobs, gate, step, finalNeeds};
}
