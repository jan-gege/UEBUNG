const R=require('./ref.js'); const {C,X,segs,sr}=R;
const clips=[['fra','silben',5],['pro','silben',7],['krie','silben',9],['bla','silben',11],['glei','silben',13],['tra','silben',16],['frei','silben',18],['bru','silben',20],['dra','silben',22],['flo','silben',24],['schlie','silben',26],['gra','silben',28],['troll','silben',30],['berlin','antwort',3],['milch','antwort',6]];
const out={};
const an=(y)=>C.analyzeTake(y,sr,C.SETTINGS);
const add=(w,t)=>{ const p=t.profile; const curve=[]; for(let s=-0.15;s<=3.2001;s+=0.05){ const i=Math.round((t.tOn+s-t.t0)/t.dt); curve.push(i>=0&&i<t.n?Math.round(100*t.A[i]/t.Amax):0);} out[w]={slowDur:+t.slowDur.toFixed(2),voiced:+t.voiced.toFixed(2),start:+p.startRel.toFixed(1),end:+p.endRel.toFixed(1),slope:+p.slope.toFixed(1),air:t.airDur==null?null:+t.airDur.toFixed(2),curve}; };
for(const [w,f,k] of clips){ const s=segs[f][k]; add(w,an(X[f].subarray(Math.floor(s.start*sr),Math.ceil(s.end*sr)))); }
add('zwei',an(X.antwort.subarray(Math.floor(29.66*sr),Math.ceil(33.30*sr))));
require('fs').writeFileSync('refwords.json',JSON.stringify(out)); console.log(Object.keys(out).length,'Wörter;',JSON.stringify(out).length,'Zeichen'); console.log('zwei',JSON.stringify({...out.zwei,curve:undefined}));
