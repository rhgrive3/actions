from pathlib import Path
import sys
D=Path(__file__).parent;root=Path(sys.argv[1]).resolve();s=(D/'driver.template.mjs').read_text().replace('__SOURCE_ROOT__',str(root));s=s.removeprefix('#!/usr/bin/env node\n');s="import {parkVisualColliders,finishVisualColliderReview} from './park-visual-colliders.mjs';\n"+s
old='    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed });';assert s.count(old)==1;s=s.replace(old,old+'\n    const colliderSetup = await page.evaluate(parkVisualColliders);')
old='    report.visualScenarios.push(record);';assert s.count(old)==1;s=s.replace(old,"    record.colliderFixture=await page.evaluate(finishVisualColliderReview);\n    if(!record.colliderFixture.actorArrayPreserved||record.colliderFixture.segments.length===0||record.colliderFixture.actorHits.length!==0)throw Error('Missing collider isolation evidence');\n"+old)
(D/'driver.mjs').write_text(s)
