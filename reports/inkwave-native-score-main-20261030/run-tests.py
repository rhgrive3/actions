import pathlib, os, subprocess, json, sys, re, datetime

root=pathlib.Path(sys.argv[1]).resolve()
mode=sys.argv[2]
out=root/'.ci-scratch/score-main-verify'
env=dict(os.environ)
for key in ['INKWAVE_NATIVE_STAGE_ASSETS','INKWAVE_BUILT_ROOT','INKWAVE_BUILT_SITE','NODE_TEST_CONTEXT']:
    env.pop(key,None)
env['INKWAVE_NATIVE_PREBUILT']='1'
if mode in ['emitted','emitted-supported']:
    env['INKWAVE_BUILT_SITE']=str(root/'_site')
files=[
    'patches/splatoon3/tests/perf-presentation.test.mjs',
    'patches/splatoon3/tests/queue-followup-paint-wake.test.mjs',
    'patches/splatoon3/tests/ranked-zone-coverage-version.test.mjs',
    'patches/splatoon3/tests/ranked-scoring-delivery.test.mjs',
    'patches/splatoon3/tests/paint-raw-area-credit.test.mjs',
    'patches/splatoon3/tests/issue-264-paint-score-boundaries.test.mjs',
    'patches/native-stages/tests/native-prebuilt.test.mjs',
    'patches/native-stages/tests/native-build-fixture.test.mjs',
    'patches/native-stages/tests/source-paint-coverage.test.mjs',
    'patches/native-stages/tests/native-paint-detail.test.mjs',
    'patches/native-stages/tests/paint-cache.test.mjs',
    'patches/native-stages/tests/native-ground-mask.test.mjs',
    'patches/native-stages/tests/native-paint-goal-bounds.test.mjs',
]
extra=[]
if mode=='emitted-supported':
    files=[file for file in files if file not in ['patches/native-stages/tests/native-build-fixture.test.mjs','patches/native-stages/tests/source-paint-coverage.test.mjs']]
if mode=='source-native':
    files=['patches/native-stages/tests/native-build-fixture.test.mjs','patches/native-stages/tests/source-paint-coverage.test.mjs']
    extra=['--test-name-pattern=source fixture|source cell coverage|owned partial cells']
if mode in ['prefix-source','prefix-emitted']:
    original=root/'patches/splatoon3/tests/coverage-prefix.test.mjs'
    if mode=='prefix-source':
        files=[str(original)]
    else:
        env['INKWAVE_BUILT_SITE']=str(root/'_site')
        code=original.read_text()
        code=code.replace("'../runtime/scoring.mjs'",repr((root/'_site/patches/splatoon3/runtime/scoring.mjs').as_uri()))
        code=code.replace("'./source-fixture.mjs'",repr((root/'patches/splatoon3/tests/source-fixture.mjs').as_uri()))
        code=code.replace("'./fixtures/scoring-before-5637c803.mjs.txt'",repr((root/'patches/splatoon3/tests/fixtures/scoring-before-5637c803.mjs.txt').as_uri()))
        adapted=out/'emitted-coverage-prefix.test.mjs'
        adapted.write_text(code)
        files=[str(adapted)]
command=['node','--experimental-vm-modules','--test','--test-reporter=spec','--test-concurrency=2',*extra,*files]
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
log=out/(mode+'-tests.log')
with log.open('w') as handle:
    process=subprocess.Popen(command,cwd=root,env=env,stdout=handle,stderr=subprocess.STDOUT)
    status=process.wait()
text=log.read_text()
counts=dict((key,int(value)) for key,value in re.findall(r'[ℹ#]\s+(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)',text))
result={'root':str(root),'mode':mode,'startedUTC':started,'endedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'nodePid':process.pid,'exit':status,'counts':counts,'log':str(log),'processExited':process.poll() is not None}
(out/(mode+'-tests.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
if status:
    print(text[-10000:])
sys.exit(status)
