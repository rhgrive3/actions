#!/usr/bin/env python3
"""Collect requested public audio references; never treat filenames as cue proof.

No credentials or game files are discovered outside the explicit public sources.
This tool only creates audit artifacts. It does not install sounds or modify Git.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import zipfile
import requests
from bs4 import BeautifulSoup

ROOT = Path.cwd()
OUT = ROOT / 'reports' / 'audio-fidelity-source-audit'
OUT.mkdir(parents=True, exist_ok=True)
FOLDER = '1D7So33YcZJaU_W5eC_H8OMFnUxGA8lYJ'
TIMEOUT = (15, 45)
MAX_BYTES = 12 * 1024 * 1024

def save_json(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')

def get(url):
    r = requests.get(url, timeout=TIMEOUT, headers={'User-Agent':'Mozilla/5.0 audio-reference-audit'}, allow_redirects=True)
    r.raise_for_status()
    if len(r.content) > MAX_BYTES:
        raise ValueError('reference response exceeds 12 MiB')
    return r

def save_media(url, name, origin, category):
    r = get(url)
    if 'text/html' in r.headers.get('content-type', '') or r.content[:40].lower().lstrip().startswith(b'<!doctype'):
        raise ValueError('download returned HTML, not audio')
    target = OUT / 'media' / name
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(r.content)
    return {'file':str(target.relative_to(OUT)), 'url':url, 'resolvedURL':r.url,
            'origin':origin, 'category':category, 'bytes':len(r.content),
            'sha256':hashlib.sha256(r.content).hexdigest(),
            'verification':'downloaded bytes only; event identity and licensing not inferred'}

def collect_code():
    files = subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
    extensions={'.js','.mjs','.cjs','.json','.py','.yml','.yaml','.css','.html','.glsl','.wgsl','.md','.txt','.mp3'}
    included=[]
    with zipfile.ZipFile(OUT/'source-snapshot.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name in files:
            p=ROOT/name
            if not name or not p.is_file() or p.is_symlink(): continue
            if not name.startswith(('.github/','scripts/','tools/','tests/','patches/','inkwave-public/')) and name not in ('package.json','package-lock.json'): continue
            if p.suffix.lower() not in extensions: continue
            if p.stat().st_size > 24*1024*1024: continue
            z.write(p,name)
            included.append({'path':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    save_json('source-snapshot.json',{'commit':subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),'files':included})
    print(json.dumps({'snapshotFiles':len(included),'zipBytes':(OUT/'source-snapshot.zip').stat().st_size}))

def collect_drive():
    # Same public embedded-folder listing used by gdown's folder parser.
    # Unlike the connector's first 1,000 results this view may expose later names.
    origin=f'https://drive.google.com/drive/folders/{FOLDER}'
    r=get(f'https://drive.google.com/embeddedfolderview?id={FOLDER}')
    (OUT/'drive-folder.html').write_text(r.text,encoding='utf-8')
    soup=BeautifulSoup(r.text,'html.parser')
    index={}
    for a in soup.find_all('a',href=True):
        m=re.match(r'https://drive\.google\.com/file/d/([-\w]{20,})/',a['href'])
        if m:
            name=a.get_text(' ',strip=True)
            index[m[1]]={'id':m[1],'name':name,'url':a['href']}
    rows=list(index.values())
    save_json('drive-index.json',{'origin':origin,'count':len(rows),'rows':rows,'completeness':'public embedded view, no assumed total'})
    selected=[]
    for row in rows:
        n=row['name']
        if not n.lower().endswith('.mp3'): continue
        combat=bool(re.search(r'^(?:Pl_|Player_|UI_|Se_).*(?:Hit|Damage|Kill|Dead|Death|Splat|Critical|Charge)',n,re.I))
        charge=bool(re.search(r'^Wp_.*(?:Charger|ChargeKeep|Charge)',n,re.I))
        added=bool(re.search(r'^Sp_.*(?:Decoy|Kraken|Screen|SuperLanding|Balloon)',n,re.I))
        if combat or charge or added:
            selected.append({**row,'category':'combat' if combat else 'charge' if charge else 'added-special'})
    # Prioritize newly needed feedback, then charge metadata; no whole OST download.
    selected.sort(key=lambda r:({'combat':0,'charge':1,'added-special':2}[r['category']],r['name']))
    save_json('drive-candidates.json',{'count':len(selected),'rows':selected})
    import gdown
    def download(row):
        try:
            name=re.sub(r'[^A-Za-z0-9_.+() -]','_',row['name'])
            target=OUT/'media'/name;target.parent.mkdir(exist_ok=True)
            result=gdown.download(id=row['id'],output=str(target),quiet=True,use_cookies=False)
            if result is None or not target.is_file(): raise ValueError('no downloaded file')
            b=target.read_bytes()
            if len(b)>MAX_BYTES or b[:30].lower().lstrip().startswith(b'<!doctype'): raise ValueError('invalid/oversized audio')
            return {**row,'file':str(target.relative_to(OUT)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),
                    'verification':'public archive bytes; event identity unverified'}
        except Exception as e:return {**row,'error':str(e)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        receipts=list(pool.map(download,selected[:96]))
    save_json('drive-downloads.json',receipts)
    print(json.dumps({'indexed':len(rows),'selected':len(selected),'downloaded':sum('file' in r for r in receipts)}))

def collect_public():
    sources=[
      ('direct-hit-community','https://tuna.voicemod.net/sound/7b1057ff-4a65-4125-9c9e-dc09df1ca87c'),
      ('charger-hit-community','https://tuna.voicemod.net/sound/7efadaf2-a44f-4e3b-9588-653c21aa7440'),
      ('complete-gamerip','https://downloads.khinsider.com/game-soundtracks/album/splatoon-3-complete-gamerip-switch-gamerip-2022')]
    receipts=[]
    for label,url in sources:
        try:
            r=get(url);(OUT/(label+'.html')).write_text(r.text,encoding='utf-8')
            soup=BeautifulSoup(r.text,'html.parser')
            if label=='complete-gamerip':
                links={urllib.parse.urljoin(url,a['href']):a.get_text(' ',strip=True) for a in soup.find_all('a',href=True)
                       if re.search(r'Multiplayer SFX - (?:Kraken|Super Chump|Special Ready|Wipeout)',a.get_text(' ',strip=True))}
                save_json('gamerip-candidates.json',links)
                for page,title in links.items():
                    try:
                        p=get(page);ps=BeautifulSoup(p.text,'html.parser')
                        mp3s=[a['href'] for a in ps.find_all('a',href=True) if re.search(r'\.mp3(?:\?|$)',a['href'],re.I) and a['href'].startswith('https://')]
                        if not mp3s: raise ValueError('no explicit MP3 download link')
                        name=re.sub(r'[^A-Za-z0-9_-]','_',title)+'.mp3'
                        receipts.append(save_media(mp3s[-1],name,page,'gamerip-reference-track'))
                    except Exception as e:receipts.append({'origin':page,'title':title,'error':str(e)})
            else:
                raw=html.unescape(r.text).replace('\\/','/').replace('\\u0026','&')
                found=re.findall(r'https://[^\s<>"\x27\\]+\.(?:mp3|wav|ogg)(?:\?[^\s<>"\x27\\]*)?',raw,re.I)
                sound_id=url.rsplit('/',1)[1]
                candidates=list(dict.fromkeys(found))
                save_json(label+'-candidates.json',{'origin':url,'urls':candidates})
                # Prefer URL carrying this sound's ID; never silently use recommendations.
                chosen=[u for u in candidates if sound_id in u]
                if not chosen and len(candidates)==1:chosen=candidates
                if not chosen:
                    receipts.append({'origin':url,'error':'audio URL not uniquely attributable; page saved for review'})
                else:receipts.append(save_media(chosen[0],label+'.mp3',url,'community-reference-not-verified-S3'))
        except Exception as e:receipts.append({'origin':url,'error':str(e)})
    save_json('public-downloads.json',receipts)
    print(json.dumps(receipts,ensure_ascii=False))

if __name__=='__main__':
    job=sys.argv[1] if len(sys.argv)>1 else 'code'
    {'code':collect_code,'drive':collect_drive,'public':collect_public}[job]()
