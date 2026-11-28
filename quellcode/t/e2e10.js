const { chromium } = require('playwright'); const SC=process.cwd();
const waitFb=async(p)=>{ for(let i=0;i<120;i++){ await p.waitForTimeout(250); if(!(await p.locator('#screenFb').isHidden())) return true; } return false; };
(async()=>{
  const [wav,word,shot]=process.argv.slice(2);
  const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+SC+'/'+wav+'.wav']});
  const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})).newPage(); const logs=[]; p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto('file://'+require('path').resolve(__dirname,'../../index.html')+''); await p.waitForTimeout(300);
  await p.evaluate(w=>{ cur=parseWords(w)[0]; renderWord(); },word);
  await p.click('#rec'); await waitFb(p); await p.waitForTimeout(400);
  console.log(`[${word}] ${await p.locator('#verdict').innerText()} | ${await p.locator('#fbText').innerText()} | Werte: ${await p.locator('#vals').innerText()}`);
  console.log('   Scrollen nötig:', await p.evaluate(()=>document.documentElement.scrollHeight>window.innerHeight)?'JA':'nein');
  if(shot) await p.screenshot({path:SC+'/'+shot+'.png'});
  await p.click('#again'); await waitFb(p); console.log('   Nochmal (automatisch):',await p.locator('#verdict').innerText());
  console.log(logs.join('\n')||'   (keine Fehler)'); await b.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
