// A separate physical reference: never overwrite the original capture or target.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const PHASE_PATH='patches/splatoon3/runtime/main-weapon-catalog.mjs';
export const PHASE_COMMIT='f41a35346caff97b5eed55a953c7893b344acf09';
export const INTEGRATED_PHASE_COMMIT='72277deadd4e2f36df9bb1fecc56badcd15cfdd0';
export const PHASE_INSERT=`    }else if(descriptor.key==='slosh'&&descriptor.sloshFall){
      const splash=descriptor.packet.SplashAndSplashWallHitSpawnPrm?.SplashParam?.[0]?.SpawnParam;
      const min=splash?.FirstSplashRateForLengthMin,max=splash?.FirstSplashRateForLengthMax;
      // Slosher first-distance fields are rates of SpawnBetweenLength, not
      // Shooter SpawnNearestLength. Reuse the admitted glob seed, as the
      // native Slosher resolver does, without changing the random budget.
      if(Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min)
        p.catalog.nextSplash=lerp(min,max,clamp(p.seed))*descriptor.splashSpacing;
`;
const ANCHOR='      p.catalog.nextSplash=splash?.targetLength??0;p.catalog.splashTravel=0;\n';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
export function phaseRoute(event,repository,eventName){
  const p=event.pull_request;
  return eventName==='pull_request'&&repository==='rhgrive3/actions'&&event.number===1895&&p?.number===1895&&
    p.base?.ref==='main'&&p.base?.repo?.full_name===repository&&p.head?.repo?.full_name===repository&&
    p.head?.ref==='integrate/inkwave-bug-batch-20261026-charge-owner';
}
export function insertPhase(source){
  assert.equal(source.split(ANCHOR).length,2,'one reviewed insertion anchor');
  assert.ok(!source.includes(PHASE_INSERT),'original must retain the old phase');
  return source.replace(ANCHOR,ANCHOR+PHASE_INSERT);
}
function inventory(root,rows){
  return rows.map(row=>{
    const file=path.join(root,row.path),stat=fs.lstatSync(file);
    assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'regular reference input: '+row.path);
    const data=fs.readFileSync(file),blob=createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    return {...row,blob,sha256:sha256(data)};
  });
}
export function preparePhaseControl({baseline,derived,candidate,event,repository,eventName}){
  assert.ok(phaseRoute(event,repository,eventName),'only the reviewed PR1895 source pair');
  const base=event.pull_request.base.sha,head=event.pull_request.head.sha;
  for(const value of [base,head])assert.match(value,/^[a-f0-9]{40}$/,'immutable event source SHA');
  baseline=fs.realpathSync(baseline);candidate=fs.realpathSync(candidate);derived=path.resolve(derived);
  assert.equal(git(baseline,['rev-parse','HEAD']).trim(),base,'actual CI baseline SHA');
  assert.equal(git(candidate,['rev-parse','HEAD']).trim(),head,'actual candidate SHA');
  assert.equal(git(baseline,['status','--porcelain','--untracked-files=normal']).trim(),'','pristine baseline');
  assert.ok(!fs.existsSync(derived)&&!derived.startsWith(baseline+path.sep)&&!baseline.startsWith(derived+path.sep),'new separate control directory');
  const rows=git(baseline,['ls-tree','-rz','--full-tree','HEAD']).split('\0').filter(Boolean).map(line=>{
    const m=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(m,'regular tracked Git source');return {path:m[3],mode:m[1],gitBlob:m[2]};
  });
  const before=inventory(baseline,rows);
  for(const row of before)assert.equal(row.blob,row.gitBlob,'pristine tracked bytes: '+row.path);
  const source=fs.readFileSync(path.join(baseline,PHASE_PATH),'utf8'),fixed=insertPhase(source);
  const target=fs.readFileSync(path.join(candidate,PHASE_PATH),'utf8');
  assert.equal(target.split(PHASE_INSERT).length,2,'exact accepted phase implementation in target');
  const correction=git(candidate,['show',INTEGRATED_PHASE_COMMIT+':'+PHASE_PATH]);
  const parent=git(candidate,['show',INTEGRATED_PHASE_COMMIT+'^:'+PHASE_PATH]);
  assert.equal(insertPhase(parent),correction,'eight-line patch identity versus accepted immutable commit');
  const executionSources={};
  for(const relative of ['scripts/check-inkwave-projectile-visuals.mjs','scripts/lib/inkwave-slosher-phase-observer.mjs','scripts/verify-inkwave-slosher-phase-captures.mjs']){
    const data=fs.readFileSync(path.join(candidate,relative));assert.equal(sha256(data),sha256(git(candidate,['show',head+':'+relative])),'committed acceptance execution body: '+relative);executionSources[relative]=sha256(data);
  }
  fs.mkdirSync(derived,{recursive:true});
  for(const row of rows){const dest=path.join(derived,row.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(baseline,row.path),dest);fs.chmodSync(dest,row.mode==='100755'?0o755:0o644);}
  fs.writeFileSync(path.join(derived,PHASE_PATH),fixed);
  const after=inventory(derived,rows),changed=after.filter((row,i)=>row.sha256!==before[i].sha256).map(r=>r.path);
  assert.deepEqual(changed,[PHASE_PATH],'only the phase source differs');
  assert.deepEqual(inventory(baseline,rows),before,'original unchanged');
  return {schema:1,kind:'source-backed-slosher-phase-control',publicMainEquivalent:false,baseSha:base,targetSha:head,
    correctionCommit:PHASE_COMMIT,integratedCorrectionCommit:INTEGRATED_PHASE_COMMIT,patchSha256:sha256(PHASE_INSERT),
    patchVerifiedAgainst:INTEGRATED_PHASE_COMMIT,
    targetPhaseSourceSha256:sha256(target),
    baseline,derived,harnessCheckoutSha:head,derivedSourceCommit:null,sourceFiles:rows.length,changedPaths:changed,executionSources,
    originalInventory:before,controlInventory:after,source:{version:'11.3.0',commit:'7280ff9cde8bb1c5dcef46c700c326471584d2e6',
      actor:'WeaponSlosherWashtub',sha256:'d7b73f92338b9e2fa320092b56ca768c395d9a26ec1f0e90ccf1be2dc0fbcf1b',
      unit:0,order:0,splashArray:0,rateMin:.5,rateMax:.55,spacing:3.1,count:7,width:1.344,depth:2,drawRadius:.1}};
}
export function verifyPhaseBuilds(receipt,original,control){
  const a=original.files,b=control.files,key='patch/runtime/main-weapon-catalog.mjs';
  assert.ok(a&&b&&a[key]&&b[key],'complete original/control build inputs');
  const expected={...a,[key]:receipt.controlInventory.find(r=>r.path===PHASE_PATH).sha256};
  assert.equal(a[key],receipt.originalInventory.find(r=>r.path===PHASE_PATH).sha256,'original source binding');
  assert.deepEqual(b,expected,'all other production build inputs stay exact');
  assert.notEqual(original.contentHash,control.contentHash,'distinct reference build identity');
  return {original:original.contentHash,control:control.contentHash,inputs:Object.keys(a).length,changedInputs:[key]};
}
export function verifyPhaseTrees(receipt){
  assert.deepEqual(inventory(receipt.baseline,receipt.originalInventory.map(({path,mode,gitBlob})=>({path,mode,gitBlob}))),receipt.originalInventory,'original inputs remain pristine');
  assert.deepEqual(inventory(receipt.derived,receipt.controlInventory.map(({path,mode,gitBlob})=>({path,mode,gitBlob}))),receipt.controlInventory,'control input bytes remain exact');
}
