const { chromium } = require('playwright'); const SC=process.cwd(); const fs=require('fs');
const waitFb=async(p)=>{ for(let i=0;i<120;i++){ await p.waitForTimeout(250); if(!(await p.locator('#screenFb').isHidden())) return true; } return false; };
(async()=>{
  const [wav,word]=process.argv.slice(2);
  const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+SC+'/'+wav+'.wav']});
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
  const p=await ctx.newPage(); const logs=[]; p.on('pageerror',e=>logs.push('PAGEERROR '+e.message)); p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') logs.push('CONSOLE '+m.text()); });
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(300);
  await p.evaluate(w=>{ cur=parseWords(w)[0]; renderWord(); },word);
  console.log('Luft-Check-Knopf:', await p.locator('#airBtn').innerText());
  await p.click('#rec'); await waitFb(p); await p.waitForTimeout(500);
  console.log(`[${word}] ${await p.locator('#verdict').innerText()} | ${await p.locator('#fbText').innerText()} | Werte: ${await p.locator('#vals').innerText()}`);
  await p.screenshot({path:SC+'/fb_'+wav+'.png'});
  console.log('Markier-Knopf aktiv:', !(await p.locator('#markTher').isDisabled()));
  await p.click('#markTher'); await p.waitForTimeout(200); console.log('nach Tippen:', await p.locator('#markTher').innerText());
  await p.click('#again'); await waitFb(p); await p.waitForTimeout(500); console.log('2. Versuch:', await p.locator('#verdict').innerText(), '| Knopf:', await p.locator('#markTher').innerText());
  await p.evaluate(()=>show('screenSet')); await p.click('#openLog'); await p.waitForTimeout(300);
  console.log('Protokoll:', await p.locator('#logInfo').innerText(), '| Einträge:', await p.locator('.logitem').count());
  await p.screenshot({path:SC+'/log_'+wav+'.png'});
  await p.click('#zipMake'); await p.waitForTimeout(300); console.log('ZIP-Info:', await p.locator('#zipInfo').innerText());
  const [dl]=await Promise.all([p.waitForEvent('download'), p.click('#zipLink')]); const out=SC+'/export_'+wav+'.zip'; await dl.saveAs(out); console.log('Download:', dl.suggestedFilename());
  // Schalter aus/an pro Wort, bleibt gespeichert
  await p.evaluate(()=>show('screenMain')); await p.click('#airBtn'); console.log('nach Ausschalten:', await p.locator('#airBtn').innerText(), '|', await p.locator('#status').innerText());
  await p.reload(); await p.waitForTimeout(300); await p.evaluate(w=>{ cur=parseWords(w)[0]; renderWord(); },word); console.log('nach Neuladen:', await p.locator('#airBtn').innerText());
  console.log(logs.join('\n')||'(keine Fehler)'); await b.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
