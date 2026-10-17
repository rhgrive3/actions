from pathlib import Path
import sys,json,hashlib,subprocess
D=Path(__file__).parent;root=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();engine=sys.argv[3];assert engine in ['chromium','webkit'];out.mkdir(parents=True,exist_ok=False)
B=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();S=lambda b:hashlib.sha256(b).hexdigest()
pins=json.loads((D/'pins.json').read_text());assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==pins['head'];assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD^{tree}'],text=True).strip()==pins['tree']
raw=(root/'scripts/check-inkwave-reliability.mjs').read_bytes();assert B(raw)==pins['files']['scripts/check-inkwave-reliability.mjs'];s=raw.decode();original=s;changes=[]
def replace(a,b):
 global s
 assert s.count(a)==1,a;s=s.replace(a,b);changes.append((a,b))
replace("for (const engineName of ['chromium', 'webkit'])",f"for (const engineName of ['{engine}'])")
replace('    try {\n      const page = context.pages()[0]', '    let auditPage;\n    try {\n      const page = auditPage = context.pages()[0]')
observer=(D/'observe.mjs').read_text().replace('export function observe1430','function observe1430',1)
anchor="      await page.locator('[data-c=\"fire\"]').tap(); await page.locator('[data-c=\"jump\"]').tap();"
replace(anchor,'      await page.evaluate('+observer.strip()+');\n'+anchor)
held="      assert.equal(await page.evaluate(() => actionDodges), 2, 'held touch release/repress reaches real Character once');"
replace(held,held+'\n      await page.evaluate(() => window.stopIssue1430Observation());')
replace('    } finally { await context.close(); }', '''    } finally {
      try {
        const trace = auditPage ? await auditPage.evaluate(() => ({rows:window.issue1430Rows || [],count:window.actionDodges ?? null})) : {rows:[],count:null};
        fs.writeFileSync(path.join(evidence,engineName+'-issue1430-trace.json'),JSON.stringify({engine:engineName,sourceSha:'''+json.dumps(pins['head'])+''',contentHash:manifest.contentHash,...trace},null,2));
      } catch(error) { fs.writeFileSync(path.join(evidence,engineName+'-issue1430-trace-error.txt'),error.stack); throw error; }
      finally { await context.close(); }
    }''')
restored=s
for a,b in reversed(changes):assert restored.count(b)==1;restored=restored.replace(b,a)
assert restored==original
(out/'run.mjs').write_text(s)
for name in ['inkwave-touch-transition-cases.mjs','inkwave-focus-loss-case.mjs']:
 b=(root/'scripts'/name).read_bytes();assert B(b)==pins['files']['scripts/'+name];(out/name).write_bytes(b)
files={p.name:S(p.read_bytes()) for p in out.iterdir() if p.is_file()}
receipt={'head':pins['head'],'tree':pins['tree'],'engine':engine,'originalBlob':B(raw),'originalSHA256':S(raw),'files':files,'strictCaseUnchanged':True,'observationalChanges':len(changes),'runtimeChanged':False}
(out/'preparation.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
