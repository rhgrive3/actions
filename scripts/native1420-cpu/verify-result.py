import pathlib,json,hashlib,re
r=pathlib.Path('native1420-current-private');memory=json.loads((r/'split-memory-receipt.json').read_text());assert memory['status']=='completed' and len(memory['phases'])==2
for p in memory['phases']:assert p['status']=='completed' and p['exitCode']==0 and p['peakRSSKiB']<=memory['rssCapKiB'] and p['minimumAvailableKiB']>=memory['minimumAvailableKiB']
log=(r/'test-authentic-stream.mjs.stdout.log').read_text();rows=[]
for line in log.splitlines():
 try:rows.append(json.loads(line.removeprefix('# ')))
 except (ValueError,TypeError):pass
results=[x for x in rows if isinstance(x,dict) and 'recovered' in x and 'negativeResults' in x];assert len(results)==1;result=results[0]
assert result['recovered'] is True and result['expected'] is True and result['endInk']>result['initialInk']+1 and result['kidRefillTicks']>0
assert result['sourceSha256']=='8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9' and result['helperSha256']=='4cb34f74838596bfe3bad1ff9c15a86a7029b40ae40d13ea73d82c4b5b5dd136'
assert result['from']==16843 and result['to']==16578 and result['sourceFloor']==33518 and result['preparationSteps']>0 and result['approachSteps']<180
assert len(result['negativeResults'])==16
assert re.search(r'(?:#|ℹ) pass 1\b',log) and re.search(r'(?:#|ℹ) fail 0\b',log) and re.search(r'(?:#|ℹ) skipped 0\b',log)
(r/'qualification-result.json').write_text(json.dumps({'head':'c99d1310a6cfb1ba65e9fb3394799c6fdbc42778','status':'passed','fixture':result,'scope':'Exact unchanged dedicated CPU fixture only. Initial supported actor/route and labelled contract controls remain seeded. No actual Game/browser, whole-stage, hardware or Ready/merge qualification.'},indent=2)+'\n')
