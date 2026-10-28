import hashlib, importlib.util, io, pathlib, tarfile, tempfile, unittest
P=pathlib.Path(__file__).parents[1]/'ci'/'extract-native-site.py'; spec=importlib.util.spec_from_file_location('v',P); v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
def info(name,body=b'x',typ=tarfile.REGTYPE):
 t=tarfile.TarInfo(name);t.type=typ;t.size=len(body) if typ==tarfile.REGTYPE else 0;return t,body
BASE=[info('_site/inkwave-build.json',b'{}'),info('_site/sw.js'),info('_site-source-sha.txt',b'sha')]
class ArchiveTest(unittest.TestCase):
 def run_archive(self,rows,expected=None):
  with tempfile.TemporaryDirectory() as d:
   archive=pathlib.Path(d)/'a.tar'
   with tarfile.open(archive,'w') as t:
    for ent,body in rows:t.addfile(ent,io.BytesIO(body) if ent.isfile() else None)
   sha=hashlib.sha256(archive.read_bytes()).hexdigest();return v.extract(archive,pathlib.Path(d)/'out',expected or sha)
 def test_valid(self): self.assertEqual(self.run_archive(BASE),(3,6))
 def test_digest(self):
  with self.assertRaisesRegex(ValueError,'digest'):self.run_archive(BASE,'0'*64)
 def test_traversal(self):
  for name in ['../escape','_site/../escape','_site//bad','_site/./bad','_site/\\bad','/absolute']:
   with self.subTest(name=name),self.assertRaises(ValueError):self.run_archive(BASE+[info(name)])
 def test_links(self):
  for typ in [tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.FIFOTYPE]:
   with self.subTest(typ=typ),self.assertRaisesRegex(ValueError,'special'):self.run_archive(BASE+[info('_site/link',typ=typ)])
 def test_duplicate(self):
  with self.assertRaisesRegex(ValueError,'duplicate'):self.run_archive(BASE+[info('_site/sw.js')])
 def test_required(self):
  with self.assertRaisesRegex(ValueError,'required'):self.run_archive(BASE[:-1])
 def test_outside(self):
  with self.assertRaisesRegex(ValueError,'unexpected'):self.run_archive(BASE+[info('private')])
if __name__=='__main__':unittest.main()
