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
          heldTimeline.push({label,detail,phase:window.heldPhase||'original',now:performance.now(),timeOrigin:performance.timeOrigin,
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
once("      entry.checks.push('native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once');", String.raw`      entry.checks.push('native-taps-and-DOM-touch-repress-reach-actual-Actor-Runner-Character-once');
      // Separate controlled reproduction; original assertions above are unchanged.
      // Let existing CSS reach its natural held state, without editing CSS/time.
      entry.animatedRepress = [];
      for (const coordinate of ['visible-center', 'logical-center-control']) {
        await page.evaluate(() => mobile.reset());
        await page.waitForFunction(() => ['jump','fire'].every(id => {
          const scale=getComputedStyle(mobile.els[id]).scale;
          return scale==='none'||Math.abs(parseFloat(scale)-1)<1e-5;
        }));
        await page.evaluate(coordinate => {
          window.heldPhase=coordinate;
          actionActor.weaponRunner.reset();actionActor.grounded=true;actionActor.ground.hit=true;
          actionActor.jumpBuffer=0;actionActor._prevIntent.jump=false;actionActor.ink=100;actionActor.kidT=99;
          mobile.reset();mobile.moveX=.8;actionDodges=0;
          heldSnapshot('controlled-ready',{coordinate});
          actionPointer('fire',701,'pointerdown');actionPointer('jump',702,'pointerdown');
          for(let i=0;i<31;i++)advance(1/60);
        },coordinate);
        await page.waitForFunction(() => ['jump','fire'].every(id => Math.abs(parseFloat(getComputedStyle(mobile.els[id]).scale)-.92)<1e-5));
        const row = await page.evaluate(coordinate => {
          const start=heldTimeline.length,before=actionDodges,scale=getComputedStyle(mobile.els.jump).scale;
          heldSnapshot('controlled-before-release',{coordinate,scale});
          actionPointer('jump',702,'pointerup');
          if(coordinate==='visible-center')actionPointer('jump',703,'pointerdown');
          else {
            const b=mobile._box('jump');
            mobile.els.jump.dispatchEvent(new PointerEvent('pointerdown',{pointerId:703,pointerType:'touch',bubbles:true,cancelable:true,clientX:b.x,clientY:b.y}));
          }
          const routed=mobile._ptr.get(703)?JSON.parse(JSON.stringify(mobile._ptr.get(703))):null;
          advance(1/120);advance(1/120);for(let i=0;i<60;i++)advance(1/60);
          heldSnapshot('controlled-after-repress',{coordinate});
          const result={coordinate,scaleBeforeRelease:scale,before,after:actionDodges,routed,
            expectedSecondDodge:2,pointerEvents:heldTimeline.slice(start).filter(t=>t.label.startsWith('pointer-'))};
          actionPointer('jump',703,'pointerup');actionPointer('fire',701,'pointerup');advance(1/60);
          return result;
        },coordinate);
        entry.animatedRepress.push(row);
      }
      await page.evaluate(() => { mobile.reset(); heldPhase='native-mouse-control'; });
      const mousePoint=await page.evaluate(()=>mobile._box('fire'));
      await page.mouse.click(mousePoint.x,mousePoint.y);
      entry.nativeMouseControl=await page.evaluate(()=>({pointers:mobile._ptr.size,fire:mobile.buttons.fire,pressed:[...mobile.pressed]}));
      assert.deepEqual(entry.nativeMouseControl,{pointers:0,fire:false,pressed:[]},'native mouse is not reclassified as touch');
      // Bound the diagnostic; later unrelated cases remain unobserved.
      continue;`);
// Preserve partial trace if an earlier unchanged assertion fails.
once('    } finally { await context.close(); }', `    } finally {
      const entry=report.cases.at(-1),page=context.pages()[0];
      if(entry&&page) try { entry.heldActionTimeline=await page.evaluate(()=>window.heldTimeline||[]); } catch(error) { entry.timelineReadError=String(error); }
      await context.close();
    }`);
once("const report = { status: 'running',", "const report = { diagnostic: 'passive-held-input-plus-controlled-animated-repress', originalVerifierGitSHA: '"+sha+"', limitedScope: 'unchanged original action assertions plus separate natural-CSS animated re-press and logical-coordinate control; later cases unobserved', status: 'running',");
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,text);
console.log(JSON.stringify({source,out,originalVerifierGitSHA:sha,instrumentedSHA256:crypto.createHash('sha256').update(text).digest('hex')}));
