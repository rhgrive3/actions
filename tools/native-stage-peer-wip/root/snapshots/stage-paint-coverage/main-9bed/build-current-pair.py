import subprocess, os, json, hashlib, time
from pathlib import Path

cwd = Path('/workspace/stage-paint-coverage')
out = cwd / '.ci-scratch/main-9bed'
expected = '9ee0d652f7942f694059b6291c432ad2227158d3'
git = lambda *args: subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()
assert git('rev-parse', 'HEAD') == expected and not git('status', '--porcelain')
env = os.environ.copy()
env.pop('INKWAVE_NATIVE_STAGE_ASSETS', None)
seal = {'candidate': expected, 'consumedMain': '9bed52751a909af84f9a9c0d6abb7cdd1a61c6b0', 'builds': {}}
modules = ['src/config.js', 'src/main.js', 'src/game/actor.js', 'src/game/character.js', 'src/game/bots.js',
           'patches/native-stages/runtime/engine.mjs',
           'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/sub-models.mjs',
           'patches/splatoon3/runtime/special-models.mjs', 'patches/splatoon3/runtime/special-presentation.mjs']
for kind in ['public', 'private']:
    site = cwd / ('_site-native-main-9bed-' + kind)
    reuse_public = kind == 'public' and site.exists()
    assert reuse_public or not site.exists(), 'Preserve any interrupted or sealed output before resealing'
    current = env.copy()
    if kind == 'private':
        current['INKWAVE_NATIVE_STAGE_ASSETS'] = str(cwd / '.ci-scratch/main-18ce/assets')
    steps = [('build', ['node', 'scripts/build-inkwave.mjs', 'inkwave-public', str(site)], {}),
             ('packaging', ['node', '--test', '--test-concurrency=1', 'scripts/tests/inkwave-build-packaging.test.mjs'], {'INKWAVE_BUILT_SITE': str(site)}),
             ('budget', ['node', 'scripts/check-inkwave-startup-budget.mjs', str(site)], {})]
    for name, args, extra in steps:
        log = out / ('current-' + kind + '-' + name + '.log')
        if reuse_public and log.exists():
            assert log.exists() and log.stat().st_size > 0
            if name == 'budget':
                assert json.loads(log.read_text())['status'] == 'passed'
            if name == 'packaging':
                assert 'ℹ pass 9' in log.read_text() and 'ℹ fail 0' in log.read_text() and 'ℹ skipped 0' in log.read_text()
        else:
            assert not log.exists(), 'Preserve previous verification log'
            command_env = current.copy()
            command_env.update(extra)
            with log.open('w') as stream:
                result = subprocess.run(['flock', '/workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock', *args], cwd=cwd, env=command_env, stdout=stream, stderr=subprocess.STDOUT)
            assert result.returncode == 0, (kind, name, result.returncode)
        assert git('rev-parse', 'HEAD') == expected and not git('status', '--porcelain')
        print(kind, name, 'retained passed' if reuse_public else 'passed', flush=True)
    manifest = json.loads((site / 'inkwave-build.json').read_text())
    emitted = {}
    for rel in modules:
        data = (site / rel).read_bytes()
        emitted[rel] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    seal['builds'][kind] = {'site': str(site), 'contentHash': manifest['contentHash'], 'inputHash': manifest['inputHash'],
                           'revision': manifest['build']['revision'], 'nativeConfig': manifest['build']['nativeStages'], 'emitted': emitted}
    text = (out / ('current-' + kind + '-packaging.log')).read_text()
    assert 'ℹ pass 9' in text and 'ℹ fail 0' in text and 'ℹ skipped 0' in text
    if kind == 'public':
        assert not (site / '_native-reference-assets').exists()
    (out / 'current-pair-seal.json').write_text(json.dumps(seal, indent=2) + '\n')
assert seal['builds']['public']['emitted'] == seal['builds']['private']['emitted']
seal['emittedExactlyEqual'] = True
seal['utc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
(out / 'current-pair-seal.json').write_text(json.dumps(seal, indent=2) + '\n')
print(json.dumps({'candidate': expected, 'public': seal['builds']['public']['revision'], 'private': seal['builds']['private']['revision'], 'emittedExactlyEqual': True}))
