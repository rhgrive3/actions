import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {actualModule,json} from '../../patches/network-replication/tests/added-actual-module.mjs';

const before=`        ...(m.id === this.hostId ? { joinBudgetAt: this.joinBudgetAt, joinsLeft: this.joinsLeft,
          rejectedJoinBudgetAt: this.rejectedJoinBudgetAt, rejectedJoinsLeft: this.rejectedJoinsLeft,
          roomBudgetAt: this.roomBudgetAt, roomFramesLeft: this.roomFramesLeft, roomBytesLeft: this.roomBytesLeft } : {}),
      };`;
const after=`      };
      if (m.id === this.hostId) {
        next.joinBudgetAt = this.joinBudgetAt;
        next.joinsLeft = this.joinsLeft;
        next.rejectedJoinBudgetAt = this.rejectedJoinBudgetAt;
        next.rejectedJoinsLeft = this.rejectedJoinsLeft;
        next.roomBudgetAt = this.roomBudgetAt;
        next.roomFramesLeft = this.roomFramesLeft;
        next.roomBytesLeft = this.roomBytesLeft;
      }`;
const fields=['joinBudgetAt','joinsLeft','rejectedJoinBudgetAt','rejectedJoinsLeft','roomBudgetAt','roomFramesLeft','roomBytesLeft'];
function original(source){assert.equal(source.split(after).length,2,'one current seven-field assignment owner');return source.replace(after,before);}
class FixedDate extends Date {static now(){return 1792900000000;}}
const globals={TextDecoder,Date:FixedDate};
const pair=async()=>Promise.all([actualModule('server/src/index.js',{globals,transform:original}),actualModule('server/src/index.js',{globals})]);
function setup(f,host=true){
 const room=new f.api.RoomDurableObject({},{}),frames=[];
 const member={id:'a',name:'A',joinedAt:1,budgetAt:1000,framesLeft:160,bytesLeft:524288,relayClock:true,
  ws:{serializeAttachment(next){frames.push(JSON.stringify(next));}}};
 room.hostId=host?'a':'b';room.members.set('a',member);
 return{room,member,frames};
}
const snapshot=f=>({frames:f.frames,snapshot:json(f.member.attachmentSnapshot)});

test('host and guest preserve exact attachment keys, seven values and budget getter order',async()=>{
 const modules=await pair();
 for(const host of [true,false]){
  const runs=modules.map(f=>setup(f,host)),traces=[];
  for(const x of runs){const trace=[];traces.push(trace);for(const [i,key]of fields.entries())Object.defineProperty(x.room,key,{get(){trace.push(key);return 100+i;},configurable:true});x.room._syncMemberAttachment(x.member);}
  assert.deepEqual(snapshot(runs[1]),snapshot(runs[0]));
  assert.deepEqual(traces,[host?fields:[],host?fields:[]]);
  assert.deepEqual(Object.keys(runs[1].member.attachmentSnapshot),['id','name','joinedAt','budgetAt','framesLeft','bytesLeft','isHost','locked','compat','relayClock','emoteAt',...(host?fields:[])]);
 }
});

test('every throwing budget getter retains partial read order and the old snapshot without serialization',async()=>{
 const modules=await pair();
 for(let stop=0;stop<fields.length;stop++){
  const runs=modules.map(f=>setup(f)),traces=[];
  for(const x of runs){const trace=[];traces.push(trace);const old=x.member.attachmentSnapshot={old:true};for(const [i,key]of fields.entries())Object.defineProperty(x.room,key,{get(){trace.push(key);if(i===stop)throw fields;return i;},configurable:true});x.room._syncMemberAttachment(x.member);assert.equal(x.member.attachmentSnapshot,old);assert.equal(x.frames.length,0);}
  assert.deepEqual(traces,[fields.slice(0,stop+1),fields.slice(0,stop+1)]);
 }
});

test('member accessors, host handoff and nonfinite budget values retain ordered observations',async()=>{
 const modules=await pair();const results=[];
 for(const f of modules){const x=setup(f),trace=[];let reads=0;
  Object.defineProperty(x.member,'id',{get(){trace.push('id');return ++reads%2?'a':'b';},configurable:true});
  Object.defineProperty(x.member,'emoteAt',{get(){trace.push('emoteAt');return undefined;},configurable:true});
  for(const [i,key]of fields.entries())Object.defineProperty(x.room,key,{get(){trace.push(key);return [NaN,Infinity,-Infinity,-0,undefined,null,0][i];},configurable:true});
  x.room._syncMemberAttachment(x.member);
  for(const [i,key]of fields.entries())assert.ok(Object.is(x.member.attachmentSnapshot[key],[NaN,Infinity,-Infinity,-0,undefined,null,0][i]),key+' retains exact scalar rather than JSON normalization');
  results.push({trace,...snapshot(x)});
 }
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[1].trace,['id','id','emoteAt','id',...fields]);
});

test('unchanged sync, independent rejected budget changes and host handoff keep all wire snapshots',async()=>{
 const modules=await pair(),runs=modules.map(f=>setup(f));
 for(let i=0;i<2000;i++){
  for(const x of runs){x.room.hostId=i%13===0?'b':'a';if(i%3)x.member.budgetAt=1000+i;if(i%5===0)x.room.rejectedJoinBudgetAt++;if(i%7===0)x.room.rejectedJoinsLeft=(i%16);if(i%11===0)x.room.joinBudgetAt++;x.room._syncMemberAttachment(x.member);}
  assert.deepEqual(snapshot(runs[1]),snapshot(runs[0]));
 }
 for(const x of runs){x.room.hostId='a';x.room._syncMemberAttachment(x.member);}
 const counts=runs.map(x=>x.frames.length);
 for(const x of runs)x.room._syncMemberAttachment(x.member);
 assert.deepEqual(runs.map(x=>x.frames.length),counts);
 for(const x of runs){x.room.rejectedJoinsLeft--;x.room._syncMemberAttachment(x.member);}
 assert.deepEqual(runs.map(x=>x.frames.length),counts.map(n=>n+1));
});

test('serializer exceptions and synchronous nested sync preserve snapshot publication order',async()=>{
 const modules=await pair();
 for(const mode of ['throw','reenter']){
  const results=[];
  for(const f of modules){const x=setup(f),prior=x.member.attachmentSnapshot={old:true};let entered=false;
   x.member.ws.serializeAttachment=next=>{x.frames.push(JSON.stringify(next));if(mode==='throw')throw fields;if(!entered){entered=true;x.room.rejectedJoinsLeft--;x.room._syncMemberAttachment(x.member);}};
   x.room._syncMemberAttachment(x.member);if(mode==='throw')assert.equal(x.member.attachmentSnapshot,prior);results.push(snapshot(x));
  }
  assert.deepEqual(results[1],results[0]);
 }
});

function observeBudgetObjects(source){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
 const visit=n=>{if(!n||typeof n!=='object')return;
  if(n.type==='SpreadElement'&&n.argument?.type==='ConditionalExpression'&&n.argument.consequent?.type==='ObjectExpression'&&n.argument.consequent.properties.map(p=>p.key?.name).join(',')===fields.join(','))
   for(const x of [n.argument.consequent,n.argument.alternate]){assert.equal(x.type,'ObjectExpression');edits.push(x);}
  for(const x of Object.values(n))if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')visit(x);
 };visit(ast);assert.ok(edits.length===0||edits.length===2);
 for(const n of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,n.start)+'observeBudgetObject('+source.slice(n.start,n.end)+')'+source.slice(n.end);
 return{source,owners:edits.length/2};
}
test('actual host and guest path no longer evaluates a temporary conditional budget object',async()=>{
 const results=[];
 for(const legacy of [true,false]){let count=0,owners;
  const f=await actualModule('server/src/index.js',{globals:{...globals,observeBudgetObject:x=>{count++;return x;}},transform:s=>{const observed=observeBudgetObjects(legacy?original(s):s);owners=observed.owners;return observed.source;}});
  const x=setup(f);for(let i=0;i<100;i++){x.room.hostId=i%2?'a':'b';x.room._syncMemberAttachment(x.member);}results.push({count,owners,frames:x.frames});
 }
 assert.equal(results[0].owners,1);assert.equal(results[1].owners,0);
 assert.equal(results[0].count,100);assert.equal(results[1].count,0);
 assert.deepEqual(results[1].frames,results[0].frames);
 // Source-level object evaluation evidence only; no engine allocation/FPS claim.
});
