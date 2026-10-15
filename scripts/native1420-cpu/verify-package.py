import pathlib,json,hashlib,urllib.request,base64
root=pathlib.Path('native1420-current-private');repo=pathlib.Path('../diagnostic');package=json.loads((root/'package.json').read_text())
assert package['sourceHead']=='c99d1310a6cfb1ba65e9fb3394799c6fdbc42778'
for item in package['files']:
 data=(repo/item['path']).read_bytes();assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256']
 if item['path'].startswith('scripts/native1420-cpu/'):assert (root/pathlib.Path(item['path']).name).read_bytes()==data
url='https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/d1b59d640b885fee46b3cb93c6dab4b38ba32019'
with urllib.request.urlopen(url,timeout=30) as response:tree=json.load(response)
assert tree['sha']=='d1b59d640b885fee46b3cb93c6dab4b38ba32019' and not tree.get('truncated');entry=next(x for x in tree['tree'] if x['path']=='Vss_Twist00.obj');assert entry['sha']=='43d8e267cf425a52a5750e7c17f200be6eed3fc6' and entry['size']==133
url='https://raw.githubusercontent.com/kirakira-dev/KiTrix/0611f51b35c9736ee986fb2218461e2585b7875e/stages/Vss_Twist00/Vss_Twist00.obj'
with urllib.request.urlopen(url,timeout=30) as response:pointer=response.read(1024)
assert len(pointer)==133 and hashlib.sha1(b'blob 133\0'+pointer).hexdigest()==entry['sha'];assert b'oid sha256:8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9\n' in pointer and b'size 49575330\n' in pointer
(root/'package-verification-receipt.json').write_text(json.dumps({'sourceHead':package['sourceHead'],'packageSHA256':hashlib.sha256((root/'package.json').read_bytes()).hexdigest(),'files':len(package['files']),'sourceTree':tree['sha'],'sourcePointerBlob':entry['sha'],'scope':'CPU-only package; immutable source metadata checked; no browser or asset publication.'},indent=2)+'\n')
