#!/usr/bin/env python3
"""Archive only public recording references requested for audio comparison.
No authentication, DRM workarounds, or source-version claims. Never send secrets.
"""
import concurrent.futures, hashlib, html, json, pathlib, re, urllib.parse, urllib.request, zipfile
OUT=pathlib.Path('audio-reference-candidates');OUT.mkdir(exist_ok=True)
BASE='https://downloads.khinsider.com/game-soundtracks/album/splatoon-3-complete-gamerip-switch-gamerip-2022/'
SOURCES=[
 ('direct-hit-upload','https://tuna.voicemod.net/sound/7b1057ff-4a65-4125-9c9e-dc09df1ca87c'),
 ('charger-hit-upload','https://tuna.voicemod.net/sound/7efadaf2-a44f-4e3b-9588-653c21aa7440'),
 ('public-s3-folder','https://drive.google.com/drive/folders/1D7So33YcZJaU_W5eC_H8OMFnUxGA8lYJ'),
 ('public-s3-list','https://drive.google.com/embeddedfolderview?id=1D7So33YcZJaU_W5eC_H8OMFnUxGA8lYJ#list'),
 ('kraken',BASE+'07-039.%20Multiplayer%20SFX%20-%20Kraken%E2%80%8E.mp3'),
 ('super-chump',BASE+'07-041.%20Multiplayer%20SFX%20-%20Super%20Chump%E2%80%8E.mp3'),
 ('tacticooler',BASE+'07-042.%20Multiplayer%20SFX%20-%20Tacticooler%E2%80%8E.mp3'),
]
LIMIT=32*1024*1024

def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (audio reference research)','Accept':'*/*'})
 with urllib.request.urlopen(req,timeout=40) as r:
  body=r.read(LIMIT+1)
  if len(body)>LIMIT:raise ValueError('response exceeds 32 MiB research bound')
  return body,r.headers.get('Content-Type',''),r.geturl()

def work(item):
 key,url=item;row={'id':key,'sourcePage':url,'classification':'public third-party comparison candidate, NOT verified Nintendo event mapping'}
 try:
  body,mime,final=get(url);(OUT/(key+'.html')).write_bytes(body)
  row.update(pageBytes=len(body),pageSHA256=hashlib.sha256(body).hexdigest(),finalURL=final)
  text=body.decode('utf-8','replace');normalized=html.unescape(text).replace('\\/','/').replace('\\u0026','&')
  links=set(re.findall(r'https?://[^\s<>"\'\\]+',normalized))
  # Public media URLs are exposed by the page itself. Do not guess protected endpoints.
  media=[u for u in links if re.search(r'\.(mp3|wav|ogg|flac)(?:\?|$)',u,re.I) and 'downloads.khinsider.com/game-soundtracks/album/' not in u]
  row['mediaCandidates']=sorted(media)[:12]
  if key.startswith('public-s3'):
   row['audioNameHints']=sorted(set(re.findall(r'[A-Za-z0-9_+().-]+\.(?:mp3|bars\.zs|bslnk\.zs)',normalized)))
   row['fileIdHints']=sorted(set(re.findall(r'/file/d/([A-Za-z0-9_-]+)',normalized)))
  # Voicemod can list recommendations as well as the selected track. Preserve all
  # discovered media URLs, but download at most the selected matching UUID or first.
  token=url.rsplit('/',1)[-1]
  selected=[u for u in media if token in u] or media[:1]
  row['files']=[]
  for i,link in enumerate(sorted(selected)[:2]):
   data,typ,actual=get(link)
   if 'text/html' in typ:continue
   ext=re.search(r'\.(mp3|wav|ogg|flac)(?:\?|$)',link,re.I).group(1).lower()
   name=key+(('-'+str(i)) if i else '')+'.'+ext
   (OUT/name).write_bytes(data);row['files'].append({'file':name,'url':actual,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'contentType':typ})
 except Exception as e:row['error']=type(e).__name__+': '+str(e)
 return row

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(work,SOURCES))
(OUT/'PROVENANCE.json').write_text(json.dumps({'scope':'public user-requested audio comparison references','noVerifiedGameVersion':True,'sources':rows},ensure_ascii=False,indent=2))
with zipfile.ZipFile('audio-reference-candidates.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in OUT.iterdir():z.write(p,p.name)
print(json.dumps(rows,ensure_ascii=False,indent=2))
