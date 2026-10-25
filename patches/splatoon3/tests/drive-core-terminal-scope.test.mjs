import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const root=new URL('../../../',import.meta.url);
const source=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8'));
class V {constructor(){this.x=this.y=this.z=0;}set(x,y,z){Object.assign(this,{x,y,z});return this;}lengthSq(){return this.x**2+this.y**2+this.z**2;}}
const gate=' && (n._driveBossBuffer !== buf || n._driveBossFirst !== buf[0] || n._driveBossLast !== buf[buf.length-1] || n._driveBossLength !== buf.length || n._driveBossOwner !== this.s.hostId)';
function fixture(code){
 const begin=code.indexOf('function queueBossPath('),end=code.indexOf('const ascending',begin);assert.ok(begin>=0&&end>begin);
 const env=vm.createContext({THREE:{Vector3:V},angDiff:(a,b)=>b-a,calls:0});
 vm.runInContext(code.slice(begin,end).replace('function queueBossPath(buf, t, O) {','function queueBossPath(buf, t, O) { calls++;'),env);
 const start=code.indexOf('  _sampleBoss(dt)'),stop=code.indexOf('\n  _trigSideEffects(',start);assert.ok(start>=0&&stop>start);
 const fn=vm.runInContext('({'+code.slice(start,stop)+'})',env)._sampleBoss;
 const snap=t=>({t,x:t,y:0,z:t,vx:1,vz:1,yaw:0,bt:t,crabs:[]});
 const n={buf:[snap(0),snap(1)],err:new V(),errV:new V()},peer={tr:.5},net={match:{boss:{sim:false,net:n}},s:{hostId:'a'},peers:new Map([['a',peer],['b',peer]])};
 return {n,peer,net,snap,step(){const old=env.calls;fn.call(net,1/60);return env.calls-old;}};
}
test('Boss rewind cache is private, skips only unchanged accepted history, and invalidates on lifecycle inputs',()=>{
 const code=source('src/net/netmatch.js');assert.equal(code.split(gate).length,2,'exact terminal cache gate');
 // Removing only the gate restores prior rewind evaluation while retaining identical production sampling/correction code.
 const a=fixture(code),b=fixture(code.replace(gate,''));
 function check(label,change,calls){change?.(a);change?.(b);assert.equal(a.step(),calls,label);b.step();for(const k of ['prev','prevRaw','err','errV'])assert.deepEqual(a.n[k],b.n[k],label+':'+k);}
 check('initial',null,1);check('current time continues without rewind',x=>x.peer.tr=.6,1);
 check('append',x=>x.n.buf.push(x.snap(2)),2);check('prune',x=>x.n.buf.shift(),2);
 check('replacement array',x=>x.n.buf=x.n.buf.slice(),2);check('host owner',x=>x.net.s.hostId='b',2);
 check('handoff',x=>{x.n.handoff=true;x.n.buf=[x.snap(3),x.snap(4)];x.peer.tr=3.5;},1);
 check('ready reset',x=>{x.n.ready=false;x.n.buf=[x.snap(5),x.snap(6)];x.peer.tr=5.5;},1);
 check('stable after reset',x=>x.peer.tr=5.6,1);
 const second=fixture(code);assert.equal(second.step(),1);assert.equal(second.n._driveBossOwner,'a');assert.notEqual(second.n._driveBossBuffer,a.n._driveBossBuffer);
 // Accepted snapshots are append-only fresh records in production. This fingerprint intentionally does not promise detection of arbitrary in-place interior edits.
});
test('weapon shot pulse is unchanged for its only consumers and absent for unrelated weapon families',()=>{
 const code=source('src/game/character-weapons.js');
 const pulse=code.match(/const pulseE = ([^;]+);/);assert.ok(pulse);
 const declaration=code.match(/const shotK = ([^;]+);/);assert.ok(declaration);
 assert.match(declaration[1],/kind === 'shooter' \|\| kind === 'splatling'/);
 const env=vm.createContext({Math});const evaluate=vm.runInContext('const pulseE = '+pulse[1]+'; (kind, ts) => '+declaration[1],env);
 const baseline=vm.runInContext('(ts) => ('+pulse[1]+')(ts, 0.006, 30)',env);
 for(const t of [-1,0,.001,.006,.05,1,Infinity,NaN])for(const kind of ['shooter','splatling','charger','dualies','blaster','roller','brush','slosher','brella'])assert.ok(Object.is(evaluate(kind,t),kind==='shooter'||kind==='splatling'?baseline(t):0),kind+':'+t);
 assert.equal((code.match(/\bshotK\b/g)||[]).length,4,'one definition and the three known shooter/splatling consumers');
});
