/**
 * INKWAVE -> Google Drive, 5-minute verified incremental source backup (v3.2 A+ Edition).
 * SOURCE: https://github.com/rhgrive3/actions (read-only)
 * TARGET: existing verified INKWAVE editing folder (append-only deltas).
 * No PR merge, GitHub write, model/content modification or secret upload.
 *
 * v3.2 Upgrades & Guarantees:
 *  1. 100% Schema Compatibility with Existing 85+ Step Chain:
 *     Reads and writes `schema: 1`, `repository`, `baseline`, `lastSha`, AND `lastSyncedSha`
 *     alongside the full `chain` array (`{from, to, manifest, manifestId, partCount, changedFiles}`).
 *  2. Safe Subfolder Organization (`INKWAVE_AUTO_DELTAS` & `INKWAVE_ARCHIVED_DELTAS`):
 *     - New completed deltas are stored in `INKWAVE_AUTO_DELTAS/`.
 *     - `archiveLegacyDeltas()` inspects `state.consolidatedSha` (or `SOURCE_MANIFEST_CURRENT.json`)
 *       and `INKWAVE_AUTO_PENDING.json`:
 *         * Never touches uncommitted files belonging to an active `INKWAVE_AUTO_PENDING.json`.
 *         * Moves only deltas at or before `consolidatedSha` into `INKWAVE_ARCHIVED_DELTAS/`.
 *         * Moves post-consolidation active deltas from root into `INKWAVE_AUTO_DELTAS/`.
 *  3. Multi-Folder Lookup (`findDeltaFile_`) & Deterministic Duplicate Resolution (`uniqueFile_`).
 */
const IW = Object.freeze({
  owner: 'rhgrive3', repo: 'actions', branch: 'main',
  folderId: '1hLvz1DGhRuYZVPI3l5HTiAVGvxD8f1KS',
  baseline: '7ea9410d9aaca46ddb864b96ca4af4ea475f82d6',
  priorParts: 47,
  deltaSubfolder: 'INKWAVE_AUTO_DELTAS',
  archiveSubfolder: 'INKWAVE_ARCHIVED_DELTAS',
  stateName: 'INKWAVE_AUTO_LATEST.json',
  pendingName: 'INKWAVE_AUTO_PENDING.json',
  prName: 'PR_STATUS_AUTO.json',
  maxZipBytes: 9000000,     // strict <10,000,000 bytes, with headroom
  maxZipInput: 6000000,     // even incompressible payload fits
  maxBlobBytes: 22000000,  // larger GitHub objects require the large-export workflow
  maxChangedFilesPerRun: 1000,
  maxBatchFiles: 12,
  maxBatchInput: 900000,
  maxRunMillis: 145000,     // conservatively below Apps Script's 6 minute cap
});

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function normalizeState_(state) {
  if (!state || typeof state !== 'object') throw new Error('Invalid state object');
  const head = state.lastSha || state.lastSyncedSha ||
    (Array.isArray(state.chain) && state.chain.length ? state.chain[state.chain.length - 1].to : state.baseline);
  state.lastSha = head;
  state.lastSyncedSha = head;
  if (!state.schema) state.schema = 1;
  if (!state.repository) state.repository = IW.owner + '/' + IW.repo;
  if (!Array.isArray(state.chain)) state.chain = [];
  return state;
}

/** Install once. The owner must authorize Apps Script Drive + UrlFetch. */
function installFiveMinuteTrigger() {
  const folder = DriveApp.getFolderById(IW.folderId);
  initState_(folder);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncMainToDrive')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncMainToDrive').timeBased().everyMinutes(5).create();
  console.log('Installed 5-minute sync to folder ' + folder.getUrl());
  syncMainToDrive();
}

/** Main entry. Safe to run manually or with time-driven triggers. */
function syncMainToDrive() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const start = Date.now();
  try {
    const folder = DriveApp.getFolderById(IW.folderId);
    const deltaFolder = getOrCreateSubfolder_(folder, IW.deltaSubfolder);
    const stateFile = initState_(folder);
    const state = normalizeState_(JSON.parse(stateFile.getBlob().getDataAsString('UTF-8')));
    validateState_(state);
    const backoff = Number(PropertiesService.getScriptProperties().getProperty('IW_RATE_BACKOFF_UNTIL') || 0);
    if (backoff > Date.now()) {
      console.warn('GitHub rate cooldown until ' + new Date(backoff).toISOString());
      return;
    }
    let pendingFile = uniqueFile_(folder, IW.pendingName);
    let pending = pendingFile ? JSON.parse(pendingFile.getBlob().getDataAsString('UTF-8')) : null;
    if (pending && pending.to === state.lastSha) {
      pendingFile.setTrashed(true);
      pendingFile = null;
      pending = null;
    }
    if (!pending) {
      const head = github_('commits/' + encodeURIComponent(IW.branch));
      const target = head.sha;
      assertSha_(target);
      if (target === state.lastSha) {
        maybeRefreshPrStatus_(folder, target);
        console.log('No change: ' + target);
        return;
      }
      const oldFiles = gitTree_(state.lastSha);
      const newFiles = gitTree_(target);
      const keys = Object.keys(oldFiles).concat(Object.keys(newFiles));
      const paths = [...new Set(keys)].sort();
      const changes = [];
      for (const path of paths) {
        const before = oldFiles[path] || null, after = newFiles[path] || null;
        if (before && after && before.sha === after.sha && before.mode === after.mode && before.type === after.type) continue;
        validatePath_(path);
        if (before && before.type !== 'blob' || after && after.type !== 'blob') {
          throw new Error('Git submodule/non-blob entry requires explicit migration: ' + path);
        }
        changes.push({path, before, after});
      }
      pending = {schema: 1, from: state.lastSha, to: target,
        startedUtc: new Date().toISOString(), changes,
        cursor: 0, completed: [], parts: []};
      pendingFile = folder.createFile(IW.pendingName, JSON.stringify(pending), MimeType.PLAIN_TEXT);
      console.log('Queued ' + changes.length + ' tracked changes, ' + pending.from.substring(0,8) + ' -> ' + target.substring(0,8));
    }
    if (pending.from !== state.lastSha) throw new Error('Pending delta base differs from committed Drive checkpoint');
    continuePending_(folder, deltaFolder, stateFile, state, pendingFile, pending, start);
  } catch (error) {
    console.error('INKWAVE backup checkpoint not advanced: ' + String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function initState_(folder) {
  const found = uniqueFile_(folder, IW.stateName);
  if (found) return found;
  const metadata = uniqueFile_(folder, 'SOURCE_MANIFEST_CURRENT.json');
  if (!metadata) throw new Error('Verified editing snapshot manifest is missing');
  const existing = JSON.parse(metadata.getBlob().getDataAsString('UTF-8'));
  if (existing.tracked_count < 4000) {
    throw new Error('Unexpected editing baseline; no automatic bootstrap: ' + existing.main_commit);
  }
  const first = normalizeState_({
    schema: 1,
    repository: IW.owner + '/' + IW.repo,
    baseline: existing.main_commit,
    lastSha: existing.main_commit,
    lastSyncedSha: existing.main_commit,
    updatedUtc: new Date().toISOString(),
    chain: [],
  });
  const created = folder.createFile(IW.stateName, JSON.stringify(first), MimeType.PLAIN_TEXT);
  console.log('Initialized automatic append-only overlays from verified main ' + existing.main_commit);
  return created;
}

function continuePending_(folder, deltaFolder, stateFile, state, pendingFile, p, start) {
  let changedThisRun = 0;
  while (p.cursor < p.changes.length &&
         changedThisRun < IW.maxChangedFilesPerRun &&
         Date.now() - start < IW.maxRunMillis) {
    const entryBytes = [];
    const done = [];
    let bytes = 0;
    while (p.cursor + done.length < p.changes.length &&
           changedThisRun + done.length < IW.maxChangedFilesPerRun &&
           done.length < IW.maxBatchFiles &&
           Date.now() - start < IW.maxRunMillis) {
      const item = p.changes[p.cursor + done.length];
      const before = item.before, after = item.after;
      if (!after || (before && before.sha === after.sha)) {
        done.push({path:item.path, before, after, bytes:0, sha256:null, chunks:[]});
        continue;
      }
      if (after.size > IW.maxBlobBytes) {
        throw new Error('Blob ' + item.path + ' is ' + after.size +
          ' bytes (too large for Apps Script). Keep checkpoint, use GitHub Actions large-export fallback.');
      }
      if (entryBytes.length && bytes + after.size > IW.maxBatchInput) break;
      const content = gitBlob_(after.sha);
      if (content.length !== after.size) throw new Error('Git blob byte count mismatch: ' + item.path);
      const checksum = shaHex_(content, Utilities.DigestAlgorithm.SHA_256);
      const chunks = [];
      for (let offset = 0, idx = 0; offset < content.length || !idx; idx++) {
        const end = Math.min(content.length, offset + IW.maxZipInput);
        const slice = content.slice(offset, end);
        const name = 'payload/' + ('000000' + (p.cursor + done.length)).slice(-6) +
          '-' + ('000' + idx).slice(-3) + '.bin';
        chunks.push({member:name, size:slice.length,
          sha256:shaHex_(slice, Utilities.DigestAlgorithm.SHA_256), offset});
        entryBytes.push(Utilities.newBlob(slice, 'application/octet-stream', name));
        offset = end;
        if (content.length === 0) break;
      }
      done.push({path:item.path, before, after, bytes:content.length, sha256:checksum, chunks});
      bytes += content.length;
      if (bytes >= IW.maxZipInput) break;
    }
    if (!done.length) break;
    if (entryBytes.length) {
      const staged = [];
      let pack = [], packBytes = 0;
      for (const entry of entryBytes) {
        const entryLen = entry.getBytes().length;
        if (pack.length && packBytes + entryLen > IW.maxZipInput) {
          staged.push(pack); pack=[]; packBytes=0;
        }
        pack.push(entry); packBytes += entryLen;
      }
      if (pack.length) staged.push(pack);
      for (const packGroup of staged) {
        const n = p.parts.length + 1;
        const name = 'INKWAVE-auto-' + p.from.slice(0,8) + '-to-' +
          p.to.slice(0,8) + '-part-' + ('000' + n).slice(-3) + '.zip';
        const zip = Utilities.zip(packGroup, name);
        const zipBytes = zip.getBytes();
        if (zipBytes.length >= IW.maxZipBytes) throw new Error('ZIP violates 9MB cap: ' + name);
        verifyZipPayload_(zip, packGroup, name);
        const saved = immutableBlob_(deltaFolder, name, zip, packGroup, p.parts);
        if (saved.file.getSize() !== saved.bytes) throw new Error('Drive upload size verification failed: ' + name);
        const members = packGroup.map(x=>x.getName());
        p.parts.push({name, id:saved.file.getId(), subfolder:IW.deltaSubfolder, bytes:saved.bytes, sha256:saved.sha256, members});
        for (const row of done) for (const chunk of row.chunks) {
          if (members.includes(chunk.member)) chunk.part = n - 1;
        }
      }
    }
    for (const row of done) {
      if (row.after && row.after.sha !== (row.before && row.before.sha)) {
        const covered = row.chunks.reduce((a,c)=>a+c.size,0);
        if (covered !== row.bytes || row.chunks.some(c=>c.part===undefined)) {
          throw new Error('Uncommitted or missing ZIP payload for ' + row.path);
        }
      }
      p.completed.push(row);
    }
    p.cursor += done.length;
    changedThisRun += done.length;
    pendingFile.setContent(JSON.stringify(p));
    console.log('Staged ' + p.cursor + '/' + p.changes.length + ' files for ' + p.to.slice(0,8));
  }
  if (p.cursor === p.changes.length) {
    finishPending_(folder, deltaFolder, stateFile, state, pendingFile, p);
  } else {
    console.log('Paused safely; next 5-minute run resumes from changed entry ' + p.cursor);
  }
}

function finishPending_(folder, deltaFolder, stateFile, state, pendingFile, p) {
  if (p.cursor !== p.changes.length || p.completed.length !== p.changes.length) {
    throw new Error('Incomplete manifest cannot be published');
  }
  const pr = pullStatus_(p.to);
  const manifestName = 'INKWAVE-auto-' + p.from.slice(0,8) + '-to-' +
    p.to.slice(0,8) + '-manifest.json';
  const manifest = {schema:1, repo:state.repository, from:p.from, to:p.to,
    createdUtc:new Date().toISOString(), subfolder:IW.deltaSubfolder, changes:p.completed,
    parts:p.parts.map(x=>({name:x.name, bytes:x.bytes, sha256:x.sha256,
      members:x.members})), prStatus:pr};
  const manifestText = JSON.stringify(manifest);
  if (Utilities.newBlob(manifestText).getBytes().length >= IW.maxZipBytes) {
    throw new Error('Manifest too large for single Drive file');
  }
  const manifestFile = immutableText_(deltaFolder, manifestName, manifestText);
  const next = normalizeState_({
    schema: 1,
    repository: state.repository,
    baseline: state.baseline,
    consolidatedSha: state.consolidatedSha || null,
    lastSha: p.to,
    lastSyncedSha: p.to,
    updatedUtc: new Date().toISOString(),
    chain: state.chain.concat([{
      from: p.from,
      to: p.to,
      manifest: manifestName,
      manifestId: manifestFile.getId(),
      subfolder: IW.deltaSubfolder,
      partCount: p.parts.length,
      changedFiles: p.completed.length,
    }]),
  });
  stateFile.setContent(JSON.stringify(next));
  PropertiesService.getScriptProperties().setProperty('IW_LAST_SHA', p.to);
  pendingFile.setTrashed(true);
  console.log('COMPLETE / Drive committed ' + p.to + ' (' + p.completed.length + ' changed files)');
  upsertText_(folder, IW.prName, JSON.stringify(pr));
  PropertiesService.getScriptProperties().setProperty('IW_LAST_PR_CHECK', String(Date.now()));
}

/**
 * Safely sweep superseded root-level INKWAVE-auto-* files into INKWAVE_ARCHIVED_DELTAS/
 * and organize active post-consolidation deltas into INKWAVE_AUTO_DELTAS/, while strictly
 * protecting any in-flight INKWAVE_AUTO_PENDING.json files.
 */
function archiveLegacyDeltas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return {archived: 0, organizedActive: 0, protectedPending: 0};
  const start = Date.now();
  try {
    const folder = DriveApp.getFolderById(IW.folderId);
    const archive = getOrCreateSubfolder_(folder, IW.archiveSubfolder);
    const active = getOrCreateSubfolder_(folder, IW.deltaSubfolder);
    const stateFile = uniqueFile_(folder, IW.stateName);
    const state = stateFile ? normalizeState_(JSON.parse(stateFile.getBlob().getDataAsString('UTF-8'))) : null;

    let pendingPrefix = null;
    const pendingFile = uniqueFile_(folder, IW.pendingName);
    if (pendingFile) {
      const p = JSON.parse(pendingFile.getBlob().getDataAsString('UTF-8'));
      if (p && p.from && p.to) {
        pendingPrefix = 'INKWAVE-auto-' + p.from.slice(0, 8) + '-to-' + p.to.slice(0, 8);
      }
    }

    let consolidatedSha = state && state.consolidatedSha ? state.consolidatedSha : null;
    if (!consolidatedSha) {
      const currMan = uniqueFile_(folder, 'SOURCE_MANIFEST_CURRENT.json');
      if (currMan) {
        try {
          consolidatedSha = JSON.parse(currMan.getBlob().getDataAsString('UTF-8')).main_commit || null;
        } catch (e) {}
      }
    }

    const supersededPrefixes = Object.create(null);
    const activePrefixes = Object.create(null);
    if (state && Array.isArray(state.chain)) {
      let cutoffIdx = -1;
      if (consolidatedSha) {
        for (let i = 0; i < state.chain.length; i++) {
          if (state.chain[i].to.indexOf(consolidatedSha.slice(0, 8)) === 0) {
            cutoffIdx = i;
            break;
          }
        }
      }
      for (let i = 0; i < state.chain.length; i++) {
        const step = state.chain[i];
        const pref = 'INKWAVE-auto-' + step.from.slice(0, 8) + '-to-' + step.to.slice(0, 8);
        if (i <= cutoffIdx) {
          supersededPrefixes[pref] = true;
          step.subfolder = IW.archiveSubfolder;
        } else {
          activePrefixes[pref] = true;
          step.subfolder = IW.deltaSubfolder;
        }
      }
    }

    const it = folder.getFiles();
    let archived = 0, organizedActive = 0, protectedPending = 0;
    while (it.hasNext() && Date.now() - start < IW.maxRunMillis) {
      const f = it.next();
      const name = f.getName();
      if (name.indexOf('INKWAVE-auto-') !== 0) continue;
      if (pendingPrefix && name.indexOf(pendingPrefix) === 0) {
        protectedPending++;
        continue;
      }
      const match = name.match(/^(INKWAVE-auto-[0-9a-f]{8}-to-[0-9a-f]{8})/);
      const prefix = match ? match[1] : null;
      if (prefix && supersededPrefixes[prefix]) {
        f.moveTo(archive);
        archived++;
      } else if (prefix && activePrefixes[prefix]) {
        f.moveTo(active);
        organizedActive++;
      }
    }
    if (stateFile && state) {
      stateFile.setContent(JSON.stringify(normalizeState_(state)));
    }
    console.log('Prune summary: archived=' + archived + ', active=' + organizedActive + ', protectedPending=' + protectedPending);
    return {archived: archived, organizedActive: organizedActive, protectedPending: protectedPending};
  } finally {
    lock.releaseLock();
  }
}

/** Rotate baseline or record consolidatedSha after verifying a consolidated snapshot. */
function rotateBaselineToConsolidated(newBaselineSha, trimChain) {
  assertSha_(newBaselineSha);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Could not acquire lock');
  try {
    const folder = DriveApp.getFolderById(IW.folderId);
    const stateFile = uniqueFile_(folder, IW.stateName);
    if (!stateFile) throw new Error('State file missing');
    const state = normalizeState_(JSON.parse(stateFile.getBlob().getDataAsString('UTF-8')));
    const idx = state.chain.findIndex(item => item.to === newBaselineSha);
    if (idx === -1 && state.baseline !== newBaselineSha) {
      throw new Error('Target SHA not found in verified chain: ' + newBaselineSha);
    }
    const updated = normalizeState_({
      schema: 1,
      repository: state.repository,
      baseline: trimChain ? newBaselineSha : state.baseline,
      consolidatedSha: newBaselineSha,
      lastSha: state.lastSha,
      lastSyncedSha: state.lastSha,
      updatedUtc: new Date().toISOString(),
      chain: trimChain && idx >= 0 ? state.chain.slice(idx + 1) : state.chain,
    });
    stateFile.setContent(JSON.stringify(updated));
    return updated;
  } finally {
    lock.releaseLock();
  }
}

function pullStatus_(sha) {
  const pr = {atUtc:new Date().toISOString(),mainSha:sha, excludedPr:401};
  try {
    const all = [];
    for (let page=1;page<=5;page++) {
      const list = github_('pulls?state=open&per_page=100&page=' + page);
      all.push(...list.map(x=>({number:x.number,title:x.title,url:x.html_url,
        head:x.head.sha, draft:x.draft, excluded:x.number===401})));
      if (list.length < 100) break;
    }
    pr.open = all;
  } catch (error) {
    pr.error = String(error);
  }
  return pr;
}
function maybeRefreshPrStatus_(folder, sha) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('IW_LAST_PR_CHECK') || 0);
  if (Date.now()-last < 3600000) return;
  const pr = pullStatus_(sha);
  if (!pr.error) {
    upsertText_(folder, IW.prName, JSON.stringify(pr));
    props.setProperty('IW_LAST_PR_CHECK', String(Date.now()));
  } else console.warn('Could not update PR list: '+pr.error);
}

function gitTree_(ref) {
  assertSha_(ref);
  const out = {};
  const tree = github_('git/trees/' + ref + '?recursive=1');
  if (!tree.truncated) {
    tree.tree.forEach(x=>{
      if (x.type !== 'tree') out[x.path] = {sha:x.sha,mode:x.mode,size:x.size || 0,type:x.type};
    });
    return out;
  }
  const stack = [{sha:ref,prefix:''}];
  while (stack.length) {
    const sub = stack.pop();
    const obj = github_('git/trees/' + sub.sha);
    if (obj.truncated) throw new Error('Nonrecursive Git tree was truncated: ' + sub.sha);
    for (const x of obj.tree) {
      const name = sub.prefix + x.path;
      if (x.type === 'tree') stack.push({sha:x.sha,prefix:name+'/'});
      else out[name] = {sha:x.sha,mode:x.mode,size:x.size || 0,type:x.type};
    }
  }
  return out;
}

function gitBlob_(sha) {
  assertSha_(sha);
  const value = github_('git/blobs/' + sha);
  if (value.sha !== sha || value.encoding !== 'base64') throw new Error('GitHub blob response invalid: ' + sha);
  const bytes = Utilities.base64Decode((value.content || '').replace(/\s/g,''));
  if (value.size !== bytes.length) throw new Error('Blob length check failed for ' + sha);
  const header = Utilities.newBlob('blob ' + bytes.length + '\u0000').getBytes();
  const computed = shaHex_(header.concat(bytes), Utilities.DigestAlgorithm.SHA_1);
  if (computed !== sha) throw new Error('Git object SHA-1 mismatch: ' + sha);
  return bytes;
}

function github_(route) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const headers = {'Accept':'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28','User-Agent':'INKWAVE-DriveAutoSync'};
  if (token) headers.Authorization = 'Bearer ' + token;
  let last;
  for (let trial=0;trial<3;trial++) {
    const res = UrlFetchApp.fetch('https://api.github.com/repos/' + IW.owner +
      '/' + IW.repo + '/' + route, {headers, muteHttpExceptions:true});
    const status = res.getResponseCode();
    if (status===200) return JSON.parse(res.getContentText('UTF-8'));
    last = status + ': ' + res.getContentText('UTF-8').slice(0,320);
    if (status === 403 || status === 429) {
      const headers = res.getAllHeaders ? res.getAllHeaders() : {};
      const pick = key => headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];
      const reset = Number(pick('X-RateLimit-Reset')) * 1000;
      const retry = Number(pick('Retry-After')) * 1000;
      const waitUntil = Date.now() + (retry > 0 ? retry : 5 * 60000);
      const until = reset > Date.now() && pick('X-RateLimit-Remaining') === '0'
        ? Math.max(waitUntil, reset + 1500) : waitUntil;
      PropertiesService.getScriptProperties().setProperty('IW_RATE_BACKOFF_UNTIL', String(until));
      console.warn('GitHub rate limit cooldown until ' + new Date(until).toISOString());
    }
    if (![502,503,504].includes(status)) break;
    Utilities.sleep((trial+1)*800);
  }
  throw new Error('GitHub request failed (read-only): '+ route + ' '+last);
}

function verifyZipPayload_(zip, original, name) {
  const got = Utilities.unzip(zip);
  if (got.length !== original.length) {
    throw new Error('ZIP member count mismatch: ' + name +
      ' expected ' + original.length + ' got ' + got.length);
  }
  const expected = Object.create(null);
  for (const source of original) {
    const member = source.getName();
    if (expected[member]) throw new Error('Duplicate ZIP member: ' + member);
    expected[member] = {
      bytes: source.getBytes().length,
      hash: shaHex_(source.getBytes(), Utilities.DigestAlgorithm.SHA_256),
    };
  }
  for (const item of got) {
    const member = item.getName(), check = expected[member];
    if (!check) throw new Error('Unexpected ZIP member: ' + member);
    const actual = item.getBytes();
    if (actual.length !== check.bytes ||
        shaHex_(actual, Utilities.DigestAlgorithm.SHA_256) !== check.hash) {
      throw new Error('Corrupt ZIP contents: ' + member + ' in ' + name);
    }
    delete expected[member];
  }
  if (Object.keys(expected).length) throw new Error('Missing ZIP members: ' + name);
}

function immutableBlob_(folder, name, blob, proposedMembers, checkpointParts) {
  const existing = uniqueFile_(folder, name);
  if (existing) {
    const members = Utilities.unzip(existing.getBlob());
    const actual = Object.fromEntries(members.map(x=>[x.getName(), shaHex_(x.getBytes(), Utilities.DigestAlgorithm.SHA_256)]));
    if (members.length !== proposedMembers.length || proposedMembers.some(x=>
      actual[x.getName()] !== shaHex_(x.getBytes(), Utilities.DigestAlgorithm.SHA_256))) {
      if ((checkpointParts || []).some(x => x.name === name)) {
        throw new Error('Committed checkpoint references an unexpected ZIP: ' + name);
      }
      existing.setName('QUARANTINED_ORPHAN_' + existing.getId() + '_' + name);
      console.warn('Renamed uncommitted corrupt ZIP: ' + name);
    } else {
      const bytes = existing.getBlob().getBytes();
      return {file:existing, bytes:bytes.length, sha256:shaHex_(bytes, Utilities.DigestAlgorithm.SHA_256)};
    }
  }
  const zipBytes = blob.getBytes();
  const file = folder.createFile(blob);
  return {file, bytes:zipBytes.length, sha256:shaHex_(zipBytes, Utilities.DigestAlgorithm.SHA_256)};
}
function immutableText_(folder, name, content) {
  const exists = uniqueFile_(folder, name);
  if (exists) {
    const old = JSON.parse(exists.getBlob().getDataAsString('UTF-8'));
    const incoming = JSON.parse(content);
    if (old.from !== incoming.from || old.to !== incoming.to ||
        JSON.stringify(old.changes) !== JSON.stringify(incoming.changes)) {
      throw new Error('Immutable source delta manifest conflict: ' + name);
    }
    return exists;
  }
  return folder.createFile(name, content, MimeType.PLAIN_TEXT);
}
function upsertText_(folder, name, content) {
  const f = uniqueFile_(folder, name);
  if (f) f.setContent(content);
  else folder.createFile(name, content, MimeType.PLAIN_TEXT);
}
function uniqueFile_(folder, name) {
  const it = folder.getFilesByName(name);
  if (!it.hasNext()) return null;
  const matches = [];
  while (it.hasNext()) matches.push(it.next());
  if (matches.length === 1) return matches[0];
  matches.sort((a, b) => b.getLastUpdated().getTime() - a.getLastUpdated().getTime());
  for (let i = 1; i < matches.length; i++) {
    matches[i].setName('DUPLICATE_ARCHIVED_' + matches[i].getId() + '_' + name);
  }
  return matches[0];
}
function findDeltaFile_(folder, name) {
  const direct = uniqueFile_(folder, name);
  if (direct) return direct;
  const subNames = [IW.deltaSubfolder, IW.archiveSubfolder];
  for (let i = 0; i < subNames.length; i++) {
    const fit = folder.getFoldersByName(subNames[i]);
    if (fit.hasNext()) {
      const f = uniqueFile_(fit.next(), name);
      if (f) return f;
    }
  }
  return null;
}
function shaHex_(bytes, algorithm) {
  return Utilities.computeDigest(algorithm, bytes)
    .map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
}
function validatePath_(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p=>p==='..'||p==='.'||!p)) {
    throw new Error('Unsafe Git path: '+path);
  }
}
function assertSha_(sha) {if(!/^[0-9a-f]{40}$/.test(sha))throw new Error('Invalid Git SHA');}
function validateState_(state) {
  normalizeState_(state);
  if(state.schema!==1 || state.repository!==IW.owner+'/'+IW.repo || !Array.isArray(state.chain)) {
    throw new Error('Unknown or tampered Drive state');
  }
  assertSha_(state.baseline);
  assertSha_(state.lastSha);
  assertSha_(state.lastSyncedSha);
  if (state.lastSha !== state.lastSyncedSha) {
    throw new Error('Drive state lastSha and lastSyncedSha disagree');
  }
  let cursor=state.baseline;
  for (const item of state.chain) {
    if(item.from!==cursor) throw new Error('Broken Drive checkpoint chain');
    cursor=item.to;
  }
  if(cursor!==state.lastSha)throw new Error('Drive checkpoint head disagrees with chain');
}

function showBackupStatus() {
  const folder=DriveApp.getFolderById(IW.folderId);
  const state=normalizeState_(JSON.parse(initState_(folder).getBlob().getDataAsString('UTF-8')));
  const pending=uniqueFile_(folder,IW.pendingName);
  console.log(JSON.stringify({latest:state.lastSha, lastSyncedSha:state.lastSyncedSha, baseline:state.baseline,
    consolidatedSha:state.consolidatedSha || null,
    deltas:state.chain.length,
    pending:pending?JSON.parse(pending.getBlob().getDataAsString('UTF-8')).cursor:null},null,2));
}

function uninstallFiveMinuteTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t=>t.getHandlerFunction()==='syncMainToDrive')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  console.log('Removed INKWAVE 5-minute triggers; Drive archives were preserved.');
}
