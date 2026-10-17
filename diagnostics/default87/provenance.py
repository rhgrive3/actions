import datetime,json
HEAD='d3c148c3c092024e78f30f064a5cf5318c79dba0'
PR_HEAD='e1a458e6efce96fc5f69008d1022957de8f2d300'
MAIN_HEAD='4754c4ef402375f26e2d46702ed46330b401108b'
TREE='ff73891434bb453493e441bc1fab936794362592'
def fresh_pr(path,after=None):
 p=json.load(open(path));t=datetime.datetime.fromisoformat(p['readAt'].replace('Z','+00:00'));now=datetime.datetime.now(datetime.timezone.utc)
 assert 0 <= (now-t).total_seconds() <= 300,'Fresh official PR read within five minutes required'
 assert p['number']==1538 and p['head']['sha']==PR_HEAD and p['mainHead']==MAIN_HEAD and p['candidateHead']==HEAD and p['state']=='open' and not p.get('merged',False),'PR head/state drift'
 if after:assert t>=datetime.datetime.fromisoformat(after),'Post-run official PR read required'
 return p
