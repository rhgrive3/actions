import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {blockExpiredGuestInput} from '../../splatoon3/runtime/turf-finish.mjs';
const STEP=1/60;
async function rig(weapon='shooter'){
 const f=await fixture({match:true,fidelity:true,network:true});f.installWeaponsFidelity(f,f.profile);
 const input=new f.Input({}),a=f.make(weapon),camera={yaw:0,pitch:0},controller=new f.PlayerController(a,camera,input);controller.computeAim=()=>{};a.isLocal=true;a.nid=1;a.owner='B';
 const m=new f.Match({duration:100,mode:'turf'});Object.assign(m,{local:a,actors:[a],controller,follower:true,time:100,state:'playing'});Object.assign(f.G,{match:m,rig:camera,actors:[a],settings:{...f.DEFAULT_SETTINGS,aimAssist:0},mode:'match'});input.lastDevice='kbm';input.locked=true;
 let bombs=0,steps=0;Object.assign(f.G.projectiles,{throwBomb(){bombs++;},update(){steps++;},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});f.G.paint.coverage=()=>[.9,.1];
 const frame=(n=1)=>{for(let i=0;i<n;i++){f.G.time+=STEP;m.updateController(STEP);m.update(STEP);input.endFrame();}};
 return {...f,input,a,camera,controller,m,frame,bombs:()=>bombs,projectileSteps:()=>steps};
}
test('#838 fresh guest commands at zero never admit a local shot, sub or special',async()=>{const h=await rig();h.m.time=0;h.a.special=h.a.specialCost();h.input.mouse.left=h.input.mouse.right=true;h.input.keys.add('KeyF');h.frame(30);assert.equal(h.shots.length,0);assert.equal(h.bombs(),0);assert.equal(h.a.specialActive,null);assert.equal(h.a.intent.fire,false);assert.equal(h.a.intent.sub,false);assert.equal(h.m.state,'playing');assert.equal(h.controller.navigationEnabled,false);});
test('#838 crossing zero cancels actual held Charger and Shooter first-shot state without synthetic release',async()=>{for(const weapon of ['charger','shooter']){const h=await rig(weapon);h.input.mouse.left=true;h.frame(weapon==='charger'?15:1);assert.equal(h.shots.length,0);if(weapon==='charger')assert.equal(h.a.weaponRunner.charging,true);else assert.equal(h.a.weaponRunner.s3ShooterPendingFirst,true);h.m.time=STEP/2;h.frame(40);assert.equal(h.shots.length,0,weapon);assert.equal(h.a.weaponRunner.charging,false);assert.equal(h.a.weaponRunner.s3ReleaseHold,false);}});
test('#838 ready and short-tap sub pending are canceled without throwing',async()=>{for(const short of [false,true]){const h=await rig();h.input.mouse.right=true;h.frame(short?1:10);if(short){h.input.mouse.right=false;h.frame();assert.equal(h.bombs(),0);}h.m.time=0;h.frame(30);assert.equal(h.bombs(),0);assert.equal(h.a.weaponRunner.s3SubReady,null);}});
test('#838 pending Blaster/Slosher/Roller windups are retired, not emitted after the deadline',async()=>{for(const weapon of ['blaster','slosher','roller']){const h=await rig(weapon);h.input.mouse.left=true;h.frame(3);assert.equal(h.shots.length,0,weapon);h.m.time=0;h.frame(90);assert.equal(h.shots.length,0,weapon);}});
test('#838 Splatling cancellation uses the original unspent reservation refund exactly once',async()=>{const h=await rig('splatling');h.input.mouse.left=true;h.frame(55);h.input.mouse.left=false;h.frame();const r=h.a.weaponRunner;assert.ok(r.s3Spin);const before=h.a.ink,unspent=r.s3Spin.unspent;h.m.time=0;blockExpiredGuestInput(h.m);assert.equal(r.s3Spin,null);assert.ok(Math.abs(h.a.ink-Math.min(100,before+unspent))<1e-8);const ink=h.a.ink;blockExpiredGuestInput(h.m);assert.equal(h.a.ink,ink);});
test('#838 input cancellation preserves cooldown, active Dodge, roll resources, recovery and confirmed-hit maps',async()=>{const h=await rig('dualies'),r=h.a.weaponRunner,dodge={t:.03,dur:.2};r.dodge=dodge;r.cooldown=.45;r.rollsLeft=0;r.lockT=.3;r.s3ChargerPostShot=.2;r.s3DualiesPostShot=.1;r.s3FlickPostSub=.12;const hits=r.rollHits,pending=r.s3PendingRollHits;const victim={};hits.set(victim,7);pending.set(victim,{owner:'A',life:1});h.m.time=0;blockExpiredGuestInput(h.m);assert.equal(typeof h.m.s3GuestDeadlineInput,'symbol','Match retains only a non-owning identity token');assert.equal(r.dodge,dodge);assert.equal(r.cooldown,.45);assert.equal(r.rollsLeft,0);assert.equal(r.lockT,.3);assert.equal(r.s3ChargerPostShot,.2);assert.equal(r.s3DualiesPostShot,.1);assert.equal(r.s3FlickPostSub,.12);assert.equal(r.rollHits,hits);assert.equal(r.s3PendingRollHits,pending);assert.equal(hits.get(victim),7);assert.equal(pending.size,1);h.frame();assert.ok(dodge.t>.03,'existing Dodge clock still advances');});
test('#838 positive host correction requires release before the old held input can become a new press',async()=>{const h=await rig();h.input.mouse.left=true;h.frame();h.m.time=0;h.frame();h.m.time=3;h.frame(12);assert.equal(h.shots.length,0);assert.equal(h.controller.enabled,false);h.input.mouse.left=false;h.frame();assert.equal(h.controller.enabled,true);h.input.mouse.left=true;h.frame(3);assert.equal(h.shots.length,1);});
test('#838 existing projectile update and accepted host finish/result continue while input is blocked',async()=>{const h=await rig();h.m.time=0;h.installClock(h);const game={match:h.m,input:h.input,showcase:{},rig:{mode:'follow',target:h.a,follow(){}},_padMenus(){}};h.runSimulation(game,STEP);assert.equal(h.projectileSteps(),1);const session={myId:'B',hostId:'A',get isHost(){return this.myId===this.hostId;},tr:{broadcast(){}}};const nm=new h.NetMatch(session,{map:'reef'});nm.match=h.m;nm.byNid.set(1,h.a);h.G.netm=nm;nm.onMessage('A',{k:'st',s:'finish',t:0});assert.equal(h.m.state,'finish');nm.onMessage('A',{k:'res',mode:'turf',cov:[.2,.8],win:1,st:[]});assert.equal(h.m.state,'judge');assert.equal(h.m.result.winner,1);assert.deepEqual(Array.from(h.m.result.coverage),[.2,.8]);});
test('#838 owner adoption at zero keeps native finish authority and ordinary positive-time host input',async()=>{const h=await rig();h.m.time=0;h.frame();const session={myId:'B',hostId:'B',get isHost(){return this.myId===this.hostId;},tr:{broadcast(){}}};const nm=new h.NetMatch(session,{map:'reef'});nm.match=h.m;nm.onLeave('A',true);assert.equal(h.m.follower,false);h.frame();assert.equal(h.m.state,'finish');const host=await rig();host.m.follower=false;host.input.mouse.left=true;host.frame(3);assert.equal(host.shots.length,1);});

test('#838 keyboard, pad and touch held/queued commands must become neutral before a positive correction',async()=>{
 for(const channel of ['keyboard','pad','padEdge','touch','touchEdge']){
  const h=await rig();h.m.time=0;blockExpiredGuestInput(h.m);h.m.time=2;
  if(channel==='keyboard')h.input.keys.add('KeyF');
  if(channel==='pad')h.input.lastDevice='pad';
  if(channel==='pad')h.input.pad={buttons:Array.from({length:16},(_,i)=>({pressed:i===7,value:i===7?1:0}))};
  if(channel==='padEdge')h.input.padPressed.add(7);
  if(channel==='touch'||channel==='touchEdge')h.input.mobile={down:k=>channel==='touch'&&k==='fire',_pendingEdges:new Set(channel==='touchEdge'?[{id:'sub'}]:[])};
  assert.equal(blockExpiredGuestInput(h.m),true,channel);
  h.input.keys.clear();h.input.pad=null;h.input.padPressed.clear();h.input.mobile=null;
  assert.equal(blockExpiredGuestInput(h.m),false,channel);assert.equal(h.m.s3GuestDeadlineInput,null);
 }
});
test('#838 armed held Storm cannot turn input neutralization into a throw',async()=>{
 const h=await rig('charger');h.a._resolve=()=>{};let thrown=0;h.G.projectiles.throwStorm=()=>{thrown++;};
 h.a.special=h.a.specialCost();h.input.keys.add('KeyF');h.frame();h.input.keys.clear();
 assert.equal(h.a.specialActive.phase,'hold');h.input.mouse.right=true;h.frame();assert.equal(h.a.specialActive.subArmed,true);
 h.m.time=0;h.frame(20);assert.equal(thrown,0);assert.equal(h.a.specialActive.phase,'hold');
 h.m.time=3;h.frame();assert.equal(thrown,0);h.input.mouse.right=false;h.frame();h.input.mouse.right=true;h.frame();h.input.mouse.right=false;h.frame();assert.equal(thrown,1);
});
// #838 latency regression: the host clock sample (remaining time when sent) is aged by its delivery delay.
function guestNetMatch(h,rttMs){const session={myId:'B',hostId:'A',get isHost(){return this.myId===this.hostId;},tr:{broadcast(){},rtt:rttMs}};const nm=new h.NetMatch(session,{map:'reef'});nm.match=h.m;nm.byNid.set(1,h.a);h.G.netm=nm;return nm;}
test('#838 host clock deadline ends a lagging guest input at the latency-compensated host end, before its local zero',async()=>{
 const h=await rig();h.m.time=0.45;const nm=guestNetMatch(h,400);
 nm._hostClock(['playing',0.5]);// sent with 0.5 s left; 400 ms relay RTT leaves 0.1 s at the host end
 h.frame(3);assert.equal(h.controller.enabled,true,'no early freeze before the host end');
 h.frame(4);assert.equal(h.controller.enabled,false,'blocked at the host end, not at local zero');assert.ok(h.m.time>0.3);assert.equal(h.m.state,'playing');
 h.input.mouse.left=true;h.frame(3);assert.equal(h.shots.length,0);assert.equal(h.a.intent.fire,false);
 nm.onMessage('A',{k:'st',s:'finish',t:0});assert.equal(h.m.state,'finish');
});
test('#838 delayed host finish packets of 100, 250 and 500 ms grant no fire after the host clock end',async()=>{
 for(const delay of [100,250,500]){
  const h=await rig();h.m.time=0.25;const nm=guestNetMatch(h,0);
  nm._hostClock(['playing',0.1]);// host ends 100 ms later; the guest local clock lags 150 ms (below the 0.2 s correction)
  h.frame(7);assert.equal(h.controller.enabled,false,`delay ${delay}`);assert.equal(h.m.state,'playing',`delay ${delay}`);
  h.input.mouse.left=true;h.frame(Math.round(delay*60/1000)+3);assert.equal(h.shots.length,0,`delay ${delay}`);
  h.input.mouse.left=false;h.frame();
  nm.onMessage('A',{k:'st',s:'finish',t:0});assert.equal(h.m.state,'finish',`delay ${delay}`);
 }
});
