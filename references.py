import sys,json,pathlib,urllib.request,hashlib
plan=json.load(open(sys.argv[1]));out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);records=[]
assert len(plan['references'])==3
for r in plan['references']:
 assert r['url']=='https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/images/weapon/'+r['file'] and pathlib.Path(r['file']).name==r['file']
 with urllib.request.urlopen(r['url'],timeout=30) as f:b=f.read(1024*1024+1)
 assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'] and hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==r['gitBlob']
 (out/r['file']).write_bytes(b);records.append(r)
(out/'receipt.json').write_text(json.dumps(records,indent=2)+'\n')
