import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { installProjectileCaptureProjection } from '../lib/inkwave-projectile-capture-projection.mjs';
import {restoreBeforeSlosherPhaseWorkflow} from '../lib/inkwave-slosher-phase-workflow.mjs';
function fixture(fov = 60) {
  const camera = { fov, aspect: 16 / 9, zoom: 1, projectionMatrix: { elements: Array(16).fill(0) },
    updateProjectionMatrix() {
      const y = this.zoom / Math.tan(this.fov * Math.PI / 360);
      this.projectionMatrix.elements[0] = y / this.aspect;
      this.projectionMatrix.elements[5] = y;
    } };
  camera.updateProjectionMatrix();
  const context = { window: { __G: { camera } }, innerWidth: 1280, innerHeight: 720 };
  vm.runInNewContext('(' + installProjectileCaptureProjection.toString() + ')()', context);
  return { camera, context, set: context.window.__iwSetProjectileCaptureProjection,
    check: context.window.__iwAssertProjectileCaptureProjection };
}
test('inherited 60 and 55 degree cameras become the same actual humanoid capture projection', () => {
  const before = fixture(60), after = fixture(55);
  assert.throws(() => before.check('inherited'), /actual vertical FOV 60/);
  before.set(); after.set();
  assert.equal(before.camera.fov, 55);
  assert.deepEqual(before.camera.projectionMatrix, after.camera.projectionMatrix);
  assert.deepEqual(JSON.parse(JSON.stringify(before.check('render'))), { verticalFov: 55, aspect: 16 / 9, zoom: 1 });
});
test('assertion rejects actual camera divergence without repairing it or trusting a receipt', () => {
  const f = fixture(); f.set();
  const priorReceipt = { fov: 55 };
  f.camera.fov = 60; f.camera.updateProjectionMatrix();
  assert.throws(() => f.check('after-render'), /diverged at after-render/);
  assert.equal(f.camera.fov, 60); assert.equal(priorReceipt.fov, 55);
});
test('stale projection matrix fails even when actual fov property still says 55', () => {
  const f = fixture(); f.set(); f.camera.projectionMatrix.elements[5] = 1;
  assert.throws(() => f.check('before-screenshot'), /diverged/);
});
for (const [field, value] of [['fov', NaN], ['aspect', 1], ['zoom', 2]]) {
  test('rejects invalid actual ' + field, () => { const f = fixture(); f.set(); f.camera[field] = value; assert.throws(() => f.check('guard'), /diverged/); });
}
test('rejects off-center and unsupported viewport projections', () => {
  const f = fixture(); f.set(); f.camera.projectionMatrix.elements[8] = 0.1;
  assert.throws(() => f.check('offset'), /diverged/);
  const narrow = fixture(); narrow.context.innerWidth = 720;
  assert.throws(() => narrow.set(), /diverged/);
});
test('driver sets camera fixture and brackets real render and image boundaries without changing receipts', () => {
  const source = fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs', import.meta.url), 'utf8');
  assert.match(source, /page\.addInitScript\(installProjectileCaptureProjection\)/);
  assert.match(source, /__iwSetProjectileCaptureProjection\(\);\s*cam\.aspect/);
  assert.match(source, /__iwAssertProjectileCaptureProjection\('before-render'\);\s*G\.game\.R\.render\(\);\s*window\.__iwAssertProjectileCaptureProjection\('after-render'\)/);
  for (const phase of ['before-screenshot', 'after-screenshot', 'before-crop', 'after-crop']) assert.ok(source.includes(`__iwAssertProjectileCaptureProjection('${phase}')`));
  assert.match(source, /aim: sample\.aim, fov: cam\.fov/);
  assert.match(source, /fov: camera\.fov, actorInkHex/);
});
const workflow = fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml', import.meta.url), 'utf8');
const PHASE_ROUTE="github.event_name == 'pull_request' && github.repository == 'rhgrive3/actions' && github.event.pull_request.number == 1895 && github.event.pull_request.base.ref == 'main' && github.event.pull_request.head.repo.full_name == github.repository && github.head_ref == 'integrate/inkwave-bug-batch-20261026-charge-owner'";
function namedStep(text,name){
  const marker='      - name: '+name+'\n';assert.equal(text.split(marker).length,2,'one required step '+name);
  const begin=text.indexOf(marker),end=text.indexOf('\n      - ',begin+marker.length);
  return text.slice(begin,end<0?text.length:end+1);
}
function verifyProjectionWorkflow(text){
  // Use the existing exact byte seal only as admission. Never replace the
  // workflow with historical text: every assertion below inspects current
  // executable conditions and commands, including the alternate strict route.
  restoreBeforeSlosherPhaseWorkflow(text);
  const checkedStep=(name,condition)=>{
    const step=namedStep(text,name),line='        if: ${{ '+condition+' }}\n';
    assert.equal(step.split(line).length,2,'exact permitted condition for '+name);
    assert.doesNotMatch(step.replace(line,''),/--admit-camera-epoch|CAMERA_EPOCH|continue-on-error|if:/,'no second, unknown or tolerance-relaxing route');
    return step;
  };
  const direct=checkedStep('Verify exact paired native physical states, firing workloads and image hashes','!('+PHASE_ROUTE+')');
  assert.match(direct,/compare-inkwave-projectile-captures\.py --before \.ci-scratch\/projectile-visuals\/before --after \.ci-scratch\/projectile-visuals\/after/);
  assert.match(direct,/--require-complete\s*$/);
  const phase=checkedStep('Preserve original failure and require full strict control-to-target equality',PHASE_ROUTE);
  assert.match(phase,/run: node scripts\/verify-inkwave-slosher-phase-captures\.mjs --original \.ci-scratch\/projectile-visuals\/before --control \.ci-scratch\/projectile-visuals\/phase-control --target \.ci-scratch\/projectile-visuals\/after --receipt \.ci-scratch\/projectile-visuals\/phase-control\/source-control\.json --out \.ci-scratch\/projectile-visuals\/phase-contract\s*$/);
  const download=checkedStep('Retrieve independent phase-only control without replacing original captures',PHASE_ROUTE);
  assert.ok(download.includes('name: projectile-capture-phase-control-${{ github.event.pull_request.head.sha || github.sha }}\n'));
  assert.ok(download.includes('path: .ci-scratch/projectile-visuals/phase-control\n'));
  const include='        include: ${{ '+PHASE_ROUTE+' && fromJSON(\'[{"side":"phase-control"}]\') || fromJSON(\'[]\') }}\n';
  assert.equal(text.split(include).length,2,'required exact third capture lane');
  assert.ok(text.includes('        side: [before, after]\n'),'both original capture lanes remain');
  for(const [name,side,site,mode] of [
    ['Capture native reference, not necessarily untouched public main','before','baseline','baseline'],
    ['Capture candidate native game including desktop and mobile workloads','after','projectiles','candidate'],
    ['Capture all 52 phase-control views and full native workloads','phase-control','phase-control','baseline'],
  ]){
    const step=checkedStep(name,"matrix.side == '"+side+"'");
    assert.ok(step.includes('run: node scripts/check-inkwave-projectile-visuals.mjs --site .built-site/'+site+' --evidence-dir .ci-scratch/projectile-visuals/'+side+' --mode '+mode+'\n'),'required capture command '+side);
  }
  assert.match(text,/  compare:\n    name: Compare all 52 original native captures\n    needs: capture\n/,'comparison still requires all capture lanes');
  return true;
}
test('CI compares the same canonical projection with complete evidence and no historical FOV normalization',()=>{
  assert.equal(verifyProjectionWorkflow(workflow),true);
});
test('phase exception cannot remove, misroute, skip or weaken either required comparison or capture lane',()=>{
  const condition='        if: ${{ !('+PHASE_ROUTE+') }}\n';
  const edits=[
    [condition,''],[condition,condition.replace('!(', '(')],[condition,'        if: ${{ always() }}\n'],
    ['github.event.pull_request.number == 1895','github.event.pull_request.number == 1896'],
    ["fromJSON('[{\"side\":\"phase-control\"}]')","fromJSON('[]')"],
    ["if: ${{ matrix.side == 'after' }}","if: ${{ false }}"],
    ['--target .ci-scratch/projectile-visuals/after','--target .ci-scratch/projectile-visuals/before'],
    ['--require-complete','--admit-camera-epoch'],
    ['    needs: capture\n','    needs: automatic_capture_route\n'],
    ['run: node scripts/verify-inkwave-slosher-phase-captures.mjs','run: true # node scripts/verify-inkwave-slosher-phase-captures.mjs'],
  ];
  for(const [from,to] of edits){const changed=workflow.replace(from,to);assert.notEqual(changed,workflow,from);assert.throws(()=>verifyProjectionWorkflow(changed));}
  for(const name of ['Capture candidate native game including desktop and mobile workloads','Preserve original failure and require full strict control-to-target equality']){
    const step=namedStep(workflow,name);assert.throws(()=>verifyProjectionWorkflow(workflow.replace(step,'')),'required '+name);
    const skipped=step.replace(/^        if: .*$/m,'        if: ${{ false }}');assert.notEqual(skipped,step);
    assert.throws(()=>verifyProjectionWorkflow(workflow.replace(step,skipped)),'cannot skip '+name);
  }
});
test('phase exception cannot authorize a changed sealed workflow hash',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'iw-projection-phase-seal-'));
  try{
    const lib=path.join(root,'scripts/lib'),fixtures=path.join(root,'scripts/fixtures');fs.mkdirSync(lib,{recursive:true});fs.mkdirSync(fixtures,{recursive:true});
    for(const file of ['inkwave-slosher-phase-workflow.mjs','inkwave-slosher-phase-control.mjs'])fs.copyFileSync(new URL('../lib/'+file,import.meta.url),path.join(lib,file));
    // The imported validator checks this separately sealed sparse-checkout epoch
    // before reaching the deliberately corrupted phase-only fixture. Copy the
    // original metadata byte-for-byte so only the intended seal is under test.
    fs.copyFileSync(new URL('../fixtures/inkwave-projectile-sparse-checkout-epoch-20261031.json',import.meta.url),path.join(fixtures,'inkwave-projectile-sparse-checkout-epoch-20261031.json'));
    const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/inkwave-slosher-phase-workflow-20261027.json',import.meta.url),'utf8'));fixture.afterSha256='0'.repeat(64);
    fs.writeFileSync(path.join(fixtures,'inkwave-slosher-phase-workflow-20261027.json'),JSON.stringify(fixture));
    const changed=await import(pathToFileURL(path.join(lib,'inkwave-slosher-phase-workflow.mjs')).href);
    assert.throws(()=>changed.restoreBeforeSlosherPhaseWorkflow(workflow),'changed seal must fail rather than hiding a route edit');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
