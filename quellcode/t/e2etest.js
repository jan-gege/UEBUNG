const { chromium } = require('playwright'); const fs=require('fs'); const SC=process.cwd();
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage(); const logs=[]; p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto('file://'+require('path').resolve(__dirname,'../../index.html')+''); await p.waitForTimeout(300);
  await p.click('#gear'); await p.click('#openTest');
  const files=fs.readdirSync('testset').sort().map(f=>SC+'/testset/'+f);
  await p.setInputFiles('#testFiles',files);
  // Wort aus dem Dateinamen (Ber_lin -> Ber|lin) und Markierung aus dem Präfix
  await p.evaluate(()=>{ testItems.forEach(it=>{ const base=it.file.name.replace(/\.wav$/,''); const w=base.split('_').slice(base.startsWith('korrekt')?1:2).join('|'); it.word=w; it.label=base.startsWith('korrekt')?'korrekt':'fehlerhaft'; }); renderTest(); });
  await p.click('#testRun'); await p.waitForFunction(()=>/Richtig erkannt/.test(document.getElementById('testSummary').textContent),null,{timeout:120000});
  console.log(await p.locator('#testSummary').innerText());
  const rows=await p.evaluate(()=>testItems.map(it=>it.file.name.padEnd(30)+' '+it.result)); rows.forEach(r=>console.log('  '+r));
  await p.screenshot({path:SC+'/v7_test.png',fullPage:false});
  console.log(logs.join('\n')||'(keine Fehler)'); await b.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
