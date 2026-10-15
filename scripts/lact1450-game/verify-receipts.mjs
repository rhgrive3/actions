import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export function verifyServedArtifact(bytes,expected){assert.match(expected||'',/^[a-f0-9]{64}$/);const hash=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(hash,expected,'frozen served artifact identity');return hash;}
const near=(a,b)=>assert(Number.isFinite(a)&&Math.abs(a-b)<1e-7);
export function verifyReceipt(report,binding,baseline=false){
 assert.deepEqual(report.serverErrors,[]);
 assert.equal(report.inputHash,binding.inputHash);assert.equal(report.contentHash,binding.contentHash);
 for(const [path,sha256]of Object.entries(binding.requiredServed))assert(report.served.some(x=>x.path===path&&x.sha256===sha256),'required served artifact '+path);
 assert.equal(report.results.length,1);assert.equal(report.results[0].engine,'chromium');const g=report.results[0].lactGame;assert.deepEqual(g.errors,[]);
 if(baseline){assert.equal(g.status,'failed');assert.equal(g.cases.length,1);const c=g.cases[0];assert.equal(c.id,'s3-stringer-short');assert.equal(c.sourceActor,'WeaponStringerShort');assert.equal(c.holdTicks,30);assert.equal(c.expectKeep,true);assert.equal(c.status,'failed');assert.deepEqual(c.failure,{message:'LACT Game: stored charge before expiry',phase:'hold',held:1,form:'squid',charge:0,activePaid:0,stored:null});near(c.paid,6.5);near(c.debit,6.5);assert.equal(c.expectedCost,6.5);assert.equal(c.births.length,0);assert.equal(c.restored,true);assert.equal(c.transitions.length,1);assert.equal(c.transitions[0].from,'charge');assert.equal(c.transitions[0].to,'hold');assert.equal(c.transitions[0].charge,1);near(c.transitions[0].paid,6.5);return {status:'expected-baseline-missing-keep',scope:'Actual paid full charge reached first squid tick; exact missing-keep failure only'};}
 assert.equal(g.status,'passed');assert.equal(g.cases.length,3);
 for(const [i,c]of g.cases.entries()){assert.equal(c.status,'passed');assert.equal(c.failure,null);assert.equal(c.restored,true);assert.equal(c.id,i===2?'s3-stringer-normal':'s3-stringer-short');assert.equal(c.holdTicks,i===1?75:30);assert.equal(c.expectKeep,i!==2);assert.equal(c.births.length,3);assert(c.births.every(b=>b.charge===1));assert(Number.isFinite(c.paid)&&c.paid>0);near(c.debit,c.paid*(i===0?1:2));if(i<2){near(c.paid,6.5);assert.equal(c.keepTicks,75);}}
 return {status:'passed',scope:'Actual controlled Game 60 Hz paid keep/expiry/explicit other-Stringer regression; no pixels, retail timing or hardware claim'};
}

export function requiredVersionedArtifacts(manifest,indexHTML){const revision=manifest.build.revision;assert.match(revision,/^[a-f0-9]{64}$/);const bases=[...indexHTML.matchAll(/<base\s+href="([^"]+)"\s*>/g)].map(m=>m[1]);assert.deepEqual(bases,['./_versions/'+revision+'/']);const pairs=['src/main.js','src/core/ctx.js','patches/splatoon3/runtime/main-weapon-catalog.mjs'].map(root=>{const versioned='_versions/'+revision+'/'+root;assert.match(manifest.artifacts[root],/^[a-f0-9]{64}$/);assert.equal(manifest.artifacts[versioned],manifest.artifacts[root]);return[versioned,manifest.artifacts[versioned]];});return Object.fromEntries(pairs);}
