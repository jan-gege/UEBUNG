const { chromium } = require('playwright'); const SC=process.cwd();
const waitFb=async(p)=>{ for(let i=0;i<120;i++){ await p.waitForTimeout(250); if(!(await p.locator('#screenFb').isHidden())) return true; } return false; };
(async()=>{
  const [wav,word,rounds]=process.argv.slice(2);
  const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+SC+'/'+wav+'.wav']});
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await ctx.newPage(); const logs=[]; p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto('file://'+require('path').resolve(__dirname,'../../index.html')+''); await p.waitForTimeout(300);
  await p.evaluate(w=>{ cur=parseWords(w)[0]; renderWord(); },word);
  await p.click('#rec'); let ok=await waitFb(p);
  console.log(`Runde 1 (Klick auf Sprechen): ${ok?await p.locator('#verdict').innerText()+' | '+await p.locator('#fbText').innerText():'KEINE RÜCKMELDUNG'}`);
  for(let r=2;r<=Number(rounds||1);r++){
    const btn = r%2===0 ? '#again' : '#next';
    if(btn==='#next') { await p.evaluate(w=>{ deck=[]; words=parseWords(w); },word); }
    await p.click(btn); await p.waitForTimeout(200);
    const st=await p.locator('#rec').innerText();
    ok=await waitFb(p);
    console.log(`Runde ${r} (${btn==='#again'?'Nochmal':'Nächstes Wort'}, ohne Sprechen-Klick; Knopf danach: „${st}“): ${ok?await p.locator('#verdict').innerText():'KEINE RÜCKMELDUNG'}`);
  }
  console.log(logs.join('\n')||'(keine Fehler)'); await b.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
