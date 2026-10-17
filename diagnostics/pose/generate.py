from pathlib import Path
import sys,hashlib
D=Path(__file__).parent;root=Path(sys.argv[1]).resolve();s=(D/'original-driver.mjs').read_text()
assert hashlib.sha256(s.encode()).hexdigest()==hashlib.sha256((root/'scripts/check-inkwave-projectile-visuals.mjs').read_bytes()).hexdigest(),'Original driver must match candidate228 exactly'
s=s.replace("'../patches/splatoon3/runtime/projectile-visuals.mjs'",repr(str(root/'patches/splatoon3/runtime/projectile-visuals.mjs'))).replace("'./lib/inkwave-projectile-ci-intro.mjs'",repr(str(root/'scripts/lib/inkwave-projectile-ci-intro.mjs')))
s=s.replace("const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",'const ROOT = '+repr(str(root))+';')
s=s.replace('const visualSetup = ({ name, seed, impact = null }) => {','const visualSetup = async ({ name, seed, impact = null }) => {')
helper=(D/'reset-character.mjs').read_text();helper=helper[helper.index('export async function'):].replace('export async function','async function',1)
old='  a.setWeapon(weapon);';assert s.count(old)==1
s=s.replace(old,helper+"\n  if (!g.frozen) throw new Error('Native loop must remain frozen during reset');\n  const oldCharacter = a.character;\n  await resetCaptureCharacter(a);\n  if (!g.frozen) throw new Error('Native loop unfroze during async reset');\n  window.__iwCharacterResetReceipt = { oldDisposed: oldCharacter._sourceMotionDisposed === true, oldDetached: oldCharacter.root.parent === null, actorOwned: a.character.actor === a, sceneOwned: a.character.root.parent === G.scene, constructorPreserved: a.character.constructor === oldCharacter.constructor, stylePreserved: JSON.stringify(a.character.style) === JSON.stringify(oldCharacter.style), sourceMotionStatus: a.character.sourceMotion.status };\n  if (Object.entries(window.__iwCharacterResetReceipt).some(([key, value]) => key !== 'sourceMotionStatus' && value !== true)) throw new Error('Native Character ownership/disposal failed');\n"+old)
old='    a.character.setVisible(true); a.character.root.position.copy(a.pos); a.character.root.rotation.y = yaw;';assert s.count(old)==1
s=s.replace(old,old+'\n    a._finishFrame(0);')
s=s.replace('async function runVisuals(page) {',(D/'proof.mjs').read_text()+'\nasync function runVisuals(page) {')
s=s.replace('try { await runVisuals(visual.page); }','try { await runPoseResetProof(visual.page); await runVisuals(visual.page); }')
(D/'driver.mjs').write_text(s)
