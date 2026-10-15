import assert from 'node:assert/strict';
export const labels=[...Array.from({length:60},(_,i)=>'fixed'+i),...Array.from({length:60},(_,i)=>'moving'+i),'hidden','return0','return1','external-repair','bots-off','bots-on','reenter'];
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function verify(r){
 assert.equal(r.status,'passed');assert.equal(r.restored,true);
 for(const k of ['input','natural','naturalObservation','frames'])assert.deepEqual(r[k]?.map(f=>f.label),labels,k);
 for(const frames of [r.input,r.natural]){
  for(const f of frames){assert.equal(typeof f.bots,'boolean');assert.equal(f.anchors.length,8);for(const a of f.anchors)if(a!==null){for(const k of ['x','y','s','vis'])assert(Number.isFinite(a[k]),k);assert.equal(typeof a.behind,'boolean');}}
  assert(frames[0].anchors.some(a=>a?.vis>.5));assert(frames[120].anchors.every(a=>a===null));
  for(let i=1;i<60;i++)assert.deepEqual(frames[i].anchors,frames[0].anchors);
  assert(new Set(frames.slice(60,120).map(f=>JSON.stringify(f.anchors))).size>1,'native moving projection actually changes');
  assert(frames[121].anchors.some(a=>a?.vis>.5));assert.equal(frames[124].bots,false);assert.equal(frames[125].bots,true);
 }
 for(const f of r.naturalObservation){assert(integer(f.assignments));assert.equal(f.transforms.length,8);assert(f.transforms.every(x=>typeof x==='string'));assert.equal(f.visible.length,8);assert(f.visible.every(x=>typeof x==='boolean'));}
 for(const f of r.frames){
  assert(integer(f.assignments));assert.deepEqual(f.calls,[0,1,2,3,4,5,6,7]);assert.equal(f.rows.length,8);
  for(const [i,row]of f.rows.entries()){
   assert.equal(row.i,i);assert.equal(typeof row.on,'boolean');for(const k of ['classes','transform','computedTransform','opacity','display','visibility','text','icon'])assert.equal(typeof row[k],'string',k);
   assert(row.classes.includes('is-open'));assert.match(row.transform,/^translate3d\(/);assert.match(row.computedTransform,/^matrix/);assert.equal(row.rect.length,4);assert(row.rect.every(Number.isFinite));assert(Number.isFinite(Number(row.opacity)));
   assert.equal(row.bobPhase,0);for(const o of [row.child,row.stack]){assert.equal(o.rect.length,4);assert(o.rect.every(Number.isFinite));assert(Number.isFinite(Number(o.opacity)));}
   for(const k of ['display','visibility','color','background'])assert.equal(typeof row.child[k],'string');for(const k of ['scale','translate'])assert.equal(typeof row.stack[k],'string');
   assert(row.ancestors.length>=3);for(const x of row.ancestors){assert(Number.isFinite(Number(x.opacity)));for(const k of ['tag','classes','display','visibility'])assert.equal(typeof x[k],'string');}
   if(row.on){assert(Number(row.opacity)>0);assert.equal(row.visibility,'visible');assert.notEqual(row.display,'none');assert(row.child.rect[2]>0&&row.child.rect[3]>0);assert(row.stack.rect[2]>0&&row.stack.rect[3]>0);assert(Number(row.child.opacity)>0&&Number(row.stack.opacity)>0);assert(row.ancestors.every(x=>Number(x.opacity)>0&&x.display!=='none'&&x.visibility==='visible'));}

  }
 }
 assert(r.frames[124].rows.every(x=>x.text==='OPEN'&&!x.classes.includes('is-bot')));assert(r.frames[125].rows.every(x=>x.text==='BOT'&&x.classes.includes('is-bot')));
 assert(r.frames[120].rows.every(x=>!x.on),'hidden DOM');assert(r.frames[121].rows.some(x=>x.on),'returned DOM');
}
export function compare(a,b){verify(a);verify(b);assert.deepEqual(b.input,a.input,'identical source-derived projections');
 assert.deepEqual(b.frames.map(({assignments,...x})=>x),a.frames.map(({assignments,...x})=>x),'all native DOM/CSS endpoints equal');
 const sum=(r,start,end)=>r.frames.slice(start,end).reduce((n,f)=>n+f.assignments,0);
 assert(sum(b,0,60)<sum(a,0,60),'strict fixed-input assignment reduction');assert(sum(b,60,120)<=sum(a,60,120),'moving assignments cannot increase');
 assert.equal(b.frames[120].assignments,0);assert(b.frames[123].assignments>0,'external style repaired');assert(b.frames[126].assignments>0,'new native nodes initialized');
 return {status:'passed',fixed:{baseline:sum(a,0,60),candidate:sum(b,0,60)},moving:{baseline:sum(a,60,120),candidate:sum(b,60,120)},scope:'Shared native projections and native DOM/CSS endpoint parity; natural observations are separate, no FPS claim'};
}
