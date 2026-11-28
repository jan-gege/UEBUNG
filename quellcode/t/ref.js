const fs=require('fs'); const set=require('./setdef.js');
const code=fs.readFileSync('core2.js','utf8');
const C=new Function(set+'\n'+code+'\nreturn {SETTINGS,LIMITS,LIMITS_NORMAL,analyzeTake,judge};')();
const segs=JSON.parse(fs.readFileSync('segs.json')); const sr=22050;
const load=f=>{const b=fs.readFileSync(f+'.f32');return new Float32Array(b.buffer,b.byteOffset,b.length/4);};
const X={silben:load('silben'),antwort:load('antwort')};
const an=(n,k)=>{const s=segs[n][k];return C.analyzeTake(X[n].subarray(Math.floor(s.start*sr),Math.ceil(s.end*sr)),sr,C.SETTINGS);};
module.exports={C,an,X,segs,sr};
if(require.main===module){
const row=(l,a)=>console.log(l.padEnd(9),a.valid?`voiced ${a.voiced.toFixed(2)} slow ${a.slowDur.toFixed(2)} rest ${a.restDur.toFixed(2)} restFlux ${a.restFlux==null?'  - ':a.restFlux.toFixed(0).padStart(4)} rise ${(a.rise*1000).toFixed(0).padStart(4)}ms overshoot ${a.overshoot==null?'-':a.overshoot.toFixed(1)} breaks ${a.breaks.length}`:'invalid '+a.reason);
console.log('--- gedehnt (Silben)');[[5,'Fra'],[7,'Pro'],[9,'Krie'],[11,'Bla'],[13,'Glei'],[16,'Tra'],[18,'frei'],[20,'Bru'],[22,'Dra'],[24,'Flo'],[26,'Schlie'],[28,'Gra'],[30,'Troll']].forEach(([k,l])=>row(l,an('silben',k)));
console.log('--- gedehnt (Wörter)');[[1,'Fünf?'],[3,'Berlin'],[6,'Milch']].forEach(([k,l])=>row(l,an('antwort',k)));
console.log('--- normal');[15,17,19,21,23,25,27,29,31,32,33,35,36,38,39,41,42,43,45,46,47,48,49,50,51].forEach(k=>row('n'+k,an('silben',k)));
}
