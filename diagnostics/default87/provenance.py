import datetime,json
HEAD='e1a458e6efce96fc5f69008d1022957de8f2d300'
TREE='8abd97b4934dde6ca67adbce668d76791eacb7a8'
def fresh_pr(path,after=None):
 p=json.load(open(path));t=datetime.datetime.fromisoformat(p['readAt'].replace('Z','+00:00'));now=datetime.datetime.now(datetime.timezone.utc)
 assert 0 <= (now-t).total_seconds() <= 300,'Fresh official PR read within five minutes required'
 assert p['number']==1538 and p['head']['sha']==HEAD and p['state']=='open' and not p.get('merged',False),'PR head/state drift'
 if after:assert t>=datetime.datetime.fromisoformat(after),'Post-run official PR read required'
 return p
