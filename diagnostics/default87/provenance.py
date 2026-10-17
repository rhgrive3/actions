import datetime,json
HEAD='c386cbe581dfda252b611751301f277761fa1269'
PR_HEAD='e1a458e6efce96fc5f69008d1022957de8f2d300'
MAIN_HEAD='378dcf78d09714cb3f89c39a46e36a52ad997869'
TREE='a619a4476f23c6c768bf4b6fda3983a16dc1e043'
def fresh_pr(path,after=None):
 p=json.load(open(path));t=datetime.datetime.fromisoformat(p['readAt'].replace('Z','+00:00'));now=datetime.datetime.now(datetime.timezone.utc)
 assert 0 <= (now-t).total_seconds() <= 300,'Fresh official PR read within five minutes required'
 assert p['number']==1538 and p['head']['sha']==PR_HEAD and p['mainHead']==MAIN_HEAD and p['candidateHead']==HEAD and p['state']=='open' and not p.get('merged',False),'PR head/state drift'
 if after:assert t>=datetime.datetime.fromisoformat(after),'Post-run official PR read required'
 return p
