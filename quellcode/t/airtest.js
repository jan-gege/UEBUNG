const {voice}=require('./synth.js'); const R=require('./ref.js'); const {C}=R; const sr=22050;
function withBreath(D, gap=0, lvl=0.02, softStart=false){
  const lead=0.9; const x=voice({lead, amp: softStart?(t)=>0.03+0.5*Math.min(1,t/1.2):undefined});
  let p=0; for(let i=Math.round((lead-D-gap)*sr); i<Math.round((lead-gap)*sr); i++){ const r=(Math.random()-0.5)*2; const hp=r-p; p=r; const t=(i/sr-(lead-D-gap))/D; x[i]+=hp*lvl*Math.min(1,t/0.05,(1-t)/0.02+0.0001); }
  return x; }
const cases=[['ohne Luft',0],['ohne Luft, sehr weicher Einsatz',0,0,0.02,true],['0,1 s Luft',0.1],['0,3 s Luft',0.3],['0,5 s Luft',0.5],['0,5 s Luft, leise',0.5,0,0.008],['Einatmen, 0,2 s Pause, dann Stimme',0.4,0.2]];
for(const [lab,D,gap=0,lvl=0.02,soft=false] of cases){ const t=C.analyzeTake(withBreath(D,gap,lvl,soft),sr,C.SETTINGS);
  const j=C.judge(t,{syl:1,airCheck:true,ref:null},C.LIMITS); const it=j.items.find(i=>i.key==='airstart');
  console.log(lab.padEnd(36),'gemessen',t.airDur.toFixed(2),'s ->',it?(it.ok?'ok':'HINWEIS'):'(keine Prüfung)'); }
