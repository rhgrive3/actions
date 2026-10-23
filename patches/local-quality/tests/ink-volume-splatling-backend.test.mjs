import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSplatlingBackend} from '../../../scripts/lib/inkwave-splatling-render-evidence.mjs';

const evidence=()=>({eligible:2,splatling:{backend:'splatling-shared-blob',visible:true,count:2,capacity:700,
  volumeActive:0,historyOwned:0,tailLength:.72,heads:[0,1].map(index=>({owned:true,index,
    matrix:[.052,0,0,0,0,.052,0,0,0,0,.052,0,index,2,3,1],radius:.052,expectedRadius:.052,
    shape:[1+.72/.052,.018,1,.12],look:[.02,4,1,0],petals:[0,0]}))}});

test('an explicitly rendered Splatling backend owns every native head while the old volume remains absent',()=>{
  assert.doesNotThrow(()=>assertSplatlingBackend(evidence()));
});

test('zero, hidden, missing, duplicate and unrelated bodies cannot turn the original volume assertion green',()=>{
  const mutations=[
    d=>delete d.splatling,d=>d.eligible=0,d=>d.splatling.visible=false,d=>d.splatling.count=0,
    d=>d.splatling.capacity=701,d=>d.splatling.heads.pop(),d=>d.splatling.heads[0].index=-1,
    d=>d.splatling.heads[1].index=0,d=>d.splatling.heads[0].owned=false,
    d=>d.splatling.volumeActive=1,d=>d.splatling.historyOwned=1,
  ];
  for(const mutate of mutations){const d=evidence();mutate(d);assert.throws(()=>assertSplatlingBackend(d));}
});

test('wrong radius, non-finite transforms, Shooter rods, excessive tails and stale Roller petals reject',()=>{
  const mutations=[
    p=>p.radius=.2,p=>p.expectedRadius=0,p=>p.matrix[12]=NaN,p=>p.shape[0]=100,
    p=>p.shape[1]=NaN,p=>p.look[1]=-4,p=>p.look[3]=Infinity,p=>p.petals=[.2,.3],
  ];
  for(const mutate of mutations){const d=evidence();mutate(d.splatling.heads[0]);assert.throws(()=>assertSplatlingBackend(d));}
});
