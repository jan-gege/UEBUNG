const R=require('./ref.js'); const fs=require('fs'); const {X,segs,sr}=R;
const noise=X.silben.subarray(Math.floor(58.5*sr),Math.floor(60.0*sr)), noise2=X.antwort.subarray(Math.floor(52.4*sr),Math.floor(54.0*sr));
function wav(name,parts){ const tot=parts.reduce((n,p)=>n+p.length,0), b=Buffer.alloc(44+tot*2); b.write('RIFF',0); b.writeUInt32LE(36+tot*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(tot*2,40); let o=44; for(const p of parts) for(let i=0;i<p.length;i++){ b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(p[i]*32767))),o); o+=2; } fs.writeFileSync('testset/'+name+'.wav',b); }
const cut=(f,k)=>{const s=segs[f][k];return X[f].subarray(Math.floor(s.start*sr),Math.ceil(s.end*sr));};
const ok=[['Fra','silben',5],['Pro','silben',7],['Krie','silben',9],['Bla','silben',11],['Glei','silben',13],['Tra','silben',16],['Frei','silben',18],['Bru','silben',20],['Dra','silben',22],['Flo','silben',24],['Schlie','silben',26],['Gra','silben',28],['Troll','silben',30],['Ber_lin','antwort',3],['Milch','antwort',6]];
for(const [w,f,k] of ok) wav('korrekt_'+w,f==='antwort'?[noise2,cut(f,k),noise2,noise2]:[noise.subarray(0,Math.round(0.6*sr)),cut(f,k),noise]);
// fehlerhaft: normal schnell gesprochene Silben (Wort steht im Dateinamen)
const fast=[[15,'Tra'],[17,'Frei'],[19,'Bru'],[21,'Dra'],[23,'Flo'],[25,'Schlie'],[27,'Gra'],[29,'Troll'],[32,'Bla'],[51,'Glei']];
for(const [k,w] of fast) wav('fehler_schnell_'+w,[noise.subarray(0,Math.round(0.6*sr)),cut('silben',k),noise]);
// fehlerhaft: Fra gedehnt, aber als zweisilbiges Wort (Rest fehlt), zwei gedehnte Silben (ganzes Wort)
wav('fehler_restfehlt_Ber_lin',[noise.subarray(0,Math.round(0.6*sr)),cut('silben',5),noise]);
console.log('ok', fs.readdirSync('testset').length,'Dateien');
