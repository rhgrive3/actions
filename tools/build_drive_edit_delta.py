#!/usr/bin/env python3
"""Build a Drive overlay from two exact Git trees; no git-tracked source edits."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.error
import urllib.request
import zipfile

BASE = 'b1f571da0d1233e0194d2cae42779cdb6bb70f61'
TARGET = 'fd82e9fc65986e207d8939869f4a5687e2962fc7'
ROOT = Path('deliverable')
FILES = ROOT / 'files'

def git(*args, binary=False):
    value = subprocess.check_output(['git', *args])
    return value if binary else value.decode('utf-8', 'surrogateescape').strip()

def tree(ref):
    # \0-delimited Git tree entries preserve all filename bytes.
    data = git('ls-tree', '-rz', '-r', ref, binary=True)
    out = {}
    for rec in data.split(b'\0'):
        if not rec:
            continue
        head, path = rec.split(b'\t', 1)
        mode, kind, sha = head.split(b' ')
        if kind != b'blob':
            raise RuntimeError('Unsupported Git tracked object ' + repr(rec[:80]))
        out[path.decode('utf-8', 'surrogateescape')] = (mode.decode(), sha.decode())
    return out

def sha256(b):
    return hashlib.sha256(b).hexdigest()

def blob(sha):
    return git('cat-file', 'blob', sha, binary=True)

def info(mode, payload):
    return dict(kind='symlink' if mode == '120000' else 'file',
                mode=mode, bytes=len(payload), sha256=sha256(payload))

def api(path):
    token = os.environ.get('GITHUB_TOKEN')
    req = urllib.request.Request('https://api.github.com/repos/rhgrive3/actions/' + path,
        headers={'Accept':'application/vnd.github+json',
                 'User-Agent':'inkwave-drive-edit-snapshot',
                 **({'Authorization':'Bearer ' + token} if token else {})})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def pr_status():
    status = {'main_commit': TARGET,
              'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'open_pull_requests':[], 'error':None}
    try:
        page = 1
        while True:
            prs = api('pulls?state=open&per_page=100&page=' + str(page))
            for pr in prs:
                row = {
                    'number':pr['number'], 'title':pr['title'],
                    'url':pr['html_url'], 'draft':pr.get('draft', False),
                    'base':pr['base']['ref'], 'head':pr['head']['ref'],
                    'head_sha':pr['head']['sha'],
                    'updated_at':pr['updated_at'],
                    'excluded':pr['number']==401
                }
                status['open_pull_requests'].append(row)
            if len(prs)<100:
                break
            page+=1
        status['open_pull_requests'].sort(key=lambda x: x['number'], reverse=True)
    except Exception as e:
        status['error'] = repr(e)
    (ROOT/'PR_STATUS.json').write_text(
        json.dumps(status, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    md = ['# Open PR status at source snapshot', '',
          'Main SHA: \x60'+TARGET+'\x60',
          'Checked (UTC): '+status['checked_at'], '',
          '| PR | Status | Source branch | Subject |',
          '|---|---|---|---|']
    for pr in status['open_pull_requests']:
        state = ('Draft' if pr['draft'] else 'Open') + (' (excluded)' if pr['excluded'] else '')
        title = pr['title'].replace('|','/')
        md.append(f"| [#{pr['number']}]({pr['url']}) | {state} | \x60{pr['head']}\x60 | {title} |")
    if status['error']:
        md.append('\nPR list error: '+status['error'])
    (ROOT/'PR_STATUS.md').write_text('\n'.join(md)+'\n', encoding='utf-8')
    return len(status['open_pull_requests'])

def main():
    assert git('rev-parse', 'HEAD') == TARGET, 'Checkout does not match target main'
    old = tree(BASE)
    new = tree(TARGET)
    paths = sorted(set(old) | set(new))
    changed = [p for p in paths if old.get(p) != new.get(p)]
    if not changed:
        raise RuntimeError('No changed tracked paths: check ref input')
    FILES.mkdir(parents=True, exist_ok=True)
    changes = []
    bytes_changed = 0
    for path in changed:
        old_entry = old.get(path)
        new_entry = new.get(path)
        old_payload = blob(old_entry[1]) if old_entry else None
        new_payload = blob(new_entry[1]) if new_entry else None
        if new_payload is not None:
            p = FILES / path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(new_payload)
            bytes_changed += len(new_payload)
        changes.append(dict(path=path,
                            status=('added' if not old_entry else 'deleted' if not new_entry else 'modified'),
                            old=info(old_entry[0], old_payload) if old_entry else None,
                            new=info(new_entry[0], new_payload) if new_entry else None))
    delta = dict(repo='rhgrive3/actions',base_commit=BASE,target_commit=TARGET,
                 captured_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                 git_tracked_base_count=len(old),git_tracked_target_count=len(new),
                 changed_count=len(changes),
                 deleted_count=sum(c['new'] is None for c in changes),
                 included_unmerged_pr_changes=False,
                 changes=changes)
    (ROOT/'DELTA_MANIFEST.json').write_text(
        json.dumps(delta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    shutil.copyfile(Path(__file__).with_name('apply_drive_edit_delta.py'), ROOT/'APPLY_UPDATE.py')
    n = pr_status()
    (ROOT/'README_CURRENT.md').write_text(
        '# INKWAVE current main: editable snapshot update\n\n'
        f'**Exact main SHA:** \x60{TARGET}\x60\n\n'
        f'**Previous full snapshot:** \x60{BASE}\x60 (47 original ZIP parts + guide).\n'
        f'**Updated tracked paths:** {len(changes)}; deleted: {delta["deleted_count"]}.\n'
        f'**Open PRs at packaging:** {n} (see PR_STATUS.json / .md). '
        'PR branch contents are not mixed into main.\n\n'
        '## Restore all files with SHA checks\n\n'
        '1. Keep the existing 47 \x60INKWAVE-b1f571da-part-NNN.zip\x60 archives and '
        '\x60INKWAVE-b1f571da-guide.zip\x60 in the same directory.\n'
        '2. Extract the old guide, then run \x60python3 RESTORE.py --archives . --output inkwave-main\x60.\n'
        '3. Extract this update ZIP into a separate \x60update-fd82e9\x60 directory.\n'
        '4. Run \x60python3 update-fd82e9/APPLY_UPDATE.py --source inkwave-main '
        '--baseline-manifest SOURCE_MANIFEST.json --package update-fd82e9\x60.\n'
        '5. The script verifies all unchanged files from the old manifest and '
        'all changed file SHA256 values before and after applying; any local edits prevent silent overwrite.\n\n'
        '**After step 4, inkwave-main contains exactly the Git-tracked bytes from main at '
        f'{TARGET}.** \n'
        'Do not rerun the old RESTORE.py afterward without repeating step 4.\n'
        'This is a Git-tracked source mirror, including inkwave-public, patches, scripts, '
        'models, reports and workflows. It does not include untracked build output or git history.\n',
        encoding='utf-8')
    # Build a local ZIP estimate to reject anything that would exceed the
    # user's 10,000,000-byte upload cap. upload-artifact does another ZIP.
    estimate = Path('delta-size-preview.zip')
    with zipfile.ZipFile(estimate,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in ROOT.rglob('*'):
            if p.is_file():
                z.write(p,p.relative_to(ROOT))
    actual = estimate.stat().st_size
    print('BASE', BASE, 'TARGET', TARGET, 'base files', len(old),
          'target files',len(new),'changed',len(changes),
          'raw changed bytes',bytes_changed, 'delta preview bytes',actual)
    if actual > 9_200_000:
        raise SystemExit('Update archive is too large for single Drive file; split required')
    print('DELTA READY',len(changes),'PR entries',n)

if __name__ == '__main__':
    main()
