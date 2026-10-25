import test from 'node:test';
import assert from 'node:assert/strict';
import {actualModule} from '../../patches/network-replication/tests/added-actual-module.mjs';

const oldEquality=`      const previous = m.attachmentSnapshot, keys = Object.keys(next);
      if (previous && Object.keys(previous).length === keys.length && keys.every(key => previous[key] === next[key])) return;`;
const before=s=>s.replace(/      const previous = m.attachmentSnapshot;[\s\S]*?      m.ws.serializeAttachment/,
 oldEquality+'\n      m.ws.serializeAttachment');

test('actual relay attachment scalar precheck preserves all serializations through refill, handoff, unchanged sync and exceptions',async()=>{
 // Both module constructors must observe the same clock; their host join
 // budgets are part of the exact serialized comparison, not noise to omit.
 class FixedDate extends Date {static now(){return 1792900000000;}}
 const globals={TextDecoder,Date:FixedDate};
 const a=await actualModule('server/src/index.js',{transform:before,globals});
 const b=await actualModule('server/src/index.js',{globals});
 assert.notEqual(a.api.RoomDurableObject.prototype._syncMemberAttachment.toString(),b.api.RoomDurableObject.prototype._syncMemberAttachment.toString());
 function make(f){
  const room=new f.api.RoomDurableObject({},{}),frames=[];
  const m={id:'a',name:'A',joinedAt:1,budgetAt:1000,framesLeft:160,bytesLeft:524288,relayClock:true,
   ws:{serializeAttachment(next){if(m.fail)throw Error('controlled attachment failure');frames.push(JSON.stringify(next));}}};
  room.hostId='a';room.members.set('a',m);return{room,m,frames};
 }
 const x=make(a),y=make(b);
 for(let i=0;i<20000;i++){
  for(const f of [x,y]){
   const {m,room}=f;
   if(i%19!==0){m.budgetAt=1000+i;m.framesLeft=i%3===0?159:160-i%160;m.bytesLeft=524288-i%65536;}
   if(i%17===0)room.hostId=room.hostId==='a'?'b':'a';
   if(i%23===0)room.locked=!room.locked;
   if(i%29===0)room.compat='epoch-'+i;
   if(i%31===0)m.emoteAt=i;
   m.fail=i%97===0;
   room._syncMemberAttachment(m);
  }
  assert.equal(x.frames.length,y.frames.length);
  assert.equal(x.frames.at(-1),y.frames.at(-1));
  assert.equal(JSON.stringify(x.m.attachmentSnapshot),JSON.stringify(y.m.attachmentSnapshot));
 }
 // Refilling to the same post-decrement quota is not proof of a difference:
 // the production change retains complete equality in this case.
 for(const f of [x,y]){f.m.fail=false;f.room._syncMemberAttachment(f.m);}
 const counts=[x.frames.length,y.frames.length];
 for(const f of [x,y])f.room._syncMemberAttachment(f.m);
 assert.deepEqual([x.frames.length,y.frames.length],counts);
 // A host-only join budget change must still serialize when all three frame
 // budget scalars are identical, proving complete key equality remains live.
 for(const f of [x,y]){f.room.hostId='a';f.room._syncMemberAttachment(f.m);}
 const hostCounts=[x.frames.length,y.frames.length];
 for(const f of [x,y]){f.room.joinBudgetAt++;f.room._syncMemberAttachment(f.m);}
 assert.deepEqual([x.frames.length,y.frames.length],hostCounts.map(n=>n+1));
 assert.equal(x.frames.at(-1),y.frames.at(-1));
 assert.equal(x.m.attachmentSnapshot.joinBudgetAt,FixedDate.now()+1);
});
