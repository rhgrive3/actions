// QA-only: advance the two native simulations against accepted input receipts.
// The host remains the sole Rainmaker charge/shot authority. Network delivery
// keeps running while frozen simulation clocks cannot expire a held command.
let nextProof = 0;
export async function installRainmakerChargeProbe({ token, id, host }) {
  if (globalThis.__rankedChargeProof) throw Error('Rainmaker charge proof already installed');
  const G = RG, game = G.game, match = G.match, net = G.netm;
  const actor = host ? net.byNid.get(Number(id)) : match.local;
  const probe = { token, id, host, game, match, net, session: net.s, actor,
    owner: actor?.owner, life: actor?.remote ? actor.net?.lastLife : actor?.netLife,
    matchId: net.cfg.id, frozen: game.frozen, skipRender: game._skipRender, mouse: G.input.mouse, mouseLeft: G.input.mouse.left };
  globalThis.__rankedChargeProof = probe;
  game.debug.freeze();
  const module = await import(new URL('patches/splatoon3/runtime/ranked/pose-admission.mjs', document.baseURI));
  probe.inputFor = module.rankedInputFor;
}

// Each serialized function is self-contained; Playwright does not capture a
// Node closure. The reader is installed as an observer, never a runtime patch.
export function readRainmakerChargeProbe({ token, seq = null, fire = null }) {
  const p = globalThis.__rankedChargeProof, G = RG;
  if (!p || p.token !== token) throw Error('Missing Rainmaker charge proof owner');
  const { game, match: m, net: nm, actor: a } = p;
  if (game.frozen !== true) throw Error('Rainmaker charge proof lost its frozen simulation clock');
  const life = a?.remote ? a.net?.lastLife : a?.netLife;
  if (G.game !== game || G.match !== m || G.netm !== nm || nm.match !== m || nm.s !== p.session || nm.cfg.id !== p.matchId
      || nm._disposed || m._disposed || m.state !== 'playing' || m.mode !== 'rainmaker' || m.ranked.winner !== null
      || m.ranked.rule.state.carrier !== p.id || !a?.alive || a.owner !== p.owner || life !== p.life
      || nm.byNid.get(a.nid) !== a || (p.host ? !nm.isHost || !a.remote : nm.isHost || a.remote || m.local !== a))
    throw Error('Rainmaker charge proof actor/match/session/owner/life changed: ' + JSON.stringify({ mode:m.mode, state:m.state,
      carrier:m.ranked?.rule.state.carrier, owner:a?.owner, expectedOwner:p.owner, life, expectedLife:p.life,
      alive:a?.alive, remote:a?.remote, host:nm.isHost, winner:m.ranked?.winner }));
  const input = p.host ? p.inputFor(nm.rankedInputs?.get(p.id), a, m, nm) : a._rankedInput;
  const age = p.host && input ? G.time - input.at : null;
  if (seq !== null && (!input || !Number.isSafeInteger(input.seq) || input.seq < seq || input.fire !== fire
      || !Number.isFinite(age) || age < 0 || age >= .75)) return false;
  const c = m.ranked.rule.state.charge;
  return { hostTime: G.time, match: p.matchId, owner: p.owner, life, seq: input?.seq ?? null,
    fire: input?.fire ?? null, at: input?.at ?? null, age, localFire: a._rankedInput?.fire ?? null,
    charge: c.value, seconds: c.seconds, firing: c.firing, recovery: c.recovery, pending: !!c.pending,
    shots: rankedWeaponEvents.map(e => ({ id: e.id, actorId: e.actorId, charge: e.charge, damage: e.damage, blastDamage: e.blastDamage })) };
}

export function stepRainmakerChargeOwner({ token, fire }) {
  const p = globalThis.__rankedChargeProof;
  const before = p.read({ token });
  if (p.host || before.shots.length) throw Error('Rainmaker owner step has an earlier shot or wrong role');
  if (RG.input.mouse !== p.mouse) throw Error('Rainmaker charge proof input owner changed');
  p.mouse.left = fire;
  // The first frame samples native Player -> Actor input. Wait for a later
  // ordinary 20Hz tick, because networking runs before this frame's controller.
  p.game._frame(1 / 60);
  if (p.actor._rankedInput?.fire !== fire) throw Error('Native carrier input did not consume the requested fire state');
  const previous = p.net.rankedInputSeq || 0;
  let frames = 1;
  while ((p.net.rankedInputSeq || 0) === previous && frames < 5) { p.game._frame(1 / 60); frames++; }
  const seq = p.net.rankedInputSeq;
  if (!Number.isSafeInteger(seq) || seq <= previous) throw Error('Native carrier produced no ordinary ranked input tick');
  return { frames, seq, fire, before, after: p.read({ token }) };
}

export function stepRainmakerChargeHost({ token, frames, release, seq }) {
  const p = globalThis.__rankedChargeProof, before = p.read({ token, seq, fire: !release });
  if (!before || !p.host || !Number.isInteger(frames) || frames < 1 || frames > 5 || before.shots.length)
    throw Error('Rainmaker host step has an earlier shot or invalid frame batch');
  for (let i = 0; i < frames; i++) p.game._frame(1 / 60);
  const after = p.read({ token });
  if (!release && after.shots.length) throw Error('Rainmaker fired before the explicit owner release: ' + JSON.stringify(after));
  return after;
}

export function restoreRainmakerChargeProbe({ token }) {
  const p = globalThis.__rankedChargeProof;
  if (!p || p.token !== token) return;
  p.mouse.left = p.mouseLeft;
  p.game._skipRender = p.skipRender;
  if (p.frozen) p.game.debug.freeze(); else p.game.debug.unfreeze();
  delete globalThis.__rankedChargeProof;
}

export async function releaseFullRankedRainmaker(host, guest, id, save = () => {}) {
  const token = 'ranked-charge-' + ++nextProof, pages = [host, guest];
  const receipt = { status: 'running', actorId: id, phases: [] };
  const record = (phase, value) => { receipt.phases.push({ phase, ...value }); save(receipt); };
  let originalError = null;
  try {
    // Install the exact same observer in both realms, then freeze both before
    // any hold. No event list, charge value, packet or input lease is reset.
    const installed = await Promise.allSettled(pages.map((page, i) => page.evaluate(installRainmakerChargeProbe, { token, id, host: i === 0 })));
    const failedInstall = installed.find(r => r.status === 'rejected');
    if (failedInstall) throw failedInstall.reason;
    await Promise.all(pages.map(page => page.evaluate(({ token, source }) => {
      const p = globalThis.__rankedChargeProof;
      if (p?.token !== token) throw Error('Rainmaker charge probe installation lost its owner');
      p.read = (0, eval)('(' + source + ')');
    }, { token, source: readRainmakerChargeProbe.toString() })));
    for (const page of pages) {
      const state = await page.evaluate(readRainmakerChargeProbe, { token });
      if (state.shots.length || state.charge !== 0 || state.firing || state.recovery !== 0 || state.pending)
        throw Error('Rainmaker charge proof did not start idle: ' + JSON.stringify(state));
    }
    let charged = false, frames = 0, lastSeq = 0;
    while (!charged && frames < 120) {
      const sent = await guest.evaluate(stepRainmakerChargeOwner, { token, fire: true });
      if (sent.seq <= lastSeq) throw Error('Rainmaker owner sequence did not advance');
      const accepted = await host.waitForFunction(readRainmakerChargeProbe, { token, seq: sent.seq, fire: true }, { timeout: 30000, polling: 20 });
      let value;
      try { value = await accepted.jsonValue(); } finally { await accepted.dispose(); }
      const state = await host.evaluate(stepRainmakerChargeHost, { token, frames: sent.frames, release: false, seq: sent.seq });
      record('hold', { sent, accepted: value, state });
      lastSeq = sent.seq; frames += sent.frames; charged = state.charge === 1;
    }
    if (!charged) throw Error('Native Rainmaker did not reach full charge within 120 paired frames');
    const sent = await guest.evaluate(stepRainmakerChargeOwner, { token, fire: false });
    if (sent.seq <= lastSeq) throw Error('Rainmaker release sequence did not advance');
    const accepted = await host.waitForFunction(readRainmakerChargeProbe, { token, seq: sent.seq, fire: false }, { timeout: 30000, polling: 20 });
    let value;
    try { value = await accepted.jsonValue(); } finally { await accepted.dispose(); }
    const state = await host.evaluate(stepRainmakerChargeHost, { token, frames: sent.frames, release: true, seq: sent.seq });
    record('release', { sent, accepted: value, state });
    receipt.status = 'passed'; save(receipt); return receipt;
  } catch (error) {
    originalError = error; receipt.status = 'failed'; receipt.error = error?.stack || String(error);
    const states = await Promise.allSettled(pages.map(page => page.evaluate(readRainmakerChargeProbe, { token })));
    receipt.failureStates = states.map(r => r.status === 'fulfilled' ? r.value : { error: String(r.reason) });
    save(receipt); throw error;
  }
  finally {
    const cleanup = await Promise.allSettled(pages.map(page => page.evaluate(restoreRainmakerChargeProbe, { token })));
    const failure = cleanup.find(r => r.status === 'rejected');
    if (failure) {
      receipt.status = 'failed'; receipt.cleanupErrors = cleanup.filter(r => r.status === 'rejected').map(r => String(r.reason)); save(receipt);
      if (!originalError) throw failure.reason;
    }
  }
}
