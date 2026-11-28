const R=require('./ref.js'); const {C}=R; const sr=22050;
function voice({dur=2.2,f0=(t)=>100,amp=(t)=>0.15+0.45*t/dur,breaks=[],rough=0,noise=0.0006,lead=0.6,tail=1.0}){
  const n=Math.round((lead+dur+tail)*sr), x=new Float32Array(n); let ph=0;
  for(let i=0;i<n;i++){ const t=i/sr-lead; let v=(Math.random()-0.5)*2*noise; if(t>=0&&t<=dur){
      ph+=2*Math.PI*f0(t)/sr; let s=0; for(let h=1;h<=14;h++) s+=Math.sin(h*ph)/h; // gleichmäßige Harmonische (Formanten egal)
      let a=amp(t)*(1+rough*Math.sin(2*Math.PI*4*t)); const br=breaks.find(([a0,b0])=>t>=a0&&t<b0); 
      if(br) v+=(Math.random()-0.5)*2*a*0.5; else v+=a*0.35*s;
      const edge=Math.min(1,t/0.04,(dur-t)/0.04); v*=Math.max(0,edge); }
    x[i]=v; } return x; }
const run=(label,x,expect,syl=1)=>{ const t=C.analyzeTake(x,sr,C.SETTINGS); const j=C.judge(t,{syl},C.LIMITS); const p=t.valid&&t.profile;
  console.log(`\n[${label}] erwartet: ${expect}\n  -> ${j.pass?'BESTANDEN':'nicht bestanden'} ${t.valid?`| Dauer ${t.slowDur.toFixed(2)} Pitch: Sprünge ${p&&p.pitch?p.pitch.jumps:'-'} Wackeln ${p&&p.pitch?p.pitch.wobble.toFixed(2):'-'} Drift ${p&&p.pitch&&p.pitch.drift!=null?p.pitch.drift.toFixed(1):'-'}st | längste Lücke ${p?p.breakMax.toFixed(2):'-'}s Ruckeln ${p?p.rough.toFixed(2):'-'} | Anstieg ${p?p.slope.toFixed(1):'-'}dB/s`:''}`);
  j.items.forEach(i=>console.log('     '+(i.ok?'✓':'✗')+' '+i.text)); };
module.exports={voice,run};
if(require.main===module){
run('S1 sauber: ruhige Tonhöhe, Lautstärke steigt',voice({}),'bestanden');
run('S2 Tonsprung +5 Halbtöne bei 1,0 s',voice({f0:(t)=>t<1?100:133}),'Tonhöhe springt');
run('S3 Tonhöhe sackt ab (120→75 Hz, ca. −8 Halbtöne)',voice({f0:(t)=>120*Math.pow(75/120,t/2.2)}),'Tonhöhe fällt / Luft knapp');
run('S4 Stimmabbruch 250 ms bei 1,0 s',voice({breaks:[[1.0,1.25]]}),'Stimme setzt aus');
run('S5 Lautstärke ruckelt (±40 % bei 4 Hz)',voice({rough:0.4}),'Lautstärke ruckelt');
run('S6 flache Lautstärke (kein Anschwellen)',voice({amp:(t)=>0.4}),'steigt nicht an');
}
