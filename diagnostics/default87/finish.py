from pathlib import Path
import sys,json,hashlib,urllib.request,datetime,os
E=Path(sys.argv[1]);HEAD='9de6db03899d751a1dcd4fc373afe3a1147614d0';result=json.load(open(E/'browser/browser-result.json'));assert result['status']=='passed' and result['head']==HEAD;assert len(result['acceptedDefaultConsumption']['rows'])==42;phases=result['savedFiveReopening']['phases'];assert len(phases)==15 and len({(p['row'],p['role'])for p in phases})==15
for p in phases:
 f=p['frame'];b=(E/'browser'/f['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256'] and f['head']==HEAD and f['contentHash']==result['contentHash'];assert f['row']==p['row'] and f['role']==p['role'] and f['pixels']['quantizedColors']>=8
with urllib.request.urlopen('https://api.github.com/repos/rhgrive3/actions/pulls/1538',timeout=30)as r:pr=json.load(r)
PR_HEAD='e1a458e6efce96fc5f69008d1022957de8f2d300';MAIN_HEAD='4754c4ef402375f26e2d46702ed46330b401108b'
with urllib.request.urlopen('https://api.github.com/repos/rhgrive3/actions/git/ref/heads/main',timeout=30)as r:main=json.load(r)
assert main['object']['sha']==MAIN_HEAD,'Main head drift'
assert pr['head']['sha']==PR_HEAD and pr['state']=='open' and not pr['merged'];(E/'pr-after.json').write_text(json.dumps({'number':1538,'head':{'sha':PR_HEAD},'mainHead':MAIN_HEAD,'candidateHead':HEAD,'state':'open','merged':False,'readAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}));(E/'acceptance.json').write_text(json.dumps({'status':'passed','candidateHead':HEAD,'candidateTree':'335250f0a1f81f8235da6efef304f0eaf27751bd','diagnosticHead':os.environ['GITHUB_SHA'],'runId':os.environ['GITHUB_RUN_ID'],'contentHash':result['contentHash'],'defaultRows':42,'savedReloadFrames':15,'scope':'Focused native defaults and saved reopen; final PR CI remains independent; human review of all15 PNGs still required'},indent=2))
