// QA-only observation. This module never authorizes/ignores a failed request,
// changes music, controls playback, retries a load, or advances game time.
export async function observeStreamedMusic({ context, page, assetURL, receipt, ownerGlobal = '__G' }) {
  if (!['__G', 's3ProbeG'].includes(ownerGlobal)) throw new Error('Explicit supported game owner required');
  Object.assign(receipt, { schema: 1, assetURL, ownerGlobal, media: [], network: [], snapshots: [], diagnostics: [], dropped: { media: 0, network: 0, snapshots: 0, association: 0 } });
  const requests = new Set(), jetPlayers = new Set(), pendingPlayers = new Map();
  let closing = false, capturedBytes = 0, pendingCharacters = 0;
  receipt.interpretation = 'Observation only: canceled requests remain errors in the capture gate';
  receipt.limits = { media: 256, network: 128, snapshots: 8, playerIds: 8, pendingPerPlayer: 8, eventCharacters: 2048, retainedCharacters: 512 * 1024, pendingCharacters: 128 * 1024 };
  const push = (kind, row) => {
    const cap = kind === 'media' ? 256 : 128;
    const bytes = JSON.stringify(row).length;
    if (receipt[kind].length >= cap || capturedBytes + bytes > 512 * 1024) { receipt.dropped[kind]++; return; }
    capturedBytes += bytes;
    receipt[kind].push({ observedAt: new Date().toISOString(), ...row });
  };
  const matches = url => { try { return new URL(url).href === assetURL; } catch { return false; } };
  const detail = value => {
    const json = JSON.stringify(value);
    return json.length <= 2048 ? value : { truncated: true, originalCharacters: json.length, prefix: json.slice(0, 2048) };
  };
  try {
    const cdp = await context.newCDPSession(page);
    // Media elements are off-DOM. Associate CDP player IDs only after an exact
    // Jet URL property/load event; keep at most eight short pending histories.
    const containsURL = (value, depth = 0) => {
      if (depth > 8 || value == null) return false;
      if (typeof value === 'string') {
        if (matches(value)) return true;
        if (value.length <= 8192 && (value[0] === '{' || value[0] === '[')) {
          try { return containsURL(JSON.parse(value), depth + 1); } catch { return false; }
        }
        return false;
      }
      return typeof value === 'object' && Object.values(value).some(v => containsURL(v, depth + 1));
    };
    for (const event of ['playerPropertiesChanged', 'playerEventsAdded', 'playerErrorsRaised', 'playerMessagesLogged'])
      cdp.on('Media.' + event, data => {
        const id = data.playerId;
        if (!id) return;
        const row = { event, phase: closing ? 'context-close' : 'capture', data: detail(data) };
        if (!jetPlayers.has(id) && containsURL(data)) {
          if (jetPlayers.size >= 8) { receipt.dropped.media++; return; }
          jetPlayers.add(id);
          for (const prior of pendingPlayers.get(id) || []) { pendingCharacters -= JSON.stringify(prior).length; push('media', prior); }
          pendingPlayers.delete(id);
        }
        if (jetPlayers.has(id)) push('media', row);
        else if (pendingPlayers.has(id) || pendingPlayers.size < 8) {
          const pending = pendingPlayers.get(id) || [];
          const size = JSON.stringify(row).length;
          if (pending.length < 8 && pendingCharacters + size <= 128 * 1024) { pending.push(row); pendingCharacters += size; }
          else receipt.dropped.association++;
          pendingPlayers.set(id, pending);
        } else receipt.dropped.association++;
      });
    cdp.on('Network.requestWillBeSent', data => {
      if (!matches(data.request?.url)) return;
      if (!requests.has(data.requestId) && requests.size >= 128) { receipt.dropped.network++; return; }
      requests.add(data.requestId);
      push('network', { event: 'request', requestId: data.requestId, timestamp: data.timestamp, wallTime: data.wallTime,
        type: data.type, method: data.request.method, url: data.request.url,
        range: data.request.headers?.Range ?? data.request.headers?.range ?? null });
    });
    cdp.on('Network.responseReceived', data => {
      if (!requests.has(data.requestId)) return;
      const r = data.response;
      push('network', { event: 'response', requestId: data.requestId, timestamp: data.timestamp, type: data.type,
        status: r.status, mimeType: r.mimeType, url: r.url, headers: detail(r.headers), fromDiskCache: r.fromDiskCache ?? false });
    });
    cdp.on('Network.loadingFinished', data => {
      if (requests.has(data.requestId)) push('network', { event: 'finished', ...data });
    });
    cdp.on('Network.loadingFailed', data => {
      if (requests.has(data.requestId)) push('network', { event: 'failed', ...data,
        phase: closing ? 'context-close' : 'capture', cancellationObserved: data.canceled === true, autoAccepted: false });
    });
    await cdp.send('Network.enable');
    await cdp.send('Media.enable');
    receipt.enabled = true;
  } catch (error) {
    receipt.enabled = false;
    receipt.diagnostics.push({ event: 'observer-unavailable', error: String(error?.message || error) });
  }
  const snapshot = async reason => {
    if (receipt.snapshots.length >= 8) { receipt.dropped.snapshots++; return; }
    try {
      const state = await page.evaluate(({ ownerGlobal }) => {
        const owner = window[ownerGlobal], music = owner?.music;
        const element = el => !el ? null : ({ currentSrc: el.currentSrc, src: el.getAttribute('src'),
          currentTime: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : null,
          paused: el.paused, ended: el.ended, seeking: el.seeking,
          readyState: el.readyState, networkState: el.networkState,
          error: el.error ? { code: el.error.code, message: el.error.message } : null });
        const player = p => !p ? null : ({ id: p.id, disposed: p.disposed ?? null, failed: p.failed ?? null, element: element(p.element) });
        return { ownerGlobal, ownerPresent: !!owner, musicPresent: !!music, track: music?.track ?? null, desiredTrack: music?._desiredTrack ?? null,
          current: player(music?.current), preloaded: element(music?._preloadedFile?.element),
          players: music?.players?.slice(0, 8).map(player) ?? [], retryCount: music?._fileRetryCount ?? null,
          errorReported: music?._fileErrorReported ?? null, audioContextState: music?.ctx?.state ?? null,
          audioContextTime: music?.ctx?.currentTime ?? null, matchState: owner?.match?.state ?? null };
      }, { ownerGlobal });
      receipt.snapshots.push({ reason, observedAt: new Date().toISOString(), state });
    } catch (error) {
      receipt.snapshots.push({ reason, observedAt: new Date().toISOString(), error: String(error?.message || error) });
    }
  };
  const close = async () => {
    await snapshot('before-context-close');
    closing = true;
    receipt.closeStartedAt = new Date().toISOString();
    try { return await context.close(); }
    finally { receipt.closeFinishedAt = new Date().toISOString(); }
  };
  return { snapshot, close };
}
