import assert from 'node:assert/strict';
export function validateNoctPair(current,light){
 const finite=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
 for(const [role,result]of [['current',current],['light',light]]){
  assert.equal(result.role,role);assert.equal(result.frames.length,8);assert.equal(result.traces.length,4);
  for(const team of [0,1])for(const label of ['base',role]){
   const ts=result.traces.filter(x=>x.team===team&&x.role===label);assert.equal(ts.length,1);const t=ts[0];assert.deepEqual(t.moved,[true,true]);assert.ok(Number.isInteger(t.births)&&t.births>0);assert.equal(t.frames.length,120);
   for(let i=0;i<120;i++){const f=t.frames[i];assert.equal(f.tick,i);assert.ok(Number.isFinite(f.ink));assert.ok(Number.isInteger(f.births)&&f.births>=0);assert.ok(finite(f.sinceHand,2));assert.ok(Array.isArray(f.pose)&&f.pose.length>0&&f.pose.every(Number.isFinite));assert.equal(f.hands.length,2);for(const h of f.hands){assert.ok(finite(h.muzzle,3));assert.ok(h.matrices.length>1);for(const m of h.matrices)assert.ok(finite(m,16));}}
   for(const state of ['rest','firing']){const fs=result.frames.filter(x=>x.team===team&&x.role===label&&x.state===state);assert.equal(fs.length,1);const f=fs[0];assert.equal(f.id,label==='base'?'s3-maneuver-short':'s3-maneuver-short-02');assert.ok(finite(f.camera.position,3)&&finite(f.camera.quaternion,4));assert.equal(f.corners.length,8);for(const c of f.corners)assert.ok(finite(c,3)&&c.every(x=>x>=-1&&x<=1));assert.ok(f.triangles>0&&f.drawCalls>0);assert.ok(finite(f.steadyMs,12)&&f.steadyMs.every(x=>x>=0));assert.ok(Number.isFinite(f.constructionMs)&&f.constructionMs>=0&&Number.isFinite(f.firstRenderMs)&&f.firstRenderMs>=0);assert.match(f.png,/^data:image\/png;base64,.+/);if(label!=='base'){assert.equal(f.triangles,role==='current'?22196:15672);assert.equal(f.geometry.uniqueAttributeArrayBytes,role==='current'?579452:411428);}}
  }
 }
 assert.deepEqual(current.views,light.views,'same original camera in both graphs');
 for(const team of [0,1])for(const label of ['base','variant']){
  const a=current.traces.find(x=>x.team===team&&x.role===(label==='base'?'base':'current'));
  const b=light.traces.find(x=>x.team===team&&x.role===(label==='base'?'base':'light'));
  assert.deepEqual(a.frames,b.frames,'exact pose, hand matrices, muzzle, admitted shot cadence and ink');assert.equal(a.births,b.births);
  for(const state of ['rest','firing']){const a=current.frames.find(x=>x.team===team&&x.role===(label==='base'?'base':'current')&&x.state===state);const b=light.frames.find(x=>x.team===team&&x.role===(label==='base'?'base':'light')&&x.state===state);assert.deepEqual(a.camera,b.camera);assert.equal(a.drawCalls,b.drawCalls);if(label==='base'){assert.equal(a.triangles,b.triangles);assert.deepEqual(a.geometry,b.geometry);}}
 }
 return {accepted:true,images:12,siteLocalImages:16,traceFrames:960,scope:'native component comparison; timing includes renderer and full RGBA readback; bytes are unique typed-array lengths, not measured GPU allocation'};
}

export function validateReference(reference,plan){assert.equal(reference.sourceSha,plan.pairedCurrentHead,'reference source head');assert.equal(reference.sourceTree,plan.pairedCurrentTree,'reference source tree');assert.equal(reference.buildBinding.registrySHA256,plan.pairedCurrentRegistrySHA256,'reference emitted registry');assert.equal(reference.capture.role,'current');assert.deepEqual(reference.errors,[]);assert.deepEqual(reference.networkFailures,[]);return reference;}
