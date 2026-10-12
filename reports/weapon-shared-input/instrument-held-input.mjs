#!/usr/bin/env node
// Diagnostic-only copy of the immutable reliability verifier. No runtime changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [,,source,out]=process.argv;
assert(source&&out,'source verifier and output path required');
let text=fs.readFileSync(source,'utf8');
const sha=crypto.createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
assert.equal(sha,'bcd1f25290ad244f8ec4f813775713fe4a2b2353','unchanged main/candidate input verifier');
const once=(from,to)=>{assert.equal(text.split(from).length,2,`unique injection ${from.slice(0,80)}`);text=text.replace(from,to);};
once("      await page.locator('[data-c=\"fire\"]').tap(); await page.locator('[data-c=\"jump\"]').tap();", String.raw`      // Read-only state snapshots. No waiting, reset, input, CSS, or assertion changes.
      await page.evaluate(() => {
        window.heldTimeline = [];
        const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && k in obj).map(k => [k, obj[k]]));
        const intent = obj => ({ ...pick(obj, ['fire','firePressed','jump','jumpPressed','sub','subPressed','squid','special']), move: obj?.move?.toArray?.() });
        const list = value => value instanceof Set || value instanceof Map ? JSON.parse(JSON.stringify([...value])) : value;
        window.heldSnapshot = (label, detail = null) => {
          const a=actionActor,w=a.weaponRunner,c=sim.s3Clock;
          heldTimeline.push({label,detail,now:performance.now(),timeOrigin:performance.timeOrigin,
            dodges:actionDodges,clock:pick(c,['ticks','accumulator']),world:pick(G,['time','mode']),
            match:pick(sim.match,['state','paused','attract','follower','mode','timeLeft']),
            controller:pick(controller,['enabled','menuBlocked','_menuBlocked']),
            actor:{...pick(a,['alive','grounded','kidT','form','ink','jumpBuffer','coyote','fireBuffer','fireFacing','inOwnInk','inEnemyInk','groundTeam','submerged']),
              ground:pick(a.ground,['hit','y','height']),position:a.pos?.toArray?.(),velocity:a.vel?.toArray?.(),intent:intent(a.intent),previous:intent(a._prevIntent)},
            runner:{...pick(w,['lockT','rollsLeft','firingT','aimingSub','cooldown','s3Turret']),
              dodge:w.dodge?pick(w.dodge,['t','dur','duration','speed','x','z']):null},
            input:{lastDevice:input.lastDevice,pressed:list(input.pressed),padPressed:list(input.padPressed),padEpoch:input._padEpoch},
            mobile:{...pick(mobile,['active','enabled','editing','mapOpen','moveX','moveY','lookDX','lookDY']),
              buttons:{...mobile.buttons},pressed:list(mobile.pressed),pending:list(mobile._pendingEdges),
              cancelled:list(mobile._cancelled),ptr:list(mobile._ptr),stick:pick(mobile._stick,['id','active'])}});
        };
        const update=sim.match.update;
        sim.match.update=function(dt){heldSnapshot('actor-before',{dt});const result=update.call(this,dt);heldSnapshot('actor-after',{dt});return result;};
        for(const type of ['pointerdown','pointerup','pointercancel']) for(const capture of [true,false]) {
          mobile.root.addEventListener(type,event=>{
            const el=event.target.closest?.('[data-c]'),id=el?.dataset.c,rect=el?.getBoundingClientRect(),box=id?mobile._box(id):null;
            heldSnapshot('pointer-'+(capture?'before':'after'),{type,id,pointerId:event.pointerId,isTrusted:event.isTrusted,
              x:event.clientX,y:event.clientY,hit:mobile._hitButton(event.clientX,event.clientY),box,
              rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,scale:el?getComputedStyle(el).scale:null});
          },{capture,passive:true});
        }
        heldSnapshot('native-trial-ready');
      });
      await page.locator('[data-c="fire"]').tap(); await page.locator('[data-c="jump"]').tap();`);
once('        actionActor.weaponRunner.reset(); actionActor.grounded = true;', "        heldSnapshot('held-before-reset');\n        actionActor.weaponRunner.reset(); actionActor.grounded = true;");
once('        mobile.reset(); mobile.moveX = .8; actionDodges = 0;',"        mobile.reset(); mobile.moveX = .8; actionDodges = 0;\n        heldSnapshot('held-after-reset');");
once("      assert.equal(await page.evaluate(() => actionDodges), 2, 'held touch release/repress reaches real Character once');", "      entry.heldActionTimeline = await page.evaluate(() => { heldSnapshot('held-before-assert'); return heldTimeline; });\n      assert.equal(await page.evaluate(() => actionDodges), 2, 'held touch release/repress reaches real Character once');");
once("      entry.checks.push('native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once');", "      entry.checks.push('native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once');\n      // Bound the diagnostic to the original setup and held-action section.\n      continue;");
// Preserve partial trace if an earlier unchanged assertion fails.
once('    } finally { await context.close(); }', `    } finally {
      const entry=report.cases.at(-1),page=context.pages()[0];
      if(entry&&page) try { entry.heldActionTimeline=await page.evaluate(()=>window.heldTimeline||[]); } catch(error) { entry.timelineReadError=String(error); }
      await context.close();
    }`);
once("const report = { status: 'running',", "const report = { diagnostic: 'passive-held-input-timeline', originalVerifierGitSHA: '"+sha+"', limitedScope: 'unchanged setup and action assertions through held release; later cases unobserved', status: 'running',");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,text);
console.log(JSON.stringify({source,out,originalVerifierGitSHA:sha,instrumentedSHA256:crypto.createHash('sha256').update(text).digest('hex')}));
