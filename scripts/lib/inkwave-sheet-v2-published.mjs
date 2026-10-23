// Structured runner/API binding only. Local fixtures cannot authenticate hosting.
import assert from 'node:assert/strict';
export const V2_REPOSITORY='rhgrive3/actions';
export const V2_CONTROLLER_REF='refs/heads/inkwave/sheet-v2-verification-controller-20261023';
export const V2_CANDIDATE_REF='refs/heads/inkwave/integration-sheet-birth-v2-20261023';
export function validateControllerBinding(event,heads,{environment=process.env,base,head,verifierSha}={}) {
  assert.equal(environment.GITHUB_ACTIONS,'true','actual Actions runner input required');
  assert.equal(environment.GITHUB_EVENT_NAME,'push','controller is a push workflow, not a forged PR event');
  assert.equal(environment.GITHUB_REPOSITORY,V2_REPOSITORY);
  assert.equal(environment.GITHUB_REF,V2_CONTROLLER_REF);
  assert.match(environment.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
  assert.match(environment.GITHUB_RUN_ID||'',/^\d+$/);
  assert.equal(event.repository?.full_name,V2_REPOSITORY);
  assert.equal(event.ref,V2_CONTROLLER_REF);assert.equal(event.deleted,false);
  assert.equal(event.after,environment.GITHUB_SHA);assert.equal(event.head_commit?.id,event.after);
  assert.equal(heads.schema,1);assert.equal(heads.repository,V2_REPOSITORY);
  assert.equal(heads.verifierSha,verifierSha);assert.equal(heads.controllerSha,event.after);
  assert.equal(heads.runId,environment.GITHUB_RUN_ID);
  assert.equal(heads.baseRef,'refs/heads/main');assert.equal(heads.candidateRef,V2_CANDIDATE_REF);
  for(const phase of ['before','after']) {
    const row=heads[phase];assert.equal(row?.phase,phase,'both published-head observations required');
    assert.ok(Number.isFinite(Date.parse(row.fetchedAt)),'recorded API observation time');
    for(const [key,ref,sha]of [['main','refs/heads/main',base],['candidate',V2_CANDIDATE_REF,head]]) {
      assert.equal(row[key]?.ref,ref,'exact API reference, never a prefix match');
      assert.equal(row[key]?.object?.type,'commit');assert.equal(row[key]?.object?.sha,sha,'published ref moved outside pinned pair');
    }
  }
  return {controllerSha:event.after,verifierSha,runId:heads.runId,candidateRef:V2_CANDIDATE_REF,
    limitation:'Runner/API input fields are bound; local fixtures cannot authenticate a real hosted run.'};
}
