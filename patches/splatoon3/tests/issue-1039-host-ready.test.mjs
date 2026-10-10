import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { confirmResponsiveMockHostTeams } from '../../../scripts/inkwave-responsive-fixture.mjs';

const menuSource = adaptBuildSource('src/ui/menus.js', fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8'));
const section = (start, end) => {
  const at = menuSource.indexOf(start), until = menuSource.indexOf(end, at);
  assert.ok(at >= 0 && until > at, start);
  assert.equal(menuSource.indexOf(start, at + start.length), -1, `unique ${start}`);
  return menuSource.slice(at, until);
};
async function room(mode = 'turf') {
  const f = await fixture({ productionComposition: true, realProjectiles: true,
    extraExports: "export { NetSession } from './inkwave-public/src/net/session.js';" });
  const host = new f.NetSession(), guest = new f.NetSession(), packets = [], locks = [];
  const peers = new Map([['host', host], ['guest', guest]]);
  for (const [id, net] of peers) {
    net.myId = id; net.hostId = 'host'; net.state = 'lobby';
    net._members = new Map([['host', 'Host'], ['guest', 'Guest']]);
    net.tr = { broadcast(packet) { packets.push({ from:id, packet:structuredClone(packet) });
        for (const [other, peer] of peers) if (other !== id) peer._message(id, structuredClone(packet)); },
      sendTo(to, packet) { peers.get(to)?._message(id, structuredClone(packet)); },
      lock(value) { locks.push(value); }, close() {} };
  }
  host.lobby.mode = mode; host.lobby.bots = false;
  host.lobby.players = [host._newPlayer('host', 'Host', {}), host._newPlayer('guest', 'Guest', {})];
  host._fixTeams(); host._broadcastLobby();
  // Full Session.start/_begin stay native; only stage rendering/loading is inert.
  f.G.game = { menus:{ launchLobby:async()=>{} }, startNetMatch:async()=>{}, netMatchGo() {} };
  return { host, guest, packets, locks, close() { host.leave(); guest.leave(); } };
}
function readyControl(net) {
  const logs = [], node = { classList:{}, querySelector:()=>({}) };
  const context = {
    net, isHost:()=>net.isHost, bossMode:()=>net.lobby.mode === 'boss',
    lob:net.lobby, meP:()=>net.lobby.players.find(p=>p.id===net.myId), players:()=>net.lobby.players,
    S:{launching:null}, readyBtn:node, startBtn:node, safeCall:fn=>fn(), renderBar(){},
    restartAnim(){}, GLYPHS:{users:'users',clock:'clock'}, listNames:ps=>ps.map(p=>p.name).join(','),
  };
  const methods = section('    const toggleReady = () => {', '    const listNames =');
  const factory = vm.runInNewContext(`(function(){${methods}\nreturn { toggleReady, tryStart };})`, context);
  const ui = { _sfx(){}, _press(){}, _burstAt(){}, toast:message=>logs.push(message) };
  return { ...factory.call(ui), logs };
}

test('#1039 responsive MockNet fixture supplies host confirmation before native guest Ready', async () => {
  const f = await fixture({ productionComposition: true,
    extraExports: "export { MockNet } from './inkwave-public/src/net/mock.js';" });
  const net = new f.MockNet(); net._auto = false; net._lat = 0; net._fill = 1; net._rtt = () => 0;
  const updates = []; net.on('lobby', ({lobby}) => updates.push(lobby));
  try {
    await net.join('BC234', 'Guest'); net.mock.fill(7);
    assert.equal(net.lobby.players.length, 8);
    assert.equal(net.isHost, false);
    const guest = net.lobby.players.find(p => p.you);
    readyControl(net).toggleReady();
    assert.equal(guest.ready, false, 'pre-fix audit times out here because the mock never confirms teams');
    confirmResponsiveMockHostTeams(net);
    assert.equal(updates.at(-1).teamsConfirmed, true, 'native MockNet emits a new cloned lobby for Menus');
    assert.notEqual(updates.at(-1), net.lobby);
    assert.ok(updates.at(-1).players.every(p => !p.ready));
    readyControl(net).toggleReady();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(guest.ready, true);
    assert.equal(updates.at(-1).players.find(p => p.you).ready, true, 'normal mock setMe acknowledgement remains live');
  } finally { net.leave(); }
});

test('#1039 composed host Ready is reachable after confirmation and starts the actual two-client roster', async () => {
  const r = await room();
  try {
    assert.equal(r.host.confirmTeams(), true);
    const hostUI = readyControl(r.host), guestUI = readyControl(r.guest);
    guestUI.toggleReady();
    assert.equal(r.host.canStart(), false, 'host still owes its own final Ready');
    hostUI.toggleReady();
    assert.equal(r.host.lobby.players[0].ready, true, 'native host Ready action must not redirect to blocked Start');
    assert.equal(r.host.canStart(), true);
    hostUI.tryStart();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const launch = r.packets.find(p=>p.packet.k==='start').packet;
    assert.deepEqual(launch.roster.map(p=>[p.owner,p.team]), [['host',0],['guest',1]]);
    assert.equal(r.host._startCfg.id, r.guest._startCfg.id);
    assert.equal(r.locks[0], true);
  } finally { r.close(); }
});

test('#1039 pre-confirm Ready never sets an optimistic flag, and host reassignment revokes both peers readiness', async () => {
  const r = await room();
  try {
    let sent = 0; const send = r.guest.tr.sendTo; r.guest.tr.sendTo = () => sent++;
    readyControl(r.guest).toggleReady(); readyControl(r.host).toggleReady();
    assert.equal(sent, 0, 'no premature ready packet or optimistic guest state');
    r.guest.tr.sendTo = send;
    assert.ok(r.guest.lobby.players.every(p=>!p.ready));
    assert.ok(r.host.lobby.players.every(p=>!p.ready));
    r.host.confirmTeams(); readyControl(r.guest).toggleReady(); readyControl(r.host).toggleReady();
    assert.equal(r.host.canStart(), true);
    r.guest.setMe({team:0});
    assert.equal(r.host.lobby.players[1].team, 1, 'guest cannot author final team');
    r.host.assignTeam('guest',0);
    assert.equal(r.host.lobby.teamsConfirmed, false);
    assert.ok(r.host.lobby.players.every(p=>!p.ready));
    assert.ok(r.guest.lobby.players.every(p=>!p.ready));
    assert.equal(r.host.canStart(), false);
    readyControl(r.host).toggleReady();
    assert.ok(r.host.lobby.players.every(p=>!p.ready));
  } finally { r.close(); }
});

test('#1039 host Boss Ready retains the separate Start behavior without Turf confirmation', async () => {
  const r = await room('boss');
  try {
    readyControl(r.guest).toggleReady();
    assert.equal(r.host.canStart(), true);
    readyControl(r.host).toggleReady();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const launch = r.packets.find(p=>p.packet.k==='start').packet;
    assert.equal(launch.mode, 'boss');
    assert.ok(launch.roster.every(p=>p.team===0));
  } finally { r.close(); }
});

test('#1039 host Turf exposes a Ready button and navigation reaches Confirm, Ready and Start', () => {
  for (const host of [true,false]) for (const boss of [true,false]) {
    const startHint = {style:{}};
    const ids = { wChip:'weapon',lChip:'look',teamRow:'team',emoteBtn:'emote',confirmTeamsBtn:{style:{}},readyBtn:{style:{}},startBtn:{querySelector:()=>startHint} };
    const assignment = {id:'assignment'};
    const env = { ...ids, teamAssignButtons:[assignment], isHost:()=>host, bossMode:()=>boss, lob:{teamsConfirmed:true}, el:{classList:{toggle(){}}} };
    const bar = section('    const barItems = () =>', '    const hostRows =');
    const items = vm.runInNewContext(`${bar}\nbarItems()`, env);
    assert.equal(items.includes(assignment), host && !boss);
    assert.equal(items.includes(ids.readyBtn), !host || !boss);
    assert.equal(items.includes(ids.confirmTeamsBtn), host && !boss);
    assert.equal(items.includes(ids.startBtn), host);
    const render = section('      const host = isHost();\n      confirmTeamsBtn.style.display', '      const ready = !!(me && me.ready);');
    vm.runInNewContext(render, env);
    assert.equal(ids.readyBtn.style.display, host && !boss ? 'flex' : '');
    assert.equal(startHint.style.display, host && !boss ? 'none' : '', 'R/X belongs to Ready in Turf');
    assert.equal(ids.confirmTeamsBtn.style.display, host && !boss ? '' : 'none');
  }
});

test('#1039 Confirm uses native menu binding for pointer and pad/keyboard activation', () => {
  for (const host of [true,false]) for (const boss of [true,false]) for (const launching of [true,false]) {
    let confirmations = 0, bound;
    const code = section('    const confirmTeamsBtn =', '    const open =');
    const factory = vm.runInNewContext(`(function(){${code}\nreturn confirmTeamsBtn;})`, {
      h:()=>({}), bar:{insertBefore(){}}, readyBtn:{}, isHost:()=>host, bossMode:()=>boss, S:{launching}, safeCall:fn=>fn(),
      net:{confirmTeams(){confirmations++;}},
    });
    const button = factory.call({_bind(node, options){bound={node,options};}});
    assert.equal(bound.node,button); assert.equal(bound.options.id,'confirm-teams');
    bound.options.accept('pad');
    assert.equal(confirmations,host && !boss && !launching ? 1 : 0);
  }
});

test('#1039 roster joins/leaves invalidate final readiness, and mode return keeps Turf confirmation mandatory', async () => {
  const r = await room();
  try {
    const readyBoth = () => { r.host.confirmTeams(); readyControl(r.guest).toggleReady(); readyControl(r.host).toggleReady(); };
    readyBoth(); assert.equal(r.host.canStart(), true);
    r.host._control({ t:'join', m:{id:'newcomer',name:'Newcomer'} });
    assert.equal(r.host.lobby.teamsConfirmed, false);
    assert.ok(r.host.lobby.players.every(p=>!p.ready));
    assert.ok(r.guest.lobby.players.every(p=>!p.ready));
    r.host._control({ t:'leave', id:'newcomer', host:'host' });
    assert.equal(r.host.lobby.teamsConfirmed, false);
    readyBoth(); assert.equal(r.host.canStart(), true);
    r.host.setSettings({mode:'boss'}); r.host.setSettings({mode:'turf'});
    assert.equal(r.host.lobby.teamsConfirmed, false);
    assert.equal(r.host.canStart(), false);
  } finally { r.close(); }
  new vm.SourceTextModule(menuSource);
});

test('#1039 live roster bindings survive team rerender, retire old controls and preserve focus by player identity', () => {
  const players = [{id:'host',name:'Host',team:0,weapon:'shooter'}, {id:'guest',name:'Guest',team:1,weapon:'shooter'}];
  let host = true, boss = false, state;
  const make = (tag, attrs = {}, ...children) => ({tag, dataset:{...attrs?.data}, children:children.flat(Infinity), attrs,
    appendChild(child) { this.children.push(child); }, replaceChildren(...next) { this.children = next; }});
  const roster = make('div'), confirm = make('button'), ready = make('button'), start = make('button');
  const ui = { _binds:new Map(), _focus:null,
    _bind(button, opts) { button.dataset.id=opts.id; this._binds.set(button,opts); },
    _setFocus(button) { this._focus=button; } };
  const code = section("    let rosterSignature = '';", '    const confirmTeamsBtn =');
  const factory = vm.runInNewContext(`(function(){${code}\nreturn {render:renderTouchRoster,buttons:teamAssignButtons};})`, {
    h:make, Ws:{shooter:{kind:'shooter',name:'Shooter'}}, weaponIcon:()=>'', GLYPHS:{crown:'c',check:'y',clock:'t'},
    isHost:()=>host, bossMode:()=>boss, players:()=>players, teamOf:p=>p.team, touchRoster:roster,
    lob:{teamsConfirmed:false}, S:{launching:false}, safeCall:fn=>fn(),
    net:{assignTeam(id,team) { players.find(p=>p.id===id).team=team; state.render(); }},
    confirmTeamsBtn:confirm, readyBtn:ready, startBtn:start,
  });
  state = factory.call(ui); state.render();
  assert.equal(state.buttons.length,4); assert.equal(ui._binds.size,4);
  const old = state.buttons.find(b=>b.dataset.id==='team-guest-0'); ui._focus=old;
  ui._binds.get(old).accept('pad');
  assert.equal(players[1].team,0); assert.equal(ui._focus.dataset.id,'team-guest-0');
  assert.notEqual(ui._focus,old); assert.equal(ui._binds.has(old),false);
  assert.equal(ui._focus.attrs['aria-pressed'],'true');
  for(let i=0;i<30;i++){players[0].ready=!!(i%2);state.render();assert.equal(ui._binds.size,4);}
  boss=true;state.render();assert.equal(ui._binds.size,0);assert.equal(state.buttons.length,0);assert.equal(ui._focus,start);
  boss=false;state.render();ui._focus=state.buttons[0];host=false;state.render();
  assert.equal(ui._binds.size,0);assert.equal(state.buttons.length,0);assert.equal(ui._focus,ready);
});

test('#1039 fully composed desktop stylesheet exposes only the host Turf assignment roster', () => {
  const raw=fs.readFileSync(new URL('../../../inkwave-public/styles/mobile.css',import.meta.url),'utf8');
  const built=adaptBuildSource('styles/mobile.css',raw);
  assert.match(raw,/\.iw-code-input, \.iw-touch-close, \.iw-lob__roster \{ display: none; \}/);
  assert.match(built,/\.iw-lobby\.is-host-teams \.iw-lob__roster \{ display: grid;/);
  assert.match(built,/@media \(max-width: 640px\) \{ \.iw-lobby\.is-host-teams \.iw-lob__roster \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(menuSource,/el\.classList\.toggle\('is-host-teams', host && !bossMode\(\)\)/);
  assert.match(menuSource,/next\.closest\('\.iw-rows, \.iw-lob__roster'\)/);
  assert.match(menuSource,/bar\.insertBefore\(confirmTeamsBtn, readyBtn\)/);
  assert.doesNotMatch(menuSource,/side, touchRoster, confirmTeamsBtn, bar/,'confirmation belongs to the reachable control dock');
});
