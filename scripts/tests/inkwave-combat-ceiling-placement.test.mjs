import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installCombatPlacementQA} from '../lib/inkwave-combat-ceiling-placement.mjs';

// These are bounded helper contracts plus the real Actor barrier method,
// not a substitute for the browser's actual Physics/Actor settle gate.
const actorSource=fs.readFileSync(new URL('../../inkwave-public/src/game/actor.js',import.meta.url),'utf8');
const mapsSource=fs.readFileSync(new URL('../../inkwave-public/src/world/maps.js',import.meta.url),'utf8');
const method=actorSource.match(/  _spawnBarrier\(\) \{[\s\S]*?\n  \}/g);
assert.equal(method?.length,1,'unique native barrier method');
const pads=JSON.parse(mapsSource.match(/export const TIDEWATER = \{[\s\S]*?spawnPads: (\[[^\n]+\]),/)[1]);
const radius=Number(mapsSource.match(/export const TIDEWATER = \{[\s\S]*?spawnBarrier: ([\d.]+)/)[1]);
const level={bounds:{minX:-25,maxX:25,minZ:-44,maxZ:44},spawnPads:pads.map(([x,y,z])=>({x,y,z})),spawnBarrier:radius};
class V {
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
 set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
 copy(v){return this.set(v.x,v.y,v.z);}
 add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
 normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this;}
 toArray(){return [this.x,this.y,this.z];}
}
function fixture(fn) {
 const savedG=globalThis.__G,savedQA=globalThis.__ceilingPlacement;
 const calls={ground:0,los:0};
 const G={level,camera:{position:new V()},netm:{byNid:new Map()},physics:{
  groundProbe(x,y,z,up,down,foot,h,skip){calls.ground++;assert.equal(skip,false);Object.assign(h,{hit:true,center:true,grate:false,y:0});h.normal.set(0,1,0);},
  los(){calls.los++;return true;}
 },projectiles:{_muzzle(a,out){return out.copy(a.pos).add(new V(0,1.1,.3));}}};
 const barrier=new Function('G','return new (class {'+method[0]+'})()._spawnBarrier;')(G);
 globalThis.__G=G;installCombatPlacementQA();
 const add=(id,p,enemyTeam=0)=>{const a={pos:new V(...p),vel:new V(),enemyTeam,alive:true,grounded:true,form:'kid',smoothY:0,aimPoint:new V(),aimDir:new V()};G.netm.byNid.set(id,a);return a;};
 try{return fn({G,q:globalThis.__ceilingPlacement,barrier,add,calls});}
 finally{if(savedG===undefined)delete globalThis.__G;else globalThis.__G=savedG;if(savedQA===undefined)delete globalThis.__ceilingPlacement;else globalThis.__ceilingPlacement=savedQA;}
}
test('old enemy spawn placement is moved by the actual native barrier',()=>fixture(({barrier,add,q})=>{
 const attacker=add('a',pads[1],0),victim=add('v',[pads[1][0],pads[1][1],pads[1][2]+2],1);
 barrier.call(attacker);barrier.call(victim);
 assert.equal(victim.pos.z,pads[1][2]+radius);
 assert(Math.abs(victim.pos.z-attacker.pos.z-2)>2);
 assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/spawn barrier|separation/);
}));
test('neutral selected pair stays outside both native barriers and uses stage probes',()=>fixture(({barrier,add,q,calls})=>{
 const points=q.select();assert(calls.ground>=2&&calls.los>=3);
 for(let team=0;team<2;team++)for(const p of points){const a=add('trial',p,team);barrier.call(a);assert.deepEqual(a.pos.toArray(),p);}
 add('a',points[0],0);add('v',points[1],1);
 assert.equal(q.inspect({attacker:'a',victim:'v',requested:points}).separation,2);
}));
test('settled position drift and wrong separation are rejected, not teleported back',()=>fixture(({q,add})=>{
 const points=q.select(),a=add('a',points[0]),v=add('v',points[1]);v.pos.x+=.2;a.pos.x+=.2;
 const moved=v.pos.toArray();assert.throws(()=>q.inspect({attacker:'a',victim:'v',requested:points}),/settle moved/);assert.deepEqual(v.pos.toArray(),moved);
 v.pos.z+=.2;assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/separation/);
}));
test('both spawn barriers and nonfinite settled coordinates are rejected',()=>fixture(({q,add})=>{
 for(const pad of pads){add('a',pad);add('v',[pad[0]+2,pad[1],pad[2]]);assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/spawn barrier/);}
 add('a',[NaN,0,0]);add('v',[2,0,0]);assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/nonfinite/);
}));
test('blocked or absent native ground cannot produce a placement',()=>fixture(({q,G})=>{
 G.physics.los=()=>false;assert.throws(()=>q.select(),/no neutral playable pair/);
 G.physics.groundProbe=(_x,_y,_z,_u,_d,_f,h)=>{h.hit=false;};assert.throws(()=>q.select(),/no neutral playable pair/);
}));
test('aim rereads actual settled target and real muzzle and rejects a blocked shot',()=>fixture(({q,G,add})=>{
 const points=q.select(),a=add('a',points[0]),v=add('v',points[1]);v.smoothY=.02;
 const result=q.aim({attacker:'a',victim:'v',requested:points});
 assert.deepEqual(result.target,[v.pos.x,v.pos.y+1.07,v.pos.z]);
 assert.deepEqual(result.muzzle,[a.pos.x,a.pos.y+1.1,a.pos.z+.3]);
 assert.deepEqual(a.aimPoint.toArray(),result.target);
 const expected=new V(...result.target).sub(new V(...result.muzzle)).normalize();
 assert.deepEqual(a.aimDir.toArray(),expected.toArray());
 G.physics.los=()=>false;assert.throws(()=>q.aim({attacker:'a',victim:'v',requested:points}),/muzzle path blocked/);
}));
test('airborne or dead targets fail rather than weakening native contact requirements',()=>fixture(({q,add})=>{
 const points=q.select();add('a',points[0]);const v=add('v',points[1]);v.grounded=false;
 assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/alive grounded/);
 v.grounded=true;v.alive=false;assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/alive grounded/);
}));

test('failure stdout limits shot diagnostics to fixed labels and finite numbers',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-combat-ceiling-browser.mjs',import.meta.url),'utf8');
 const body=source.slice(source.lastIndexOf('const failure ='),source.lastIndexOf('console.log('));
 assert(body.startsWith('const failure ='));
 const summarize=new Function('report','errors',body+'return failure;');
 assert.equal(summarize({status:'passed'},[]),undefined);
 const report={status:'failed',error:'secret packet data',shot:{steps:Infinity,initial:{afterInk:'secret',pos:[0,NaN,0]},removal:{reason:'private wire data',age:Infinity}}};
 assert.deepEqual(summarize(report,[]).shot,{reason:null,steps:null,initialInk:null,initialHeight:null,removalAge:null});
 const good={status:'failed',error:'Native projectile never authored a 36 hit packet',shot:{steps:3,initial:{afterInk:99,pos:[0,1.1,0]},removal:{reason:'world-impact',age:.05}}};
 assert.deepEqual(summarize(good,[]).shot,{reason:'world-impact',steps:3,initialInk:99,initialHeight:1.1,removalAge:.05});
});
